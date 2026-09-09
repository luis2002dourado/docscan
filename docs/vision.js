export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
export function orderQuad(pts) {
  if (!pts || pts.length !== 4) {
    const sorted = [...(pts || [])].sort((a, b) => a.y - b.y);
    const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
    const bot = sorted.slice(2).sort((a, b) => a.x - b.x);
    return [top[0], top[1], bot[1], bot[0]];
  }
  let tl = pts[0],
    tr = pts[0],
    br = pts[0],
    bl = pts[0];
  let minS = Infinity,
    maxS = -Infinity,
    minD = Infinity,
    maxD = -Infinity;
  for (const p of pts) {
    const s = p.x + p.y;
    const d = p.x - p.y;
    if (s < minS) {
      minS = s;
      tl = p;
    }
    if (s > maxS) {
      maxS = s;
      br = p;
    }
    if (d > maxD) {
      maxD = d;
      tr = p;
    }
    if (d < minD) {
      minD = d;
      bl = p;
    }
  }
  const uniq = new Set([tl, tr, br, bl]);
  if (uniq.size < 4) {
    const sorted = [...pts].sort((a, b) => a.y - b.y);
    const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
    const bot = sorted.slice(2).sort((a, b) => a.x - b.x);
    return [top[0], top[1], bot[1], bot[0]];
  }
  return [tl, tr, br, bl];
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
  if (dist(tl, tr) < w * 0.08 || dist(bl, br) < w * 0.08) return false;
  if (dist(tl, bl) < h * 0.08 || dist(tr, br) < h * 0.08) return false;
  if (!isConvexQuad(q)) return false;
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
  const m = 2;
  return q.every((p) => p.x <= m || p.x >= w - 1 - m || p.y <= m || p.y >= h - 1 - m);
}

function isConvexQuad(q) {
  const p = orderQuad(q);
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i],
      b = p[(i + 1) % 4],
      c = p[(i + 2) % 4];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-4) continue;
    const s = Math.sign(cr);
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function intersectLines(p1, p2, p3, p4) {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-8) return null;
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

