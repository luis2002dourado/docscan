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
  const a = quadArea(q);
  if (a < w * h * 0.08) return false;
  if (a > w * h * 0.93) return false;
  const [tl, tr, br, bl] = q;
  if (dist(tl, tr) < w * 0.12 || dist(bl, br) < w * 0.12) return false;
  if (dist(tl, bl) < h * 0.12 || dist(tr, br) < h * 0.12) return false;
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
  const mx = Math.max(4, Math.round(w * 0.04));
  const my = Math.max(4, Math.round(h * 0.04));

  const fromEdges = (thrMul, inset) => {
    const thr = max * thrMul;
    const pts = [];
    const step = 2;
    const x0 = inset ? mx : 2;
    const y0 = inset ? my : 2;
    const x1 = inset ? w - mx : w - 2;
    const y1 = inset ? h - my : h - 2;
    for (let y = y0; y < y1; y += step) {
      for (let x = x0; x < x1; x += step) {
        if (mag[y * w + x] > thr) pts.push({ x, y });
      }
    }
    if (pts.length < 24) return null;
    const q = orderQuad(approxQuad(convexHull(pts)));
    return isValidQuad(q, w, h) ? q : null;
  };

  let q = fromEdges(0.22, true) || fromEdges(0.16, true) || fromEdges(0.22, false);
  if (q) return q;

  let border = 0;
  let bn = 0;
  for (let x = 0; x < w; x += 2) {
    border += gray[x] + gray[(h - 1) * w + x];
    bn += 2;
  }
  for (let y = 0; y < h; y += 2) {
    border += gray[y * w] + gray[y * w + w - 1];
    bn += 2;
  }
  const desk = border / Math.max(1, bn);
  const paperThr = Math.min(210, Math.max(desk + 22, 118));
  const paper = [];
  for (let y = my; y < h - my; y += 2) {
    for (let x = mx; x < w - mx; x += 2) {
      if (gray[y * w + x] >= paperThr) paper.push({ x, y });
    }
  }
  if (paper.length > 40) {
    const pq = orderQuad(approxQuad(convexHull(paper)));
    if (isValidQuad(pq, w, h)) return pq;
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
    if (isValidQuad(box, w, h)) return box;
  }
  return null;
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

function approxQuad(hull) {
  if (hull.length < 4) return hull;
  let best = hull.slice(0, 4);
  let bestScore = -1;
  const n = hull.length;
  const step = Math.max(1, Math.floor(n / 18));
  for (let i = 0; i < n; i += step) {
    for (let j = i + 1; j < n; j += step) {
      for (let k = j + 1; k < n; k += step) {
        for (let l = k + 1; l < n; l += step) {
          const q = [hull[i], hull[j], hull[k], hull[l]];
          const a = quadArea(orderQuad(q));
          if (a > bestScore) {
            bestScore = a;
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
  const iw = img.naturalWidth || img.width || 0;
  const ih = img.naturalHeight || img.height || 0;
  const src = document.createElement("canvas");
  const maxW = 1400;
  const scale = iw > maxW ? maxW / Math.max(1, iw) : 1;
  src.width = Math.max(1, Math.round(iw * scale));
  src.height = Math.max(1, Math.round(ih * scale));
  src.getContext("2d").drawImage(img, 0, 0, src.width, src.height);

  let work = src;
  const crop = mode === "auto";
  if (crop) {
    const tryDetect = (longSide) => {
      const small = document.createElement("canvas");
      const s = longSide / Math.max(src.width, src.height, 1);
      small.width = Math.max(8, Math.round(src.width * s));
      small.height = Math.max(8, Math.round(src.height * s));
      const sctx = small.getContext("2d", { willReadFrequently: true });
      sctx.drawImage(src, 0, 0, small.width, small.height);
      const id = sctx.getImageData(0, 0, small.width, small.height);
      const q = detectDocumentQuad(id, small.width, small.height);
      if (!q) return null;
      return q.map((p) => ({ x: p.x / s, y: p.y / s }));
    };
    const quad = tryDetect(420) || tryDetect(280);
    if (quad) {
      const w = Math.round(Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2])));
      const h = Math.round(Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2])));
      work = warpToCanvas(src, quad, clamp(w, 400, 1600), clamp(h, 400, 2200));
    }
  }
  enhanceDocument(work, look || "color_paper");
  return work;
}
