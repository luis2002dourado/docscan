import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PORT = 8765;
let child;

before(async () => {
  child = spawn("node", ["server.js"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "pipe",
  });
  await delay(700);
});

after(() => {
  if (child) child.kill("SIGTERM");
});

const base = `http://127.0.0.1:${PORT}`;

test("headers de segurança presentes", async () => {
  const res = await fetch(base + "/");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  const csp = res.headers.get("content-security-policy") || "";
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok((res.headers.get("cache-control") || "").includes("no-store"));
});

test("POST é recusado — API não armazena", async () => {
  const res = await fetch(base + "/api/health", { method: "POST" });
  assert.equal(res.status, 405);
});

test("health não expõe armazenamento", async () => {
  const res = await fetch(base + "/api/health");
  const j = await res.json();
  assert.equal(j.storage, "none");
  assert.equal(j.session, "ephemeral");
});

test("não há x-powered-by", async () => {
  const res = await fetch(base + "/");
  assert.equal(res.headers.get("x-powered-by"), null);
});

test('worker OpenCV isolado e interface sem unsafe-eval', async () => {
  const page = await fetch(base + '/docscan/');
  assert.equal(page.status, 200);
  assert.ok(!page.headers.get('content-security-policy').includes("'unsafe-eval'"));
  const worker = await fetch(base + '/docscan/scanner-worker.js');
  assert.equal(worker.status, 200);
  const policy=worker.headers.get('content-security-policy');
  assert.ok(policy.includes("connect-src 'none'"));
  assert.ok(policy.includes("script-src 'self' 'unsafe-eval'"));
});
