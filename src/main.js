import "./style.css";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { cats } from "./cats.js";
import { auth, db } from "./firebase.js";

const ADMIN_EMAIL = "silverhyeok.dev@gmail.com";

const elements = {
  title: document.querySelector("#cat-title"),
  number: document.querySelector("#cat-number"),
  photo: document.querySelector("#cat-photo"),
  sticker: document.querySelector("#cat-sticker"),
  caption: document.querySelector("#cat-caption"),
  nextButton: document.querySelector("#next-cat"),
  shareButton: document.querySelector("#share-cat"),
  downloadButton: document.querySelector("#download-cat"),
  shareFeedback: document.querySelector("#share-feedback"),
  form: document.querySelector("#comment-form"),
  nickname: document.querySelector("#nickname"),
  message: document.querySelector("#message"),
  messageCount: document.querySelector("#message-count"),
  formFeedback: document.querySelector("#form-feedback"),
  comments: document.querySelector("#comments"),
  commentCount: document.querySelector("#comment-count"),
  catTotal: document.querySelector("#cat-total"),
  adminAuth: document.querySelector("#admin-auth"),
  authStatus: document.querySelector("#auth-status"),
  guestbookFeedback: document.querySelector("#guestbook-feedback"),
  chaosStart: document.querySelector("#chaos-game-start"),
  chaosGame: document.querySelector("#chaos-game"),
  chaosClose: document.querySelector("#chaos-game-close"),
  chaosTargets: document.querySelector("#chaos-targets"),
  chaosTime: document.querySelector("#chaos-time"),
  chaosScore: document.querySelector("#chaos-score"),
  chaosResult: document.querySelector("#chaos-result"),
  chaosRank: document.querySelector("#chaos-rank"),
  chaosSummary: document.querySelector("#chaos-summary"),
  chaosReplay: document.querySelector("#chaos-replay"),
  chaosResultClose: document.querySelector("#chaos-result-close"),
  dogEasterEgg: document.querySelector("#dog-easter-egg"),
  dogEasterEggClose: document.querySelector("#dog-easter-egg-close"),
  jumpscare: document.querySelector("#idle-jumpscare"),
  jumpscareClose: document.querySelector("#idle-jumpscare-close"),
  musicEasterEgg: document.querySelector("#music-easter-egg"),
  musicClose: document.querySelector("#music-easter-egg-close"),
  musicFrame: document.querySelector("#music-easter-egg-frame"),
};

let currentCat = null;
let stopListeningToComments = null;
let commentLoadTimer = null;
let latestComments = [];
let commentsLoaded = false;
let currentUser = null;
let isAdmin = false;
let authCheckId = 0;
let chaosTimer = null;
let chaosScore = 0;
let chaosSeconds = 10;
let chaosActive = false;
let focusBeforeChaos = null;
let dogEasterEggDismissed = false;
let lastPointerY = Number.NEGATIVE_INFINITY;

const DOG_EASTER_EGG_EDGE = 72;
let idleTimer = null;
let idleTriggered = false;
let clickCount = 0;
let audioContext = null;
let focusBeforeEasterEgg = null;

const IDLE_DELAY = 10_000;
const MUSIC_VIDEO_URL = "https://www.youtube.com/embed/0tOXxuLcaog?autoplay=1&rel=0";
let roamingMoveTimer = null;
let roamingPressTimer = null;
let roamingIsHome = window.localStorage.getItem("roaming-cat-home") === "true";

const roamingCatState = {
  cat: null,
  image: null,
  home: null,
  x: 0,
  y: 0,
};

function getInitialCat() {
  const serverSelectedId = document.querySelector('meta[name="selected-cat"]')?.content;
  const requestedId = new URLSearchParams(window.location.search).get("cat") || serverSelectedId;
  const requestedCat = cats.find((cat) => cat.id === requestedId);
  const navigation = window.performance.getEntriesByType("navigation")[0];

  if (navigation?.type === "reload") {
    return getRandomCat(requestedCat?.id);
  }

  return requestedCat ?? getRandomCat();
}

