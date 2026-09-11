import {
  allowedFile,
  MAX_BYTES,
  sanitizeFilename,
  escapeText,
  processPhoto,
  enhanceDocument,
  isValidQuad,
} from "./vision.js";

const pdfjsLib = window.pdfjsLib;
const PDFLib = window.PDFLib;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.update());
  });
  navigator.serviceWorker.register(new URL("./sw.js", import.meta.url)).catch((err) => console.warn("SW", err));
}
const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstall = e;
});
window.addEventListener("appinstalled", () => {
  deferredInstall = null;
  const btn = document.getElementById("install-btn");
  if (btn) btn.classList.add("hide");
});
document.addEventListener("click", async (e) => {
  if (!e.target || e.target.id !== "install-btn") return;
  if (standalone) {
    toast("O DocScan já está instalado.");
    return;
  }
  if (deferredInstall) {
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    return;
  }
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) {
    toast("No Safari: Compartilhar → Adicionar à Tela de Início.");
  } else if (/android/i.test(ua)) {
    toast("No Chrome: menu ⋮ → Instalar aplicativo (ou Adicionar à tela inicial).");
  } else {
    toast("No Chrome ou Edge: ícone de instalar na barra de endereço, ou menu → Instalar DocScan.");
  }
});

const $ = (id) => document.getElementById(id);
const on = (id, ev, fn) => {
  const el = $(id);
  if (el) el.addEventListener(ev, fn);
  return el;
};
const toast = (m) => {
  let t = $("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = m;
  t.classList.remove("hide");
  t.style.animation = "none";
  void t.offsetWidth;
  t.style.animation = "";
  setTimeout(() => t.classList.add("hide"), 2400);
};

let scanBusy = false;
function fxShow(msg) {
  scanBusy = true;
  $("fx-msg").textContent = msg;
  $("fx").classList.remove("hide");
}
function fxHide() {
  scanBusy = false;
  $("fx").classList.add("hide");
}
function burst(x, y) {
  const b = document.createElement("div");
  b.className = "burst";
  b.style.left = x + "px";
  b.style.top = y + "px";
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 700);
}
document.addEventListener("click", (e) => {
  if (e.target.closest(".chip, .tab, .go, .meta button")) burst(e.clientX, e.clientY);
});

try {
  localStorage.clear();
  sessionStorage.clear();
} catch {
  /* ignore */
}

const urls = new Set();
function trackUrl(u) {
  urls.add(u);
  return u;
}
function wipeSession() {
  scanPages.length = 0;
  mergeItems.length = 0;
  editState = null;
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
  $("scan-grid").innerHTML = "";
  $("merge-list").innerHTML = "";
  $("edit-grid").innerHTML = "";
  $("scan-empty").classList.remove("hide");
  $("merge-empty").classList.remove("hide");
  $("edit-empty").classList.remove("hide");
}
window.addEventListener("pagehide", () => {});

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("on"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("on"));
    btn.classList.add("on");
    $("panel-" + btn.dataset.tab).classList.add("on");
  });
});

function readFile(file, kind) {
  if (!allowedFile(file.name, file.type, kind)) {
    toast("Tipo de arquivo não permitido.");
    return null;
  }
  if (file.size > MAX_BYTES) {
    toast("Arquivo maior que 25 MB.");
    return null;
  }
  return file;
}

/* SCAN */
const scanPages = [];

function bitmapToCanvas(bmp) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, bmp.width);
  c.height = Math.max(1, bmp.height);
  c.getContext("2d").drawImage(bmp, 0, 0);
  if (bmp.close) bmp.close();
  return c;
}

