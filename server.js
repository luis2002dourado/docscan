import express from "express";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

app.disable("x-powered-by");
app.set("trust proxy", 1);

const limiter = rateLimit({
  windowMs: 60_000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' blob: data:",
      "connect-src 'self' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
      "worker-src 'self' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
      "child-src blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ")
  );
  if (req.path.endsWith("/scanner-worker.js")) {
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'none'; worker-src 'none'");
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ error: "Método não permitido. Este site não armazena dados." });
  }
  next();
});

app.use(["/docscan", "/"],
  express.static(path.join(__dirname, "public"), {
    etag: false,
    lastModified: false,
    index: "index.html",
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, storage: "none", session: "ephemeral" });
});

app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`DocScan on http://0.0.0.0:${PORT}`);
});