function getRandomCat(excludedId) {
  const candidates = cats.filter((cat) => cat.id !== excludedId);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function showCat(cat, { updateUrl = true } = {}) {
  currentCat = cat;
  const catIndex = cats.findIndex((item) => item.id === cat.id) + 1;

  elements.photo.classList.remove("is-visible");
  elements.photo.onload = () => elements.photo.classList.add("is-visible");
  elements.photo.src = cat.image;
  elements.photo.alt = cat.alt;
  elements.title.textContent = cat.title;
  elements.number.textContent = `#${String(catIndex).padStart(2, "0")}`;
  elements.number.setAttribute("aria-label", `${cats.length}마리 중 ${catIndex}번째 고양이`);
  elements.sticker.textContent = cat.sticker;
  elements.caption.textContent = cat.caption;
  elements.shareFeedback.textContent = "";
  elements.formFeedback.textContent = "";
  elements.guestbookFeedback.textContent = "";

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("cat", cat.id);
    window.history.replaceState({ catId: cat.id }, "", url);
  }

  listenToComments(cat.id);
}

function listenToComments(catId) {
  stopListeningToComments?.();
  window.clearTimeout(commentLoadTimer);
  latestComments = [];
  commentsLoaded = false;
  elements.commentCount.textContent = "…";
  elements.comments.setAttribute("aria-busy", "true");
  elements.comments.replaceChildren(createStatus("방명록을 펼치는 중…", true));

  commentLoadTimer = window.setTimeout(() => {
    elements.comments.replaceChildren(
      createStatus("연결이 늦어지고 있습니다. Firestore가 활성화되어 있는지 확인해주세요."),
    );
  }, 8000);

  const commentsQuery = query(
    collection(db, "photos", catId, "comments"),
    orderBy("createdAt", "desc"),
    limit(50),
  );

  stopListeningToComments = onSnapshot(
    commentsQuery,
    (snapshot) => {
      window.clearTimeout(commentLoadTimer);
      elements.comments.setAttribute("aria-busy", "false");
      elements.commentCount.textContent = String(snapshot.size);
      latestComments = snapshot.docs.map((comment) => ({ comment, photoId: catId }));
      commentsLoaded = true;
      renderComments();
    },
    (error) => {
      window.clearTimeout(commentLoadTimer);
      console.error("Firestore comments error:", error);
      elements.commentCount.textContent = "0";
      elements.comments.setAttribute("aria-busy", "false");
      elements.comments.replaceChildren(
        createStatus("방명록을 열 수 없습니다. Firestore 규칙 배포를 확인해주세요."),
      );
    },
  );
}