async function loadImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      let bmp;
      try {
        bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        bmp = await createImageBitmap(file);
      }
      if (bmp && bmp.width && bmp.height) return bitmapToCanvas(bmp);
    } catch {
      /* fallback */
    }
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = new Image();
  img.src = dataUrl;
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
  });
  if (img.decode) {
    try {
      await img.decode();
    } catch {
      /* ignore */
    }
  }
  const c = document.createElement("canvas");
  c.width = Math.max(1, img.naturalWidth || img.width);
  c.height = Math.max(1, img.naturalHeight || img.height);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function scanSettings() {
  const modeBtn = document.querySelector("#mode-btns .look.on");
  const lookBtn = document.querySelector("#look-btns .look.on");
  return {
    mode: (modeBtn && modeBtn.dataset.mode) || ($("scan-mode") && $("scan-mode").value) || "auto",
    look: (lookBtn && lookBtn.dataset.look) || ($("scan-look") && $("scan-look").value) || "color_paper",
  };
}

async function pdfPagesToImages(file) {
  if (!pdfjsLib) throw new Error("PDF.js não carregou");
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const imgs = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const img = new Image();
    img.src = canvas.toDataURL("image/jpeg", 0.92);
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });
    imgs.push(img);
  }
  return imgs;
}

function thumbData(img) {
  const c = document.createElement("canvas");
  const max = 280;
  const s = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
  c.width = Math.max(1, Math.round((img.width || 100) * s));
  c.height = Math.max(1, Math.round((img.height || 100) * s));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}

async function addImages(files) {
  const list = [...files];
  if (!list.length || scanBusy) return;
  fxShow("Lendo arquivos…");
  try {
    for (const raw of list) {
      const file = readFile(raw, "image");
      if (!file) continue;
      const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
      const sources = isPdf ? await pdfPagesToImages(file) : [await loadImage(file)];
      for (const img of sources) {
        scanPages.push({
          img,
          preview: thumbData(img),
          canvas: null,
          base: null,
          cropMode: "",
          name: sanitizeFilename(file.name),
          text: "",
        });
      }
    }
    updateQueue();
    toast("Pré-visualização pronta. Confira abaixo do botão Enviar.");
  } catch (err) {
    console.error(err);
    toast("Falha ao ler o arquivo.");
  } finally {
    fxHide();
  }
}

function updateQueue() {
  const el = $("scan-queue");
  if (el) {
    const n = scanPages.length;
    el.textContent = n
      ? n + " arquivo(s) na fila — pré-visualização:"
      : "Nenhum arquivo na fila.";
  }
  let box = $("scan-preview");
  if (!box && el) {
    box = document.createElement("div");
    box.id = "scan-preview";
    box.className = "grid preview-grid";
    el.insertAdjacentElement("afterend", box);
  }
  if (!box) return;
  box.innerHTML = "";
  scanPages.forEach((p, i) => {
    const card = document.createElement("article");
    card.className = "card";
    const src = p.preview || (p.img && p.img.src) || "";
    card.innerHTML =
      `<div class="thumb"><img alt="Prévia ${i + 1}" src="${src}"></div>` +
      `<div class="meta"><span>Fila ${i + 1}</span><button type="button" data-corners="${i}">Ajustar cantos</button><button type="button" data-qrm="${i}">✕</button></div>`;
    box.appendChild(card);
  });
}

