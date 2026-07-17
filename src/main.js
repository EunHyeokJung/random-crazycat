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
  keyboardCat: document.querySelector("#keyboard-cat"),
  keyboardCatVideo: document.querySelector("#keyboard-cat-video"),
  keyboardCatKey: document.querySelector("#keyboard-cat-key"),
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
let keyboardCatIdleTimer = null;
let keyboardCatAnimationFrame = null;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function getKeyLabel(key) {
  if (key === " ") return "SPACE";
  if (key === "Enter") return "ENTER";
  if (key === "Backspace") return "⌫";
  if (key === "Delete") return "DEL";
  if (key === "Tab") return "TAB";
  return key.length === 1 ? key.toUpperCase() : "TAP!";
}

function wakeKeyboardCat(event) {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.key === "Escape" ||
    !elements.chaosGame.hidden
  ) return;

  elements.keyboardCatKey.textContent = getKeyLabel(event.key);
  elements.keyboardCat.classList.remove("is-key-hit", "is-idle");
  elements.keyboardCat.classList.add("is-typing");
  window.cancelAnimationFrame(keyboardCatAnimationFrame);
  keyboardCatAnimationFrame = window.requestAnimationFrame(() => {
    elements.keyboardCat.classList.add("is-key-hit");
  });

  if (!reducedMotion.matches) void elements.keyboardCatVideo.play().catch(() => {});

  window.clearTimeout(keyboardCatIdleTimer);
  keyboardCatIdleTimer = window.setTimeout(() => {
    elements.keyboardCatVideo.pause();
    elements.keyboardCat.classList.remove("is-typing");
    elements.keyboardCat.classList.add("is-idle");
    elements.keyboardCatKey.textContent = "TYPE!";
  }, 720);
}

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

elements.chaosStart.addEventListener("click", startChaosGame);
elements.chaosReplay.addEventListener("click", startChaosGame);
elements.chaosClose.addEventListener("click", closeChaosGame);
elements.chaosResultClose.addEventListener("click", closeChaosGame);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.chaosGame.hidden) closeChaosGame();
  wakeKeyboardCat(event);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) elements.keyboardCatVideo.pause();
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