function renderComments() {
  if (!commentsLoaded) return;

  if (latestComments.length === 0) {
    elements.comments.replaceChildren(
      createStatus("아직 조용하네요. 첫 흔적을 남겨보세요!"),
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  latestComments.forEach(({ comment, photoId }) => {
    fragment.append(createComment(comment, photoId));
  });
  elements.comments.replaceChildren(fragment);
}

function createComment(comment, photoId) {
  const data = comment.data();
  const article = document.createElement("article");
  article.className = "comment";

  const meta = document.createElement("div");
  meta.className = "comment-meta";

  const author = document.createElement("strong");
  author.textContent = data.nickname || "익명 집사";

  const time = document.createElement("time");
  const date = data.createdAt?.toDate?.();
  time.textContent = date
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(date)
    : "방금 전";
  if (date) time.dateTime = date.toISOString();

  const metaActions = document.createElement("div");
  metaActions.className = "comment-meta-actions";
  metaActions.append(time);

  if (isAdmin) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "comment-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.setAttribute("aria-label", `${data.nickname || "익명 집사"}의 댓글 삭제`);
    deleteButton.addEventListener("click", () => {
      void deleteComment(photoId, comment.id, deleteButton);
    });
    metaActions.append(deleteButton);
  }

  const message = document.createElement("p");
  message.textContent = data.message;

  meta.append(author, metaActions);
  article.append(meta, message);
  return article;
}

async function deleteComment(photoId, commentId, button) {
  if (!currentUser || !isAdmin) {
    elements.guestbookFeedback.textContent = "관리자만 댓글을 삭제할 수 있습니다.";
    return;
  }

  if (!window.confirm("이 댓글을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.")) return;

  button.disabled = true;
  button.textContent = "삭제 중…";
  elements.guestbookFeedback.textContent = "";

  try {
    await deleteDoc(doc(db, "photos", photoId, "comments", commentId));
    elements.guestbookFeedback.textContent = "댓글을 삭제했습니다.";
  } catch (error) {
    console.error("Firestore delete error:", error);
    elements.guestbookFeedback.textContent =
      error.code === "permission-denied"
        ? "관리자 삭제 권한을 확인해주세요."
        : "댓글을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.";
    button.disabled = false;
    button.textContent = "삭제";
  }
}

function setAuthUi(state, user = null) {
  const label = elements.adminAuth.querySelector("span");
  elements.adminAuth.disabled = state === "checking" || state === "working";

  if (state === "admin") {
    elements.authStatus.textContent = `관리자 · ${user.displayName || user.email}`;
    elements.authStatus.classList.add("is-admin");
    label.textContent = "로그아웃";
    return;
  }

  elements.authStatus.classList.remove("is-admin");

  if (state === "unauthorized") {
    elements.authStatus.textContent = "관리자 권한 없음";
    label.textContent = "로그아웃";
  } else if (state === "checking") {
    elements.authStatus.textContent = "권한 확인 중…";
    label.textContent = "확인 중…";
  } else if (state === "working") {
    elements.authStatus.textContent = user ? "로그아웃 중…" : "Google 연결 중…";
    label.textContent = user ? "로그아웃 중…" : "연결 중…";
  } else {
    elements.authStatus.textContent = "관리자 전용";
    label.textContent = "관리자 로그인";
  }
}

onAuthStateChanged(auth, async (user) => {
  const checkId = ++authCheckId;
  currentUser = user;
  isAdmin = false;
  elements.guestbookFeedback.textContent = "";

  if (!user) {
    setAuthUi("signed-out");
    renderComments();
    return;
  }

  setAuthUi("checking", user);
  renderComments();

  if (checkId !== authCheckId) return;
  isAdmin = user.emailVerified && user.email?.toLowerCase() === ADMIN_EMAIL;
  setAuthUi(isAdmin ? "admin" : "unauthorized", user);
  if (!isAdmin) {
    elements.guestbookFeedback.textContent = "이 Google 계정에는 관리자 권한이 없습니다.";
  }

  renderComments();
});

elements.adminAuth.addEventListener("click", async () => {
  const user = auth.currentUser;
  setAuthUi("working", user);
  elements.guestbookFeedback.textContent = "";

  try {
    if (user) {
      await signOut(auth);
      return;
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Firebase Auth error:", error);
    setAuthUi(user ? (isAdmin ? "admin" : "unauthorized") : "signed-out", user);
    if (error.code !== "auth/popup-closed-by-user") {
      elements.guestbookFeedback.textContent = "Google 로그인에 실패했습니다. 다시 시도해주세요.";
    }
  }
});

function createStatus(message, loading = false) {
  const state = document.createElement("div");
  state.className = "comments-state";
  if (loading) {
    const loader = document.createElement("span");
    loader.className = "loader";
    loader.setAttribute("aria-hidden", "true");
    state.append(loader);
  }
  const text = document.createElement("p");
  text.textContent = message;
  state.append(text);
  return state;
}

function getRoamingBounds() {
  const catSize = roamingCatState.cat?.offsetWidth || 112;
  const padding = 18;
  return {
    maxX: Math.max(padding, window.innerWidth - catSize - padding),
    maxY: Math.max(padding + 72, window.innerHeight - catSize - padding),
    minX: padding,
    minY: padding + 72,
  };
}

function pickRoamingCatImage() {
  const cat = cats[Math.floor(Math.random() * cats.length)];
  roamingCatState.image.src = cat.image;
  roamingCatState.image.alt = "";
}

function placeRoamingCat({ instant = false } = {}) {
  if (!roamingCatState.cat || roamingIsHome) return;

  const bounds = getRoamingBounds();
  const nextX = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
  const nextY = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
  const direction = nextX >= roamingCatState.x ? 1 : -1;
  const rotation = -9 + Math.random() * 18;

  roamingCatState.x = nextX;
  roamingCatState.y = nextY;
  roamingCatState.cat.style.setProperty("--roaming-x", `${nextX}px`);
  roamingCatState.cat.style.setProperty("--roaming-y", `${nextY}px`);
  roamingCatState.cat.style.setProperty("--roaming-direction", direction);
  roamingCatState.cat.style.setProperty("--roaming-rotate", `${rotation}deg`);
  roamingCatState.cat.classList.toggle("is-instant", instant);
}

function scheduleRoamingCat() {
  window.clearInterval(roamingMoveTimer);
  if (roamingIsHome) return;

  roamingMoveTimer = window.setInterval(() => {
    if (Math.random() > 0.72) pickRoamingCatImage();
    placeRoamingCat();
  }, 2200);
}

function setRoamingCatHome(isHome) {
  roamingIsHome = isHome;
  window.localStorage.setItem("roaming-cat-home", String(isHome));
  roamingCatState.cat.classList.toggle("is-home", isHome);
  roamingCatState.home.classList.toggle("is-waiting", isHome);
  roamingCatState.home.setAttribute(
    "aria-label",
    isHome ? "Call roaming cat out of the house" : "Roaming cat house",
  );

  if (isHome) {
    window.clearInterval(roamingMoveTimer);
    window.clearTimeout(roamingPressTimer);
    return;
  }

  pickRoamingCatImage();
  placeRoamingCat({ instant: true });
  window.requestAnimationFrame(() => roamingCatState.cat.classList.remove("is-instant"));
  scheduleRoamingCat();
}

function createRoamingCat() {
  const catButton = document.createElement("button");
  catButton.className = "roaming-cat";
  catButton.type = "button";
  catButton.setAttribute("aria-label", "Hold to send the roaming cat home");

  const image = document.createElement("img");
  image.width = 132;
  image.height = 132;
  image.draggable = false;
  catButton.append(image);

  const homeButton = document.createElement("button");
  homeButton.className = "cat-home-toggle";
  homeButton.type = "button";
  homeButton.innerHTML = `
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M7 24 24 10l17 14" />
      <path d="M13 22v18h22V22" />
      <path d="M20 40V29h8v11" />
    </svg>
  `;

  roamingCatState.cat = catButton;
  roamingCatState.image = image;
  roamingCatState.home = homeButton;
  document.body.append(catButton, homeButton);

  catButton.addEventListener("pointerdown", () => {
    if (roamingIsHome) return;
    window.clearTimeout(roamingPressTimer);
    catButton.classList.add("is-pressing");
    roamingPressTimer = window.setTimeout(() => setRoamingCatHome(true), 620);
  });

  ["pointerup", "pointerleave", "pointercancel", "lostpointercapture"].forEach((eventName) => {
    catButton.addEventListener(eventName, () => {
      window.clearTimeout(roamingPressTimer);
      catButton.classList.remove("is-pressing");
    });
  });

  homeButton.addEventListener("click", () => {
    if (roamingIsHome) setRoamingCatHome(false);
  });

  window.addEventListener("resize", () => placeRoamingCat({ instant: true }));
  pickRoamingCatImage();
  setRoamingCatHome(roamingIsHome);
}

function positionChaosCat(target) {
  const compact = window.matchMedia("(max-width: 560px)").matches;
  target.style.left = `${16 + Math.random() * 68}%`;
  target.style.top = `${compact ? 23 + Math.random() * 55 : 20 + Math.random() * 60}%`;
  target.style.setProperty("--chaos-x", `${compact ? -18 + Math.random() * 36 : -45 + Math.random() * 90}px`);
  target.style.setProperty("--chaos-y", `${compact ? -22 + Math.random() * 44 : -35 + Math.random() * 70}px`);
  target.style.setProperty("--chaos-spin", `${-18 + Math.random() * 36}deg`);
  target.style.setProperty("--chaos-speed", `${0.75 + Math.random() * 0.8}s`);
}

function refreshChaosCat(target) {
  const cat = cats[Math.floor(Math.random() * cats.length)];
  const image = target.querySelector("img");
  image.src = cat.image;
  image.alt = "";
  target.disabled = false;
  target.classList.remove("is-caught");
  target.setAttribute("aria-label", `${cat.title} 검거하기`);
  positionChaosCat(target);
}

function catchChaosCat(target) {
  if (!chaosActive || target.disabled) return;
  target.disabled = true;
  target.classList.add("is-caught");
  elements.chaosGame.classList.remove("is-hit");
  void elements.chaosGame.offsetWidth;
  elements.chaosGame.classList.add("is-hit");
  chaosScore += 1;
  elements.chaosScore.textContent = String(chaosScore);

  const scoreBurst = document.createElement("span");
  scoreBurst.className = "chaos-score-burst";
  scoreBurst.textContent = "🐾 +1 냥";
  scoreBurst.setAttribute("aria-hidden", "true");
  target.append(scoreBurst);

  window.setTimeout(() => {
    scoreBurst.remove();
    if (chaosActive) refreshChaosCat(target);
  }, 340);

  window.setTimeout(() => elements.chaosGame.classList.remove("is-hit"), 190);
}

function createChaosCat() {
  const target = document.createElement("button");
  target.className = "chaos-cat";
  target.type = "button";

  const image = document.createElement("img");
  image.width = 112;
  image.height = 112;
  image.draggable = false;
  target.append(image);
  target.addEventListener("click", () => catchChaosCat(target));
  refreshChaosCat(target);
  return target;
}

function getChaosRank(score) {
  if (score >= 22) return ["전설의 냥특수대", "고양이들이 당신 이름만 들어도 상자 밑으로 숨습니다."];
  if (score >= 14) return ["프로 집사 요원", "간식 봉지 하나 없이 이 정도라니, 제법입니다."];
  if (score >= 7) return ["소파 수사관", "절반은 잡았고 절반은 커튼 위로 도주했습니다."];
  return ["고양이 측 완승", "당신이 고양이를 잡은 게 아니라 고양이가 놀아준 것입니다."];
}

function finishChaosGame() {
  if (!chaosActive) return;
  chaosActive = false;
  window.clearInterval(chaosTimer);
  elements.chaosTargets.replaceChildren();

  const [rank, summary] = getChaosRank(chaosScore);
  elements.chaosRank.textContent = rank;
  elements.chaosSummary.textContent = `10초 동안 ${chaosScore}마리 검거. ${summary}`;
  elements.chaosResult.hidden = false;
  elements.chaosReplay.focus();
}

function startChaosGame() {
  if (elements.chaosGame.hidden) focusBeforeChaos = document.activeElement;
  window.clearInterval(chaosTimer);
  chaosScore = 0;
  chaosSeconds = 10;
  chaosActive = true;
  elements.chaosScore.textContent = "0";
  elements.chaosTime.textContent = "10";
  elements.chaosResult.hidden = true;
  elements.chaosTargets.replaceChildren();
  elements.chaosGame.hidden = false;
  document.body.classList.add("is-playing-chaos");

  const fragment = document.createDocumentFragment();
  const targetCount = window.matchMedia("(max-width: 560px)").matches ? 5 : 6;
  for (let index = 0; index < targetCount; index += 1) fragment.append(createChaosCat());
  elements.chaosTargets.append(fragment);
  elements.chaosClose.focus();

  chaosTimer = window.setInterval(() => {
    chaosSeconds -= 1;
    elements.chaosTime.textContent = String(chaosSeconds);
    if (chaosSeconds <= 0) finishChaosGame();
  }, 1000);
}

function closeChaosGame() {
  chaosActive = false;
  window.clearInterval(chaosTimer);
  elements.chaosTargets.replaceChildren();
  elements.chaosResult.hidden = true;
  elements.chaosGame.hidden = true;
  document.body.classList.remove("is-playing-chaos");
  focusBeforeChaos?.focus?.();
}

function isAtPageBottom() {
  return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
}

function showDogEasterEgg() {
  if (dogEasterEggDismissed || !elements.chaosGame.hidden) return;
  elements.dogEasterEgg.inert = false;
  elements.dogEasterEgg.classList.add("is-visible");
  elements.dogEasterEgg.setAttribute("aria-hidden", "false");
}

function hideDogEasterEgg() {
  elements.dogEasterEgg.inert = true;
  elements.dogEasterEgg.classList.remove("is-visible");
  elements.dogEasterEgg.setAttribute("aria-hidden", "true");
}

function updateDogEasterEgg() {
  const pointerAtEdge = lastPointerY >= window.innerHeight - DOG_EASTER_EGG_EDGE;

  if (!isAtPageBottom() || !pointerAtEdge) {
    dogEasterEggDismissed = false;
    hideDogEasterEgg();
    return;
  }

  showDogEasterEgg();
}

document.addEventListener("mousemove", (event) => {
  const pointerInsideDog = elements.dogEasterEgg.contains(event.target);
  lastPointerY = event.clientY;

  if (pointerInsideDog && elements.dogEasterEgg.classList.contains("is-visible")) return;
  updateDogEasterEgg();
});

window.addEventListener("scroll", updateDogEasterEgg, { passive: true });
window.addEventListener("resize", updateDogEasterEgg);
window.addEventListener("blur", hideDogEasterEgg);

elements.dogEasterEggClose.addEventListener("click", () => {
  dogEasterEggDismissed = true;
  hideDogEasterEgg();
  elements.dogEasterEggClose.blur();
});

elements.chaosStart.addEventListener("click", () => {
  hideDogEasterEgg();
  startChaosGame();
});

function primeAudio() {
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
}

function playScream() {
  if (!audioContext || audioContext.state !== "running") return;

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(280, now);
  oscillator.frequency.exponentialRampToValueAtTime(1450, now + 0.65);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.75);
}

function showJumpscare() {
  if (idleTriggered || !elements.jumpscare.hidden) return;
  idleTriggered = true;
  focusBeforeEasterEgg = document.activeElement;
  elements.jumpscare.hidden = false;
  document.body.classList.add("is-showing-easter-egg");
  playScream();
  elements.jumpscareClose.focus();
}

function closeJumpscare() {
  elements.jumpscare.hidden = true;
  document.body.classList.remove("is-showing-easter-egg");
  focusBeforeEasterEgg?.focus?.();
}

function resetIdleTimer() {
  primeAudio();
  window.clearTimeout(idleTimer);
  if (idleTriggered) idleTriggered = false;
  if (!elements.jumpscare.hidden || !elements.musicEasterEgg.hidden) return;
  idleTimer = window.setTimeout(showJumpscare, IDLE_DELAY);
}

function showMusicEasterEgg() {
  window.clearTimeout(idleTimer);
  focusBeforeEasterEgg = document.activeElement;
  elements.musicFrame.src = MUSIC_VIDEO_URL;
  elements.musicEasterEgg.hidden = false;
  document.body.classList.add("is-showing-easter-egg");
  elements.musicClose.focus();
}

function closeMusicEasterEgg() {
  elements.musicFrame.src = "about:blank";
  elements.musicEasterEgg.hidden = true;
  document.body.classList.remove("is-showing-easter-egg");
  focusBeforeEasterEgg?.focus?.();
  resetIdleTimer();
}

elements.chaosReplay.addEventListener("click", startChaosGame);
elements.chaosClose.addEventListener("click", closeChaosGame);
elements.chaosResultClose.addEventListener("click", closeChaosGame);
elements.jumpscareClose.addEventListener("click", closeJumpscare);
elements.musicClose.addEventListener("click", closeMusicEasterEgg);

["pointerdown", "pointermove", "keydown", "scroll", "wheel", "touchstart"].forEach((eventName) => {
  document.addEventListener(eventName, resetIdleTimer, { passive: true });
});

document.addEventListener(
  "click",
  (event) => {
    if (event.target instanceof Element && event.target.closest("#idle-jumpscare, #music-easter-egg")) return;
    resetIdleTimer();
    clickCount += 1;
    if (clickCount === 5) {
      clickCount = 0;
      showMusicEasterEgg();
    }
  },
  { capture: true },
);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.chaosGame.hidden) closeChaosGame();
  if (event.key === "Escape" && !elements.jumpscare.hidden) closeJumpscare();
  if (event.key === "Escape" && !elements.musicEasterEgg.hidden) closeMusicEasterEgg();
});

