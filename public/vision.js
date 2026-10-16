import "./scanner-core.js";
export const {orderQuad,quadArea,isValidQuad,dist,solveHomography,applyHomography}=globalThis.DocScanEngine;
export const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
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


let worker=null,sequence=0;
const pending=new Map();
function stopWorker(message) {
  worker?.terminate();worker=null;
  for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error(message));}
  pending.clear();
}
function runScanner(imageData,manual) {
  if(!worker) {
    worker=new Worker(new URL("./scanner-worker.js",import.meta.url));
    worker.onmessage=({data})=>{
      const task=pending.get(data.id);if(!task)return;
      clearTimeout(task.timer);pending.delete(data.id);
      if(data.error)task.reject(new Error(data.error));else task.resolve(data);
    };
    worker.onerror=()=>stopWorker("Não foi possível carregar o motor de recorte. Recarregue o aplicativo.");
  }
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>stopWorker("O recorte demorou demais. Tente uma imagem menor."),120000);
    pending.set(id,{resolve,reject,timer});
    worker.postMessage({id,width:imageData.width,height:imageData.height,buffer:imageData.data.buffer,manual},[imageData.data.buffer]);
  });
}
export async function processPhoto(img,mode,look,manual=null) {
  const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
  if(!iw||!ih)throw new Error("Imagem inválida.");
  const scale=Math.min(1,2400/Math.max(iw,ih));
  const src=document.createElement("canvas");
  src.width=Math.max(1,Math.round(iw*scale));src.height=Math.max(1,Math.round(ih*scale));
  ctx2d(src).drawImage(img,0,0,src.width,src.height);
  src.scanInfo={status:'full-image',quad:null};
  if(mode!=='none') {
    const corners=manual?.map(p=>({x:p.x*(src.width-1),y:p.y*(src.height-1)}));
    const result=await runScanner(ctx2d(src).getImageData(0,0,src.width,src.height),corners);
    const sourceW=src.width,sourceH=src.height;
    src.width=result.width;src.height=result.height;
    ctx2d(src).putImageData(new ImageData(new Uint8ClampedArray(result.buffer),result.width,result.height),0,0);
    src.scanInfo={status:result.status,confidence:result.confidence,quad:result.quad?.map(p=>({x:p.x/(sourceW-1),y:p.y/(sourceH-1)}))||null};
  }
  return enhanceDocument(src,look||'color_paper');
}
