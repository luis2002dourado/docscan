import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  orderQuad,
  isValidQuad,
  solveHomography,
  applyHomography,
  allowedFile,
  sanitizeFilename,
  escapeText,
  MAX_BYTES,
} from "../lib/vision.mjs";

test("clamp limita valores", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
});

test("orderQuad organiza cantos", () => {
  const q = orderQuad([
    { x: 10, y: 0 },
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]);
  assert.deepEqual(q[0], { x: 0, y: 0 });
  assert.deepEqual(q[1], { x: 10, y: 0 });
  assert.deepEqual(q[2], { x: 10, y: 10 });
  assert.deepEqual(q[3], { x: 0, y: 10 });
});

test("isValidQuad rejeita área pequena", () => {
  const tiny = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];
  assert.equal(isValidQuad(tiny, 100, 100), false);
  const big = [
    { x: 0, y: 0 },
    { x: 80, y: 0 },
    { x: 80, y: 80 },
    { x: 0, y: 80 },
  ];
  assert.equal(isValidQuad(big, 100, 100), true);
});

test("homografia identidade", () => {
  const src = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  const h = solveHomography(src, src);
  const p = applyHomography(h, 5, 5);
  assert.ok(Math.abs(p.x - 5) < 0.2);
  assert.ok(Math.abs(p.y - 5) < 0.2);
});

test("allowedFile bloqueia executáveis", () => {
  assert.equal(allowedFile("x.exe", "application/octet-stream", "image"), false);
  assert.equal(allowedFile("a.jpg", "image/jpeg", "image"), true);
  assert.equal(allowedFile("a.pdf", "application/pdf", "pdf"), true);
  assert.equal(allowedFile("a.pdf", "application/pdf", "image"), false);
});

test("sanitize e escape anti-XSS", () => {
  assert.equal(escapeText('<img src=x onerror=alert(1)>'), "&lt;img src=x onerror=alert(1)&gt;");
  assert.ok(!sanitizeFilename("../../etc/passwd").includes("/"));
  assert.ok(MAX_BYTES > 1000);
});