function angDiff(a, b) {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

function hullToQuad(hull) {
  if (!hull || hull.length < 4) return null;
  const n = hull.length;
  const raw = [];
  for (let i = 0; i < n; i++) {
    const a = hull[i],
      b = hull[(i + 1) % n];
    const len = dist(a, b);
    if (len < 1) continue;
    raw.push({ a, b, len, ang: Math.atan2(b.y - a.y, b.x - a.x) });
  }
  if (raw.length < 4) return hull.length === 4 ? hull : null;
  const segs = [];
  const pushMerge = (e) => {
    if (!segs.length) {
      segs.push({ a: e.a, b: e.b, len: e.len, ang: e.ang });
      return;
    }
    const last = segs[segs.length - 1];
    if (angDiff(e.ang, last.ang) < (18 * Math.PI) / 180) {
      last.b = e.b;
      last.len += e.len;
      last.ang = Math.atan2(last.b.y - last.a.y, last.b.x - last.a.x);
    } else segs.push({ a: e.a, b: e.b, len: e.len, ang: e.ang });
  };
  raw.forEach(pushMerge);
  if (segs.length > 1 && angDiff(segs[0].ang, segs[segs.length - 1].ang) < (18 * Math.PI) / 180) {
    const f = segs[0];
    const l = segs.pop();
    f.a = l.a;
    f.len += l.len;
    f.ang = Math.atan2(f.b.y - f.a.y, f.b.x - f.a.x);
  }
  let use = segs;
  if (segs.length > 4) {
    const ranked = segs.map((s, i) => ({ i, len: s.len })).sort((a, b) => b.len - a.len);
    const keep = new Set(ranked.slice(0, 4).map((x) => x.i));
    use = segs.filter((_, i) => keep.has(i));
  }
  if (use.length !== 4) return toFourCorners(hull);
  const corners = [];
  for (let i = 0; i < 4; i++) {
    const e1 = use[i];
    const e2 = use[(i + 1) % 4];
    const p = intersectLines(e1.a, e1.b, e2.a, e2.b);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return toFourCorners(hull);
    corners.push(p);
  }
  return corners;
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

function ctx2d(canvas) {
  return canvas.getContext("2d", { willReadFrequently: true }) || canvas.getContext("2d");
}

function blurGray(src, w, h) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0,
        n = 0;
      for (let k = -2; k <= 2; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        s += src[y * w + xx];
        n++;
      }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0,
        n = 0;
      for (let k = -2; k <= 2; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        s += tmp[yy * w + x];
        n++;
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

function periClosed(pts) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) p += dist(pts[i], pts[(i + 1) % pts.length]);
  return p;
}

function pointLineDist(p, a, b) {
  const vx = b.x - a.x,
    vy = b.y - a.y;
  const len = Math.hypot(vx, vy) || 1;
  return Math.abs(vy * p.x - vx * p.y + b.x * a.y - b.y * a.x) / len;
}

function rdp(points, epsilon) {
  if (points.length < 3) return points;
  let maxD = 0,
    idx = 0;
  const a = points[0],
    b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDist(points[i], a, b);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > epsilon) {
    const left = rdp(points.slice(0, idx + 1), epsilon);
    const right = rdp(points.slice(idx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

function approxPolyClosed(pts, epsilon) {
  if (pts.length < 4) return pts;
  const closed = pts.concat([pts[0]]);
  const ap = rdp(closed, epsilon);
  if (ap.length > 1 && dist(ap[0], ap[ap.length - 1]) < 1.5) ap.pop();
  return ap;
}

function toFourCorners(hull) {
  if (!hull || hull.length < 4) return hull;
  if (hull.length === 4) return hull;
  const per = periClosed(hull);
  for (const f of [0.02, 0.015, 0.025, 0.03, 0.04, 0.01, 0.05, 0.08, 0.12]) {
    const ap = approxPolyClosed(hull, Math.max(1.5, f * per));
    if (ap.length === 4) return ap;
  }
  return approxQuad(hull);
}

function connectedEdgeComponents(bin, w, h) {
  const seen = new Uint8Array(w * h);
  const comps = [];
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i0 = y * w + x;
      if (!bin[i0] || seen[i0]) continue;
      let qs = 0,
        qe = 0;
      qx[qe] = x;
      qy[qe] = y;
      qe++;
      seen[i0] = 1;
      const pts = [];
      while (qs < qe) {
        const cx = qx[qs],
          cy = qy[qs];
        qs++;
        pts.push({ x: cx, y: cy });
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx,
              ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (bin[ni] && !seen[ni]) {
              seen[ni] = 1;
              qx[qe] = nx;
              qy[qe] = ny;
              qe++;
            }
          }
        }
      }
      if (pts.length > 50) comps.push(pts);
    }
  }
  comps.sort((a, b) => b.length - a.length);
  return comps.slice(0, 10);
}

export function detectDocumentQuad(imageData, w, h) {
  const gray0 = new Float32Array(w * h);
  const d = imageData.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    gray0[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  const gray = blurGray(gray0, w, h);
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
  const hi = max * 0.16;
  const lo = max * 0.08;
  const bin = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mag[i] >= hi) bin[i] = 1;
    }
  }
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      if (bin[i] || mag[i] < lo) continue;
      if (
        bin[i - 1] ||
        bin[i + 1] ||
        bin[i - w] ||
        bin[i + w] ||
        bin[i - w - 1] ||
        bin[i - w + 1] ||
        bin[i + w - 1] ||
        bin[i + w + 1]
      )
        bin[i] = 1;
    }
  }
  const dil = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let on = 0;
      for (let dy = -1; dy <= 1 && !on; dy++)
        for (let dx = -1; dx <= 1; dx++) if (bin[(y + dy) * w + (x + dx)]) on = 1;
      dil[y * w + x] = on;
    }
  }

  const scoreQ = (q) => {
    if (!q || q.length !== 4) return -1;
    const o = orderQuad(q);
    if (!isValidQuad(o, w, h) || hugsFrame(o, w, h)) return -1;
    return quadArea(o);
  };

  const consider = (pts, best) => {
    if (!pts || pts.length < 20) return best;
    const hull = convexHull(pts);
    if (hull.length < 4) return best;
    const four = hullToQuad(hull) || toFourCorners(hull);
    if (!four || four.length !== 4) return best;
    const q = orderQuad(four);
    const s = scoreQ(q);
    if (s > best.s) return { s, q };
    return best;
  };

  let best = { s: -1, q: null };

  const otsuT = otsuThreshold(gray0);
  const paperBin = new Uint8Array(w * h);
  for (let i = 0; i < gray0.length; i++) paperBin[i] = gray0[i] >= otsuT ? 1 : 0;
  const paperComps = connectedEdgeComponents(paperBin, w, h);
  for (const pts of paperComps) best = consider(pts, best);

  const comps = connectedEdgeComponents(dil, w, h);
  for (const pts of comps) best = consider(pts, best);

  if (best.q) return best.q;

  const edgePts = [];
  const pad = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  for (let y = pad; y < h - pad; y += 1) {
    for (let x = pad; x < w - pad; x += 1) {
      if (dil[y * w + x]) edgePts.push({ x, y });
    }
  }
  best = consider(edgePts, best);
  return best.q;
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