elements.nextButton.addEventListener("click", () => {
  showCat(getRandomCat(currentCat.id));
  document.querySelector(".cat-stage").scrollIntoView({ behavior: "smooth", block: "start" });
});

elements.shareButton.addEventListener("click", async () => {
  const shareData = {
    title: currentCat.title,
    text: currentCat.caption,
    url: window.location.href,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      elements.shareFeedback.textContent = "공유 창을 열었습니다.";
    } else {
      await navigator.clipboard.writeText(window.location.href);
      elements.shareFeedback.textContent = "이 고양이 주소를 복사했습니다.";
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      elements.shareFeedback.textContent = "주소를 복사하지 못했습니다. 브라우저 주소를 복사해주세요.";
    }
  }
});

function saveBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

elements.downloadButton.addEventListener("click", async () => {
  const cat = currentCat;
  elements.downloadButton.disabled = true;
  elements.shareFeedback.textContent = "이미지를 준비하는 중입니다…";

  try {
    const response = await fetch(new URL(cat.image, window.location.href));
    if (!response.ok) throw new Error(`Image download failed: ${response.status}`);

    const blob = await response.blob();
    const extension = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1] || "webp";
    const filename = `${cat.id}.${extension}`;
    const file = new File([blob], filename, { type: blob.type });
    const canOpenGalleryMenu =
      window.matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] });

    if (canOpenGalleryMenu) {
      try {
        await navigator.share({
          files: [file],
          title: cat.title,
        });
        elements.shareFeedback.textContent = "이미지 저장 메뉴를 열었습니다.";
        return;
      } catch (error) {
        if (error.name === "AbortError") {
          elements.shareFeedback.textContent = "이미지 저장을 취소했습니다.";
          return;
        }
      }
    }

    saveBlob(blob, filename);
    elements.shareFeedback.textContent = "이미지를 저장했습니다.";
  } catch (error) {
    console.error("Image download error:", error);
    elements.shareFeedback.textContent = "이미지를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
  } finally {
    elements.downloadButton.disabled = false;
  }
});