function nextPaint() {
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

async function reprocessScan() {
  if (scanBusy) return;
  if (!scanPages.length) {
    toast("Envie um arquivo primeiro.");
    return;
  }
  const { mode, look } = scanSettings();
  const doOcr = $("scan-ocr") && $("scan-ocr").checked;
  fxShow("Recortando e endireitando a folha…");
  await nextPaint();
  try {
    for (let i = 0; i < scanPages.length; i++) {
      const p = scanPages[i];
      if (scanPages.length > 1) fxShow(`Recortando e endireitando (${i + 1}/${scanPages.length})…`);
      p.text = "";
      if (!p.base || p.cropMode !== mode) p.base = await processPhoto(p.img, mode, "original", p.manual);
      p.scanInfo = p.base.scanInfo;
      p.cropMode = mode;
      const copy = document.createElement("canvas");
      copy.width = p.base.width;
      copy.height = p.base.height;
      copy.getContext("2d").drawImage(p.base, 0, 0);
      p.canvas = enhanceDocument(copy, look);
      if (doOcr && window.Tesseract) {
        try {
          const res = await Tesseract.recognize(p.canvas, "por+eng", { logger: () => {} });
          p.text = (res.data && res.data.text) || "";
        } catch {
          p.text = "";
        }
      }
      await nextPaint();
    }
    renderScan();
    const missed = scanPages.filter(p => p.scanInfo?.status === "not-found").length;
    toast(missed ? `${missed} página(s) sem recorte seguro. Use Ajustar cantos.` : "Pronto. Confira o resultado abaixo.");
  } catch (err) {
    console.error(err);
    toast(err.message || "Não deu para aplicar o filtro.");
  } finally {
    fxHide();
  }
}
$("scan-look").addEventListener("change", () => {});
$("scan-mode").addEventListener("change", () => {});

document.getElementById("mode-btns").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-mode]");
  if (!btn) return;
  $("scan-mode").value = btn.dataset.mode;
  document.querySelectorAll("#mode-btns .look").forEach((b) => b.classList.toggle("on", b === btn));
});
document.getElementById("look-btns").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-look]");
  if (!btn) return;
  $("scan-look").value = btn.dataset.look;
  document.querySelectorAll("#look-btns .look").forEach((b) => b.classList.toggle("on", b === btn));
});
on("scan-apply", "click", () => reprocessScan());
document.addEventListener("click", (e) => {
  const t = e.target;
  if (scanBusy || !t || !t.dataset || t.dataset.qrm === undefined) return;
  if (!t.closest("#scan-preview")) return;
  scanPages.splice(Number(t.dataset.qrm), 1);
  updateQueue();
  renderScan();
});

