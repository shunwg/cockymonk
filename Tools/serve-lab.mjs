#!/usr/bin/env node
// Static server for the Lab. Serves the repo root so /Lab/... and /Resources/... both resolve.
// Usage: node Tools/serve-lab.mjs [port]   (default 8787). Zero dependencies.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.argv[2]) || 8787;
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".ogg": "audio/ogg", ".woff2": "font/woff2", ".ttf": "font/ttf",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let path = decodeURIComponent(url.pathname);
    if (path === "/" || path === "/Lab" || path === "/Lab/") path = "/Lab/index.html";
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(normalize(ROOT + sep))) { res.writeHead(403).end("forbidden"); return; }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}).listen(PORT, () => console.log(`Lab → http://localhost:${PORT}/  (root: ${ROOT})`));
