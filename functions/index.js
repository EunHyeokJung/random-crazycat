const { randomInt } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { onRequest } = require("firebase-functions/v2/https");

const SITE_ORIGIN = "https://random-crazycat.web.app";
const generatedDirectory = path.join(__dirname, "generated");
const htmlTemplate = readFileSync(path.join(generatedDirectory, "index.html"), "utf8");
const cats = JSON.parse(readFileSync(path.join(generatedDirectory, "cats.json"), "utf8"));

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function selectCat(request) {
  const url = new URL(request.originalUrl || request.url, SITE_ORIGIN);
  const requestedId = url.searchParams.get("cat");
  return cats.find((cat) => cat.id === requestedId) || cats[randomInt(cats.length)];
}

function renderSocialMeta(cat) {
  const title = escapeAttribute(cat.title);
  const description = escapeAttribute(cat.caption);
  const image = `${SITE_ORIGIN}${cat.image}`;
  const pageUrl = `${SITE_ORIGIN}/?cat=${encodeURIComponent(cat.id)}`;
  const imageAlt = escapeAttribute(cat.alt);

  return `<!-- SOCIAL_META_START -->
    <meta name="selected-cat" content="${escapeAttribute(cat.id)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="미친고양이.zip" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${pageUrl}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:secure_url" content="${image}" />
    <meta property="og:image:type" content="image/webp" />
    <meta property="og:image:width" content="960" />
    <meta property="og:image:height" content="1200" />
    <meta property="og:image:alt" content="${imageAlt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <!-- SOCIAL_META_END -->`;
}

exports.renderPreview = onRequest(
  {
    region: "asia-northeast3",
    cors: false,
  },
  (request, response) => {
    const ua = (request.headers["user-agent"] || "").toLowerCase();
    if (ua.includes("dog")) {
      response.status(418).set("Content-Type", "text/plain; charset=utf-8").send("I'm a teapot");
      return;
    }

    const cat = selectCat(request);
    const html = htmlTemplate
      .replace(/<!-- SOCIAL_META_START -->[\s\S]*?<!-- SOCIAL_META_END -->/, renderSocialMeta(cat))
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttribute(cat.title)} | 미친고양이.zip</title>`);

    response.set("Cache-Control", "no-store, max-age=0");
    response.set("Content-Type", "text/html; charset=utf-8");
    response.status(200).send(html);
  },
);