function axisAligned(quad, tol) {
  const [tl, tr, br, bl] = orderQuad(quad);
  return (
    Math.abs(tl.y - tr.y) <= tol &&
    Math.abs(bl.y - br.y) <= tol &&
    Math.abs(tl.x - bl.x) <= tol &&
    Math.abs(tr.x - br.x) <= tol
  );
}

function cropDraw(srcCanvas, quad) {
  const xs = quad.map((p) => p.x);
  const ys = quad.map((p) => p.y);
  let x = Math.max(0, Math.floor(Math.min(...xs)));
  let y = Math.max(0, Math.floor(Math.min(...ys)));
  let x2 = Math.min(srcCanvas.width, Math.ceil(Math.max(...xs)));
  let y2 = Math.min(srcCanvas.height, Math.ceil(Math.max(...ys)));
  const w = x2 - x;
  const h = y2 - y;
  if (w < 16 || h < 16) return srcCanvas;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  ctx2d(out).drawImage(srcCanvas, x, y, w, h, 0, 0, w, h);
  return out;
}

export function warpToCanvas(srcCanvas, quad, outW, outH) {
  const corners = orderQuad(quad);
  const dst = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  const h = solveHomography(dst, corners);
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = ctx2d(out);
  const sctx = ctx2d(srcCanvas);
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
  const ctx = ctx2d(canvas);
  if (!ctx) return canvas;
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

export async function ensureCv() {
  if (typeof window !== "undefined" && window.cv && typeof window.cv.Mat === "function") return window.cv;
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const id = setInterval(() => {
      if (window.cv && typeof window.cv.Mat === "function") {
        clearInterval(id);
        resolve(window.cv);
      } else if (Date.now() - t0 > 28000) {
        clearInterval(id);
        reject(new Error("OpenCV não carregou"));
      }
    }, 40);
  });
}

function ptsFromApprox(approx) {
  const pts = [];
  const n = approx.rows;
  for (let i = 0; i < n; i++) {
    pts.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
  }
  return pts;
}

function bestQuadInContours(cv, contours, imgW, imgH) {
  const imgArea = imgW * imgH;
  let best = null;
  let bestArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = Math.abs(cv.contourArea(cnt, false));
    if (area < imgArea * 0.08 || area > imgArea * 0.97) continue;
    const peri = cv.arcLength(cnt, true);
    for (const eps of [0.02, 0.03, 0.015, 0.04, 0.05]) {
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, eps * peri, true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const pts = orderQuad(ptsFromApprox(approx));
        if (isValidQuad(pts, imgW, imgH) && area > bestArea) {
          bestArea = area;
          best = pts;
        }
      }
      approx.delete();
      if (best && eps === 0.02) break;
    }
  }
  return best;
}

