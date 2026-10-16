import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "public/index.html"), "utf8");
const css = readFileSync(join(root, "public/styles.css"), "utf8");
const app = readFileSync(join(root, "public/app.js"), "utf8");

test("interface tem as ferramentas principais", () => {
  assert.ok(html.includes('data-tab="scan"'));
  assert.ok(html.includes('data-tab="merge"'));
  assert.ok(html.includes('data-tab="edit"'));
  assert.ok(html.includes('data-tab="compress"'));
  assert.ok(html.includes("scan-ocr"));
  assert.ok(html.includes("scan-look"));
  assert.ok(html.includes("scan-print"));
});

test("paleta Studio Crimson e tipografia Plus Jakarta Sans + JetBrains Mono", () => {
  assert.ok(css.includes("Plus Jakarta Sans") && css.includes("JetBrains Mono"));
  assert.ok(css.includes("#d92323") && css.includes("#141413"));
});

test("movimento e pointer para ajuste de cantos", () => {
  assert.ok(css.includes("perspective") || css.includes("preserve-3d"));
  assert.ok(html.includes("scan-apply"));
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