function renderScan() {
  updateQueue();
  $("scan-empty").classList.toggle("hide", scanPages.some((p) => p.canvas));
  const grid = $("scan-grid");
  grid.innerHTML = "";
  scanPages.forEach((p, i) => {
    if (!p.canvas) return;
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<div class="thumb"></div>
      <div class="meta"><span>Pág. ${i + 1}</span>
        <span>
          <button type="button" data-up="${i}">↑</button>
          <button type="button" data-dn="${i}">↓</button>
          <button type="button" data-rm="${i}">✕</button>
        </span>
      </div>
      <p class="note crop-status">${p.scanInfo?.status === "not-found" ? "Folha não identificada. Foto inteira preservada; ajuste os cantos." : p.scanInfo?.status === "review" ? "Bordas incertas. Foto inteira preservada; confirme os cantos no ajuste manual." : p.scanInfo?.status === "manual" ? "Recorte ajustado manualmente." : p.scanInfo?.status === "detected" ? "Perspectiva corrigida. Confira as bordas." : "Foto inteira."}</p>
      ${p.text ? `<div class="ocr">${escapeText(p.text)}</div>` : ""}`;
    card.style.animationDelay = i * 70 + "ms";
    card.querySelector(".thumb").appendChild(p.canvas);
    grid.appendChild(card);
  });
}

$("scan-files").addEventListener("change", (e) => {
  addImages([...e.target.files]);
  e.target.value = "";
});
$("scan-cam").addEventListener("change", (e) => {
  addImages([...e.target.files]);
  e.target.value = "";
});
$("scan-grid").addEventListener("click", (e) => {
  if (scanBusy) return;
  const up = e.target.dataset.up;
  const dn = e.target.dataset.dn;
  const rm = e.target.dataset.rm;
  if (up && Number(up) > 0) {
    const i = Number(up);
    [scanPages[i - 1], scanPages[i]] = [scanPages[i], scanPages[i - 1]];
  }
  if (dn && Number(dn) < scanPages.length - 1) {
    const i = Number(dn);
    [scanPages[i + 1], scanPages[i]] = [scanPages[i], scanPages[i + 1]];
  }
  if (rm) scanPages.splice(Number(rm), 1);
  if (up || dn || rm) renderScan();
});
$("scan-clear").addEventListener("click", () => {
  if (scanBusy) return;
  scanPages.length = 0;
  renderScan();
});
$("scan-export").addEventListener("click", async () => {
  if (!scanPages.some((p) => p.canvas)) return toast("Aplique as mudanças primeiro.");
  const nome = await askPdfName("documento");
  if (!nome) return;
  fxShow("Gerando PDF…");
  try {
    const { PDFDocument } = PDFLib;
    const pdf = await PDFDocument.create();
    for (const p of scanPages) {
      if (!p.canvas) continue;
      const blob = await new Promise((r) => p.canvas.toBlob(r, "image/jpeg", 0.88));
      const img = await pdf.embedJpg(await blob.arrayBuffer());
      const page = pdf.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    await downloadPdf(pdf, nome);
  } finally {
    fxHide();
  }
});

const drop = $("panel-scan");
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  $("scan-empty").classList.add("drag");
});
drop.addEventListener("dragleave", () => $("scan-empty").classList.remove("drag"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  $("scan-empty").classList.remove("drag");
  addImages([...e.dataTransfer.files]);
});

/* MERGE */
const mergeItems = [];
$("merge-files").addEventListener("change", async (e) => {
  fxShow("Lendo PDFs…");
  for (const raw of e.target.files) {
    const file = readFile(raw, "pdf");
    if (!file) continue;
    mergeItems.push({ name: sanitizeFilename(file.name), bytes: new Uint8Array(await file.arrayBuffer()) });
  }
  e.target.value = "";
  renderMerge();
  fxHide();
});
function renderMerge() {
  $("merge-empty").classList.toggle("hide", mergeItems.length > 0);
  $("merge-list").innerHTML = mergeItems
    .map(
      (it, i) =>
        `<div class="row"><strong>${escapeText(it.name)}</strong>
        <span>
          <button type="button" data-up="${i}">↑</button>
          <button type="button" data-dn="${i}">↓</button>
          <button type="button" data-rm="${i}">✕</button>
        </span></div>`
    )
    .join("");
}
$("merge-list").addEventListener("click", (e) => {
  const up = e.target.dataset.up,
    dn = e.target.dataset.dn,
    rm = e.target.dataset.rm;
  if (up && Number(up) > 0) {
    const i = Number(up);
    [mergeItems[i - 1], mergeItems[i]] = [mergeItems[i], mergeItems[i - 1]];
  }
  if (dn && Number(dn) < mergeItems.length - 1) {
    const i = Number(dn);
    [mergeItems[i + 1], mergeItems[i]] = [mergeItems[i], mergeItems[i + 1]];
  }
  if (rm) mergeItems.splice(Number(rm), 1);
  if (up || dn || rm) renderMerge();
});
$("merge-clear").addEventListener("click", () => {
  mergeItems.length = 0;
  renderMerge();
});
$("merge-export").addEventListener("click", async () => {
  if (!mergeItems.length) return toast("Adicione PDFs.");
  const nome = await askPdfName("unido");
  if (!nome) return;
  fxShow("Unindo PDFs…");
  try {
    const { PDFDocument } = PDFLib;
    const out = await PDFDocument.create();
    for (const it of mergeItems) {
      const src = await PDFDocument.load(it.bytes);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    await downloadPdf(out, nome);
  } finally {
    fxHide();
  }
});

/* EDIT */
let editState = null;
if (pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    new URL("./vendor/pdf.worker.min.js", import.meta.url).href;
}

$("edit-file").addEventListener("change", async (e) => {
  const file = readFile(e.target.files[0], "pdf");
  e.target.value = "";
  if (!file) return;
  fxShow("Abrindo páginas…");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await PDFLib.PDFDocument.load(bytes);
  editState = {
    bytes,
    rotations: pdf.getPages().map((p) => p.getRotation().angle || 0),
    order: pdf.getPageIndices(),
    deleted: new Set(),
    texts: [],
  };
  await renderEdit();
  fxHide();
});

async function renderEdit() {
  if (!editState) {
    $("edit-empty").classList.remove("hide");
    $("edit-grid").innerHTML = "";
    return;
  }
  $("edit-empty").classList.add("hide");
  const loading = await pdfjsLib.getDocument({ data: editState.bytes.slice(0) }).promise;
  const grid = $("edit-grid");
  grid.innerHTML = "";
  for (const pageIndex of editState.order) {
    if (editState.deleted.has(pageIndex)) continue;
    const page = await loading.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 0.32, rotation: editState.rotations[pageIndex] });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<div class="thumb"></div>
      <div class="meta"><span>Pág. ${pageIndex + 1}</span>
        <span>
          <button type="button" data-rot="${pageIndex}">⟳</button>
          <button type="button" data-up="${pageIndex}">↑</button>
          <button type="button" data-dn="${pageIndex}">↓</button>
          <button type="button" data-rm="${pageIndex}">✕</button>
        </span></div>`;
    card.querySelector(".thumb").appendChild(canvas);
    grid.appendChild(card);
  }
}

$("edit-grid").addEventListener("click", async (e) => {
  if (!editState) return;
  const rot = e.target.dataset.rot,
    up = e.target.dataset.up,
    dn = e.target.dataset.dn,
    rm = e.target.dataset.rm;
  if (rot) editState.rotations[Number(rot)] = (editState.rotations[Number(rot)] + 90) % 360;
  if (up) {
    const i = editState.order.indexOf(Number(up));
    if (i > 0) [editState.order[i - 1], editState.order[i]] = [editState.order[i], editState.order[i - 1]];
  }
  if (dn) {
    const i = editState.order.indexOf(Number(dn));
    if (i < editState.order.length - 1)
      [editState.order[i + 1], editState.order[i]] = [editState.order[i], editState.order[i + 1]];
  }
  if (rm) editState.deleted.add(Number(rm));
  if (rot || up || dn || rm) await renderEdit();
});
$("edit-clear").addEventListener("click", () => {
  editState = null;
  renderEdit();
});
$("edit-text").addEventListener("click", () => {
  if (!editState) return toast("Abra um PDF.");
  const sel = $("text-page");
  sel.innerHTML = "";
  editState.order
    .filter((i) => !editState.deleted.has(i))
    .forEach((idx, n) => {
      const o = document.createElement("option");
      o.value = idx;
      o.textContent = "Página " + (n + 1);
      sel.appendChild(o);
    });
  $("modal").classList.remove("hide");
});
$("text-cancel").addEventListener("click", () => $("modal").classList.add("hide"));
$("text-ok").addEventListener("click", () => {
  const text = $("text-content").value.slice(0, 200);
  editState.texts.push({
    page: Number($("text-page").value),
    text,
    x: Number($("text-x").value),
    y: Number($("text-y").value),
  });
  $("modal").classList.add("hide");
  toast("Texto na fila de salvamento.");
});
$("edit-export").addEventListener("click", async () => {
  if (!editState) return toast("Abra um PDF.");
  const nome = await askPdfName("editado");
  if (!nome) return;
  fxShow("Salvando PDF…");
  const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
  const src = await PDFDocument.load(editState.bytes);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const keep = editState.order.filter((i) => !editState.deleted.has(i));
  const copied = await out.copyPages(src, keep);
  copied.forEach((page, n) => {
    const orig = keep[n];
    page.setRotation(degrees(editState.rotations[orig] || 0));
    const { width, height } = page.getSize();
    editState.texts
      .filter((t) => t.page === orig && t.text)
      .forEach((t) => {
        page.drawText(t.text, {
          x: (t.x / 100) * width,
          y: height - (t.y / 100) * height - 14,
          size: 14,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
      });
    out.addPage(page);
  });
  await downloadPdf(out, nome);
  fxHide();
});

function askPdfName(sugestao) {
  return new Promise((resolve) => {
    const modal = $("name-modal");
    const input = $("pdf-name");
    if (!modal || !input) {
      const n = window.prompt("Como vai se chamar o PDF?", sugestao);
      resolve(n ? n.replace(/\.pdf$/i, "").trim() : null);
      return;
    }
    input.value = sugestao;
    modal.classList.remove("hide");
    input.focus();
    input.select();
    const done = (val) => {
      modal.classList.add("hide");
      $("name-ok").removeEventListener("click", ok);
      $("name-cancel").removeEventListener("click", cancel);
      input.removeEventListener("keydown", key);
      resolve(val);
    };
    const ok = () => {
      let n = (input.value || "").trim() || sugestao;
      n = n.replace(/\.pdf$/i, "");
      done(n);
    };
    const cancel = () => done(null);
    const key = (e) => {
      if (e.key === "Enter") ok();
      if (e.key === "Escape") cancel();
    };
    $("name-ok").addEventListener("click", ok);
    $("name-cancel").addEventListener("click", cancel);
    input.addEventListener("keydown", key);
  });
}

async function downloadPdf(pdf, name) {
  const bytes = await pdf.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = trackUrl(URL.createObjectURL(blob));
  a.download = sanitizeFilename(name) + (String(name).toLowerCase().endsWith(".pdf") ? "" : ".pdf");
  a.click();
  toast("Salvo como " + a.download);
}

function printCanvases(canvases) {
  if (!canvases.length) return toast("Nada para imprimir.");
  const w = window.open("", "_blank");
  if (!w) return toast("Permita pop-ups para imprimir.");
  w.document.write(
    `<html><head><title>Imprimir</title><style>
      @page { margin: 10mm; }
      body { margin: 0; }
      img { width: 100%; page-break-after: always; display: block; }
    </style></head><body></body></html>`
  );
  canvases.forEach((c) => {
    const img = w.document.createElement("img");
    img.src = c.toDataURL("image/jpeg", 0.92);
    w.document.body.appendChild(img);
  });
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

async function printPdfBytes(bytes) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = trackUrl(URL.createObjectURL(blob));
  const w = window.open(url, "_blank");
  if (!w) return toast("Permita pop-ups para imprimir.");
  setTimeout(() => {
    try {
      w.print();
    } catch {
      /* ignore */
    }
  }, 800);
}

$("scan-print").addEventListener("click", () => {
  printCanvases(scanPages.map((p) => p.canvas).filter(Boolean));
});
$("merge-print").addEventListener("click", async () => {
  if (!mergeItems.length) return toast("Adicione PDFs.");
  fxShow("Preparando impressão…");
  const { PDFDocument } = PDFLib;
  const out = await PDFDocument.create();
  for (const it of mergeItems) {
    const src = await PDFDocument.load(it.bytes);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  await printPdfBytes(await out.save());
  fxHide();
});
on("edit-print", "click", async () => {
  if (!editState) return toast("Abra um PDF.");
  fxShow("Preparando impressão…");
  const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
  const src = await PDFDocument.load(editState.bytes);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const keep = editState.order.filter((i) => !editState.deleted.has(i));
  const copied = await out.copyPages(src, keep);
  copied.forEach((page, n) => {
    const orig = keep[n];
    page.setRotation(degrees(editState.rotations[orig] || 0));
    const { width, height } = page.getSize();
    editState.texts
      .filter((t) => t.page === orig && t.text)
      .forEach((t) => {
        page.drawText(t.text, {
          x: (t.x / 100) * width,
          y: height - (t.y / 100) * height - 14,
          size: 14,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
      });
    out.addPage(page);
  });
  await printPdfBytes(await out.save());
  fxHide();
});


// Explicit corner review also handles low contrast, shadows and clipped documents.
let cornerPage=null,cornerPoints=[],dragCorner=-1;
const cornerCanvas=$("corner-canvas");
function drawCorners() {
  const ctx=cornerCanvas.getContext('2d');
  ctx.clearRect(0,0,cornerCanvas.width,cornerCanvas.height);
  ctx.drawImage(cornerPage.img,0,0,cornerCanvas.width,cornerCanvas.height);
  ctx.strokeStyle='#FFBE0B';ctx.lineWidth=3;ctx.fillStyle='rgba(255,190,11,0.12)';
  ctx.beginPath();cornerPoints.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*(cornerCanvas.width-1),p.y*(cornerCanvas.height-1)));ctx.closePath();ctx.fill();ctx.stroke();
  cornerPoints.forEach((p,i)=>{
    const x=p.x*(cornerCanvas.width-1),y=p.y*(cornerCanvas.height-1);
    ctx.beginPath();ctx.arc(x,y,13,0,Math.PI*2);ctx.fillStyle='#2A2312';ctx.fill();ctx.stroke();
    ctx.fillStyle='white';ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(i+1,x,y);
  });
}
function fitCorners() {
  if(!cornerPage)return;
  const stage=$('corner-stage'),w=cornerPage.img.naturalWidth||cornerPage.img.width,h=cornerPage.img.naturalHeight||cornerPage.img.height;
  const scale=Math.min(stage.clientWidth/w,stage.clientHeight/h,1);
  cornerCanvas.style.width=Math.floor(w*scale)+'px';cornerCanvas.style.height=Math.floor(h*scale)+'px';
  // Keep handles readable and hittable even for tall photographs on short screens.
  cornerCanvas.width=Math.max(1,Math.floor(w*scale));cornerCanvas.height=Math.max(1,Math.floor(h*scale));drawCorners();
}
new ResizeObserver(fitCorners).observe($('corner-stage'));
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-corners]');if(!button||scanBusy)return;
  cornerPage=scanPages[Number(button.dataset.corners)];
  const w=cornerPage.img.naturalWidth||cornerPage.img.width,h=cornerPage.img.naturalHeight||cornerPage.img.height;
  const scale=Math.min(1,850/Math.max(w,h));cornerCanvas.width=Math.round(w*scale);cornerCanvas.height=Math.round(h*scale);
  cornerPoints=(cornerPage.manual||cornerPage.scanInfo?.quad||[{x:.05,y:.05},{x:.95,y:.05},{x:.95,y:.95},{x:.05,y:.95}]).map(p=>({...p}));
  $('corner-modal').classList.remove('hide');document.body.classList.add('adjusting-corners');fitCorners();$('corner-save').focus({preventScroll:true});
});
function pointerCorner(e) {
  const r=cornerCanvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};
}
cornerCanvas.addEventListener('pointerdown',e=>{
  e.preventDefault();const p=pointerCorner(e),r=cornerCanvas.getBoundingClientRect();
  const distances=cornerPoints.map(q=>Math.hypot((q.x-p.x)*r.width,(q.y-p.y)*r.height));
  dragCorner=distances.indexOf(Math.min(...distances));
  if(distances[dragCorner]>44){dragCorner=-1;return;}
  cornerCanvas.setPointerCapture(e.pointerId);
});
cornerCanvas.addEventListener('pointermove',e=>{if(dragCorner<0)return;cornerPoints[dragCorner]=pointerCorner(e);drawCorners();});
for(const name of ['pointerup','pointercancel','lostpointercapture'])cornerCanvas.addEventListener(name,()=>{dragCorner=-1;});
$('corner-cancel').addEventListener('click',()=>{$('corner-modal').classList.add('hide');document.body.classList.remove('adjusting-corners');cornerPage=null;});
$('corner-auto').addEventListener('click',()=>{
  cornerPage.manual=null;cornerPage.base=null;cornerPage.canvas=null;cornerPage.scanInfo=null;
  $('corner-modal').classList.add('hide');document.body.classList.remove('adjusting-corners');cornerPage=null;renderScan();
  document.querySelector('[data-mode="auto"]').click();reprocessScan();
});
$('corner-save').addEventListener('click',()=>{
  const q=cornerPoints.map(p=>({x:p.x*999,y:p.y*999}));
  if(!isValidQuad(q,1000,1000)){toast('Os cantos precisam contornar a folha sem cruzar as bordas.');return;}
  cornerPage.manual=cornerPoints.map(p=>({...p}));cornerPage.base=null;cornerPage.canvas=null;
  $('corner-modal').classList.add('hide');document.body.classList.remove('adjusting-corners');cornerPage=null;renderScan();
  document.querySelector('[data-mode="auto"]').click();reprocessScan();
});
