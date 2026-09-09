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
  if (q.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  const a = quadArea(q);
  if (a < w * h * 0.06) return false;
  if (a > w * h * 0.995) return false;
  const [tl, tr, br, bl] = orderQuad(q);
  if (dist(tl, tr) < w * 0.1 || dist(bl, br) < w * 0.1) return false;
  if (dist(tl, bl) < h * 0.1 || dist(tr, br) < h * 0.1) return false;
  return true;
}

function rectScore(q) {
  const [tl, tr, br, bl] = orderQuad(q);
  const w1 = dist(tl, tr);
  const w2 = dist(bl, br);
  const h1 = dist(tl, bl);
  const h2 = dist(tr, br);
  const wr = Math.min(w1, w2) / Math.max(1, Math.max(w1, w2));
  const hr = Math.min(h1, h2) / Math.max(1, Math.max(h1, h2));
  return wr * hr;
}

function hugsFrame(q, w, h) {
  const m = 3;
  return q.every((p) => p.x <= m || p.x >= w - m || p.y <= m || p.y >= h - m);
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
      type === "application/pdf" ||
      /\.(jpe?g|png|webp|gif|bmp|pdf)$/.test(n)
    );
  }
  if (kind === "pdf") return type === "application/pdf" || n.endsWith(".pdf");
  return false;
}
export const MAX_BYTES = 25 * 1024 * 1024;
export function sanitizeFilename(name) {
  return String(name || "arquivo").replace(/[^\w.\-]+/g, "_").slice(0, 80);
}
export function escapeText(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function detectDocumentQuad(imageData, w, h) {
  const gray = new Float32Array(w * h);
  const d = imageData.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -gray[i - w - 1] + gray[i - w + 1] - 2 * gray[i - 1] + 2 * gray[i + 1] - gray[i + w - 1] + gray[i + w + 1];
      const gy =
        -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      mag[i] = Math.hypot(gx, gy);
    }
  }
  let max = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i] > max) max = mag[i];

  const pick = (pts) => {
    if (!pts || pts.length < 18) return null;
    const q = orderQuad(approxQuad(convexHull(pts), w, h));
    if (!isValidQuad(q, w, h) || hugsFrame(q, w, h)) return null;
    return q;
  };

  const fromEdges = (thrMul, insetFrac) => {
    const thr = max * thrMul;
    if (thr <= 0) return null;
    const pts = [];
    const pad = Math.max(2, Math.round(Math.min(w, h) * insetFrac));
    for (let y = pad; y < h - pad; y += 2) {
      for (let x = pad; x < w - pad; x += 2) {
        if (mag[y * w + x] > thr) pts.push({ x, y });
      }
    }
    return pick(pts);
  };

  let q =
    fromEdges(0.2, 0.03) ||
    fromEdges(0.14, 0.02) ||
    fromEdges(0.1, 0.015) ||
    fromEdges(0.18, 0);
  if (q) return q;

  const proj = projectionQuad(gray, mag, w, h);
  if (proj) return proj;

  const otsuT = otsuThreshold(gray);
  const paper = [];
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      if (gray[y * w + x] >= otsuT) paper.push({ x, y });
    }
  }
  q = pick(paper);
  if (q) return q;
  if (paper.length > 30) {
    let minX = w,
      minY = h,
      maxX = 0,
      maxY = 0;
    for (const p of paper) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const box = orderQuad([
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ]);
    if (isValidQuad(box, w, h) && !hugsFrame(box, w, h)) return box;
  }
  return null;
}

function otsuThreshold(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[Math.max(0, Math.min(255, gray[i] | 0))]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      t = i;
    }
  }
  return t;
}

function smooth1d(arr) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const a = arr[Math.max(0, i - 1)];
    const b = arr[i];
    const c = arr[Math.min(arr.length - 1, i + 1)];
    out[i] = (a + b * 2 + c) / 4;
  }
  return out;
}

function firstRise(arr, fromStart) {
  const n = arr.length;
  let max = 0;
  for (let i = 0; i < n; i++) if (arr[i] > max) max = arr[i];
  const thr = max * 0.22;
  if (fromStart) {
    for (let i = 1; i < n - 2; i++) if (arr[i] > thr && arr[i] >= arr[i - 1]) return i;
    return 0;
  }
  for (let i = n - 2; i > 1; i--) if (arr[i] > thr && arr[i] >= arr[i + 1]) return i;
  return n - 1;
}

function projectionQuad(gray, mag, w, h) {
  const row = new Float32Array(h);
  const col = new Float32Array(w);
  const rowM = new Float32Array(h);
  const colM = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const g = gray[y * w + x];
      const m = mag[y * w + x];
      row[y] += g;
      col[x] += g;
      rowM[y] += m;
      colM[x] += m;
    }
  }
  const r = smooth1d(rowM);
  const c = smooth1d(colM);
  const top = firstRise(r, true);
  const bot = firstRise(r, false);
  const left = firstRise(c, true);
  const right = firstRise(c, false);
  if (bot - top < h * 0.18 || right - left < w * 0.18) return null;
  const q = orderQuad([
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bot },
    { x: left, y: bot },
  ]);
  if (!isValidQuad(q, w, h) || hugsFrame(q, w, h)) return null;
  return q;
}

