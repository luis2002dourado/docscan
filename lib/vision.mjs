/** Pure image-geometry helpers — used by the browser and by tests. */

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function orderQuad(pts) {
  const sorted = [...pts].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bot = sorted.slice(2).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bot[1], bot[0]];
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function quadArea(q) {
  const [a, b, c, d] = q;
  return Math.abs(
    (a.x * b.y + b.x * c.y + c.x * d.y + d.x * a.y -
      (a.y * b.x + b.y * c.x + c.y * d.x + d.y * a.x)) / 2
  );
}

export function isValidQuad(q, w, h) {
  if (!q || q.length !== 4) return false;
  const area = quadArea(q);
  if (area < w * h * 0.12) return false;
  const [tl, tr, br, bl] = q;
  if (dist(tl, tr) < w * 0.2 || dist(bl, br) < w * 0.2) return false;
  if (dist(tl, bl) < h * 0.2 || dist(tr, br) < h * 0.2) return false;
  return true;
}

export function solveHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = gaussianSolve(A, b);
  h.push(1);
  return h;
}

function gaussianSolve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let max = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[max][i])) max = k;
    [M[i], M[max]] = [M[max], M[i]];
    const piv = M[i][i] || 1e-12;
    for (let j = i; j <= n; j++) M[i][j] /= piv;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const f = M[k][i];
      for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
    }
  }
  return M.map((row) => row[n]);
}

export function applyHomography(h, x, y) {
  const w = h[6] * x + h[7] * y + 1;
  return {
    x: (h[0] * x + h[1] * y + h[2]) / w,
    y: (h[3] * x + h[4] * y + h[5]) / w,
  };
}

export function allowedFile(name, type, kind) {
  const n = (name || "").toLowerCase();
  if (kind === "image") {
    return (
      /^image\/(jpeg|jpg|png|webp|gif|bmp)$/.test(type) ||
      /\.(jpe?g|png|webp|gif|bmp)$/.test(n)
    );
  }
  if (kind === "pdf") {
    return type === "application/pdf" || n.endsWith(".pdf");
  }
  return false;
}

export const MAX_BYTES = 25 * 1024 * 1024;

export function sanitizeFilename(name) {
  return String(name || "arquivo")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 80);
}

export function escapeText(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