function makeEdgeMats(cv, gray) {
  const out = [];
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  const pairs = [
    [50, 150],
    [30, 100],
    [75, 200],
    [20, 80],
  ];
  for (const [a, b] of pairs) {
    const edges = new cv.Mat();
    cv.Canny(gray, edges, a, b);
    cv.dilate(edges, edges, k);
    out.push(edges);
  }
  const thr = new cv.Mat();
  cv.adaptiveThreshold(gray, thr, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 21, 8);
  const inv = new cv.Mat();
  cv.bitwise_not(thr, inv);
  cv.Canny(inv, inv, 50, 150);
  cv.dilate(inv, inv, k);
  out.push(inv);
  const otsu = new cv.Mat();
  cv.threshold(gray, otsu, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  out.push(otsu);
  k.delete();
  thr.delete();
  return out;
}

export function scanWithOpenCv(cv, srcCanvas) {
  const src = cv.imread(srcCanvas);
  const mats = [src];
  try {
    const gray0 = new cv.Mat();
    mats.push(gray0);
    cv.cvtColor(src, gray0, cv.COLOR_RGBA2GRAY);
    const gray = new cv.Mat();
    mats.push(gray);
    cv.GaussianBlur(gray0, gray, new cv.Size(5, 5), 0);

    const detectW = gray.cols;
    const detectH = gray.rows;
    let quad = null;
    const edgeMats = makeEdgeMats(cv, gray);
    mats.push(...edgeMats);
    for (const bin of edgeMats) {
      const contours = new cv.MatVector();
      const hier = new cv.Mat();
      cv.findContours(bin, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      const q = bestQuadInContours(cv, contours, detectW, detectH);
      contours.delete();
      hier.delete();
      if (q) {
        quad = q;
        break;
      }
    }
    if (!quad) return null;

    const o = orderQuad(quad);
    let w = Math.round(Math.max(dist(o[0], o[1]), dist(o[3], o[2])));
    let h = Math.round(Math.max(dist(o[0], o[3]), dist(o[1], o[2])));
    w = clamp(w, 400, 1600);
    h = clamp(h, 400, 2000);
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [o[0].x, o[0].y, o[1].x, o[1].y, o[2].x, o[2].y, o[3].x, o[3].y]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const dst = new cv.Mat();
    cv.warpPerspective(src, dst, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    const out = document.createElement("canvas");
    cv.imshow(out, dst);
    srcTri.delete();
    dstTri.delete();
    M.delete();
    dst.delete();
    return out;
  } finally {
    mats.forEach((m) => {
      try {
        m.delete();
      } catch {
        /* ignore */
      }
    });
  }
}

export async function processPhoto(img, mode, look) {
  const iw = img.naturalWidth || img.videoWidth || img.width || 0;
  const ih = img.naturalHeight || img.videoHeight || img.height || 0;
  const src = document.createElement("canvas");
  const maxW = 1600;
  const scale = iw > maxW ? maxW / Math.max(1, iw) : 1;
  src.width = Math.max(1, Math.round(iw * scale));
  src.height = Math.max(1, Math.round(ih * scale));
  const sctx = ctx2d(src);
  sctx.drawImage(img, 0, 0, src.width, src.height);

  let work = src;
  const crop = mode === "auto" || mode === "" || mode == null;
  if (crop && src.width > 8 && src.height > 8) {
    let done = false;
    try {
      const cv = await ensureCv();
      const warped = scanWithOpenCv(cv, src);
      if (warped && warped.width > 16) {
        work = warped;
        done = true;
      }
    } catch (err) {
      console.warn("OpenCV scan", err);
    }
    if (!done) {
      const tryDetect = (longSide) => {
        try {
          const small = document.createElement("canvas");
          small.width = Math.max(12, Math.round((src.width * longSide) / Math.max(src.width, src.height, 1)));
          small.height = Math.max(12, Math.round((src.height * longSide) / Math.max(src.width, src.height, 1)));
          const ctx = ctx2d(small);
          ctx.drawImage(src, 0, 0, small.width, small.height);
          const id = ctx.getImageData(0, 0, small.width, small.height);
          const q = detectDocumentQuad(id, small.width, small.height);
          if (!q) return null;
          const sx = src.width / small.width;
          const sy = src.height / small.height;
          return q.map((p) => ({ x: p.x * sx, y: p.y * sy }));
        } catch {
          return null;
        }
      };
      const found = tryDetect(640) || tryDetect(420);
      if (found) {
        const quad = orderQuad(found);
        const w = Math.round(Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2])));
        const h = Math.round(Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2])));
        try {
          work = warpToCanvas(src, quad, clamp(w, 400, 1400), clamp(h, 400, 1800));
        } catch {
          work = cropDraw(src, quad);
        }
      }
    }
  }
  enhanceDocument(work, look || "color_paper");
  return work;
}