function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function approxQuad(hull, w, h) {
  if (hull.length < 4) return hull;
  let best = hull.slice(0, 4);
  let bestScore = -1;
  const n = hull.length;
  const step = Math.max(1, Math.floor(n / 16));
  for (let i = 0; i < n; i += step) {
    for (let j = i + 1; j < n; j += step) {
      for (let k = j + 1; k < n; k += step) {
        for (let l = k + 1; l < n; l += step) {
          const q = orderQuad([hull[i], hull[j], hull[k], hull[l]]);
          if (w && h && hugsFrame(q, w, h)) continue;
          const a = quadArea(q);
          const score = a * (0.35 + 0.65 * rectScore(q));
          if (score > bestScore) {
            bestScore = score;
            best = q;
          }
        }
      }
    }
  }
  return orderQuad(best);
}

export function warpToCanvas(srcCanvas, quad, outW, outH) {
  const dst = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  const h = solveHomography(dst, quad);
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d");
  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const src = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const dest = ctx.createImageData(outW, outH);
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const p = applyHomography(h, x, y);
      const sx = p.x;
      const sy = p.y;
      const di = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        dest.data[di] = dest.data[di + 1] = dest.data[di + 2] = 255;
        dest.data[di + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const dx = sx - x0;
      const dy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        const v =
          src.data[i00 + c] * (1 - dx) * (1 - dy) +
          src.data[i10 + c] * dx * (1 - dy) +
          src.data[i01 + c] * (1 - dx) * dy +
          src.data[i11 + c] * dx * dy;
        dest.data[di + c] = v;
      }
      dest.data[di + 3] = 255;
    }
  }
  ctx.putImageData(dest, 0, 0);
  return out;
}

export function enhanceDocument(canvas, mode) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  if (mode === "original") return canvas;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i],
      g = d[i + 1],
      b = d[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    if (mode === "bw") {
      const v = ((y - 128) * 1.4 + 140) > 168 ? 255 : 18;
      d[i] = d[i + 1] = d[i + 2] = v;
    } else if (mode === "bw_soft") {
      const v = Math.min(255, Math.max(0, (y - 128) * 1.25 + 140));
      d[i] = d[i + 1] = d[i + 2] = v;
    } else if (mode === "color_paper") {
      const paper = Math.min(255, y + (255 - y) * 0.35 + 18);
      const ink = y < 150;
      if (!ink) {
        d[i] = d[i + 1] = d[i + 2] = paper;
      } else {
        const k = 1.25;
        d[i] = Math.min(255, Math.max(0, (r - 128) * k + 118));
        d[i + 1] = Math.min(255, Math.max(0, (g - 128) * k + 118));
        d[i + 2] = Math.min(255, Math.max(0, (b - 128) * k + 118));
      }
    } else if (mode === "color_ink") {
      const t = y / 255;
      const boost = t < 0.55 ? 1.45 : 1.08;
      d[i] = Math.min(255, Math.max(0, (r - 20) * boost));
      d[i + 1] = Math.min(255, Math.max(0, (g - 20) * boost));
      d[i + 2] = Math.min(255, Math.max(0, (b - 18) * boost));
    } else if (mode === "color_vivid") {
      const gray = y;
      const sat = 1.55;
      d[i] = Math.min(255, Math.max(0, gray + (r - gray) * sat));
      d[i + 1] = Math.min(255, Math.max(0, gray + (g - gray) * sat));
      d[i + 2] = Math.min(255, Math.max(0, gray + (b - gray) * sat));
      d[i] = Math.min(255, (d[i] - 128) * 1.2 + 132);
      d[i + 1] = Math.min(255, (d[i + 1] - 128) * 1.2 + 132);
      d[i + 2] = Math.min(255, (d[i + 2] - 128) * 1.2 + 132);
    } else if (mode === "color_cool") {
      const paper = Math.min(255, y * 1.12 + 22);
      if (y > 170) {
        d[i] = paper * 0.92;
        d[i + 1] = paper * 0.98;
        d[i + 2] = Math.min(255, paper);
      } else {
        d[i] = Math.min(255, r * 0.92);
        d[i + 1] = Math.min(255, g * 1.02);
        d[i + 2] = Math.min(255, b * 1.12);
      }
    } else {
      const paper = Math.min(255, y * 1.08 + 8);
      d[i] = d[i + 1] = d[i + 2] = paper;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function processPhoto(img, mode, look) {
  const iw = img.naturalWidth || img.videoWidth || img.width || 0;
  const ih = img.naturalHeight || img.videoHeight || img.height || 0;
  const src = document.createElement("canvas");
  const maxW = 1600;
  const scale = iw > maxW ? maxW / Math.max(1, iw) : 1;
  src.width = Math.max(1, Math.round(iw * scale));
  src.height = Math.max(1, Math.round(ih * scale));
  const sctx = src.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(img, 0, 0, src.width, src.height);

  let work = src;
  const crop = mode === "auto" || mode === "" || mode == null;
  if (crop && src.width > 8 && src.height > 8) {
    const tryDetect = (longSide) => {
      try {
        const small = document.createElement("canvas");
        const s = longSide / Math.max(src.width, src.height, 1);
        small.width = Math.max(12, Math.round(src.width * s));
        small.height = Math.max(12, Math.round(src.height * s));
        const ctx = small.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(src, 0, 0, small.width, small.height);
        const id = ctx.getImageData(0, 0, small.width, small.height);
        const q = detectDocumentQuad(id, small.width, small.height);
        if (!q) return null;
        return q.map((p) => ({ x: p.x / s, y: p.y / s }));
      } catch {
        return null;
      }
    };
    const quad = tryDetect(560) || tryDetect(400) || tryDetect(280);
    if (quad) {
      const w = Math.round(Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2])));
      const h = Math.round(Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2])));
      try {
        work = warpToCanvas(src, quad, clamp(w, 320, 1800), clamp(h, 320, 2400));
      } catch {
        work = src;
      }
    }
  }
  enhanceDocument(work, look || "color_paper");
  return work;
}