elements.message.addEventListener("input", () => {
  elements.messageCount.textContent = `${elements.message.value.length} / 200`;
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = elements.message.value.trim();
  const nickname = elements.nickname.value.trim() || "익명 집사";
  const submitButton = elements.form.querySelector("button[type='submit']");

  if (!message) {
    elements.formFeedback.textContent = "한마디를 입력해주세요.";
    elements.message.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.firstChild.textContent = "남기는 중… ";
  elements.formFeedback.textContent = "";

  try {
    await addDoc(collection(db, "photos", currentCat.id, "comments"), {
      nickname: nickname.slice(0, 20),
      message: message.slice(0, 200),
      createdAt: serverTimestamp(),
    });
    elements.message.value = "";
    elements.messageCount.textContent = "0 / 200";
    elements.formFeedback.textContent = "방명록을 남겼습니다!";
  } catch (error) {
    console.error("Firestore submit error:", error);
    elements.formFeedback.textContent = "저장하지 못했습니다. Firestore 연결을 확인해주세요.";
  } finally {
    submitButton.disabled = false;
    submitButton.firstChild.textContent = "방명록 남기기 ";
  }
});

window.addEventListener("popstate", () => showCat(getInitialCat(), { updateUrl: false }));

elements.catTotal.textContent = `${cats.length}마리의 혼돈 보유 중`;
showCat(getInitialCat());

function createPixelPet() {
  const pet = document.createElement("div");
  pet.className = "pixel-pet";
  pet.dataset.action = "walk";
  pet.setAttribute("aria-hidden", "true");

  const sprite = document.createElement("div");
  sprite.className = "pixel-pet__sprite";
  pet.append(sprite);
  document.body.append(pet);

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const petSize = () => Number.parseFloat(getComputedStyle(pet).width) || 132;
  const bounds = () => ({
    maxX: Math.max(12, window.innerWidth - petSize() - 12),
    maxY: Math.max(84, window.innerHeight - petSize() - 12),
  });
  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
  const randomBetween = (minimum, maximum) => minimum + Math.random() * (maximum - minimum);

  let x = clamp(window.innerWidth * 0.12, 12, bounds().maxX);
  let y = clamp(window.innerHeight * 0.68, 84, bounds().maxY);
  let targetX = x;
  let targetY = y;
  let actionEndsAt = 0;
  let lastFrameAt = performance.now();
  let restIndex = Math.random() < 0.5 ? 0 : 1;

  function placePet() {
    pet.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }

  function chooseDestination() {
    const { maxX, maxY } = bounds();
    targetX = randomBetween(12, maxX);
    targetY = randomBetween(84, maxY);
    sprite.style.setProperty("--pet-direction", targetX < x ? -1 : 1);
    pet.dataset.action = "walk";
  }

  function startRest(now) {
    const action = ["lick", "yawn"][restIndex];
    restIndex = (restIndex + 1) % 2;
    pet.dataset.action = action;
    actionEndsAt = now + (action === "lick" ? 3200 : 2800);
  }

  function animate(now) {
    const elapsed = Math.min((now - lastFrameAt) / 1000, 0.05);
    lastFrameAt = now;

    if (!reducedMotion.matches) {
      if (pet.dataset.action === "walk") {
        const deltaX = targetX - x;
        const deltaY = targetY - y;
        const distance = Math.hypot(deltaX, deltaY);
        const step = 76 * elapsed;

        if (distance <= step || distance < 1) {
          x = targetX;
          y = targetY;
          startRest(now);
        } else {
          x += (deltaX / distance) * step;
          y += (deltaY / distance) * step;
        }
      } else if (now >= actionEndsAt) {
        chooseDestination();
      }
    }

    placePet();
    window.requestAnimationFrame(animate);
  }

  window.addEventListener("resize", () => {
    const { maxX, maxY } = bounds();
    x = clamp(x, 12, maxX);
    y = clamp(y, 84, maxY);
    targetX = clamp(targetX, 12, maxX);
    targetY = clamp(targetY, 84, maxY);
    placePet();
  });

  if (reducedMotion.matches) {
    pet.dataset.action = "yawn";
  } else {
    chooseDestination();
  }
  placePet();
  window.requestAnimationFrame(animate);
}

createPixelPet();
resetIdleTimer();
createRoamingCat();
