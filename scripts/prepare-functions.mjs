import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { cats } from "../src/cats.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedDirectory = path.join(root, "functions", "generated");
const builtHtmlPath = path.join(root, "dist", "index.html");
const html = await readFile(builtHtmlPath, "utf8");
const previewCats = cats.map(({ id, title, caption, image, alt }) => ({
  id,
  title,
  caption,
  image,
  alt,
}));

await mkdir(generatedDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(generatedDirectory, "index.html"), html),
  writeFile(path.join(generatedDirectory, "cats.json"), JSON.stringify(previewCats)),
]);
await unlink(builtHtmlPath);

console.log(`Prepared social previews for ${previewCats.length} cats and enabled dynamic HTML.`);
