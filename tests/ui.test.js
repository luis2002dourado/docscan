import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "public/index.html"), "utf8");
const css = readFileSync(join(root, "public/styles.css"), "utf8");
const app = readFileSync(join(root, "public/app.js"), "utf8");

test("interface tem as três ferramentas", () => {
  assert.ok(html.includes("data-tab=\"scan\""));
  assert.ok(html.includes("data-tab=\"merge\""));
  assert.ok(html.includes("data-tab=\"edit\""));
  assert.ok(html.includes("scan-ocr"));
  assert.ok(html.includes("scan-look"));
  assert.ok(html.includes("scan-print"));
});

test("estilo Evernote: serif + verde", () => {
  assert.ok(css.includes("Source Serif") || html.includes("Source Serif"));
  assert.ok(css.includes("#02c39a") && css.includes("#05668d") && css.includes("#f0f3bd"));
});

test("movimento 3d e pointer", () => {
  assert.ok(css.includes("perspective") || css.includes("preserve-3d"));
  assert.ok(html.includes("scan-apply") || html.includes("data-scroll") || html.includes("data-tilt"));
  assert.ok(app.includes("pointermove"));
});

test("sessão não persiste", () => {
  assert.ok(app.includes("localStorage.clear"));
  assert.ok(app.includes("pagehide"));
  assert.ok(!app.includes("indexedDB"));
});

test("OCR e sanitização na UI", () => {
  assert.ok(html.includes("tesseract"));
  assert.ok(app.includes("escapeText"));
  assert.ok(app.includes("allowedFile"));
});
