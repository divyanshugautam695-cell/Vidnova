const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const dns = require("node:dns/promises");
const ipaddr = require("ipaddr.js");
const path = require("node:path");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_SCAN_BYTES = 3 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));
const recentByIp = new Map();

function rateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (recentByIp.get(key) || []).filter(t => now - t < 60000);
  if (recent.length >= 20) return res.status(429).json({ error: "Too many requests. Please wait a minute." });
  recent.push(now);
  recentByIp.set(key, recent);
  if (recentByIp.size > 1500) for (const [k, v] of recentByIp) if (!v.length || now - v[v.length - 1] > 120000) recentByIp.delete(k);
  next();
}
app.use("/api", rateLimit);

function parseUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("Enter a full URL beginning with https:// or http://."); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only HTTP and HTTPS links are supported.");
  if (u.username || u.password) throw new Error("URLs containing usernames or passwords are not allowed.");
  return u;
}
function publicIp(address) {
  try { return ipaddr.parse(address).range() === "unicast"; } catch { return false; }
}
async function checkPublicHost(url) {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) throw new Error("Local network addresses are blocked.");
  if (ipaddr.isValid(host)) {
    if (!publicIp(host)) throw new Error("Private network addresses are blocked.");
    return;
  }
  let records;
  try { records = await dns.lookup(host, { all: true, verbatim: true }); } catch { throw new Error("The website host could not be resolved."); }
  if (!records.length || records.some(r => !publicIp(r.address))) throw new Error("This host resolves to a non-public address and is blocked.");
}
async function safeGet(raw, opts = {}) {
  let current = parseUrl(raw);
  for (let hop = 0; hop <= 3; hop++) {
    await checkPublicHost(current);
    const response = await axios.get(current.href, {
      responseType: opts.responseType || "text",
      timeout: opts.timeout || 15000,
      maxRedirects: 0,
      maxContentLength: opts.maxContentLength || MAX_SCAN_BYTES,
      validateStatus: s => s >= 200 && s < 400,
      headers: { "User-Agent": "VidNova/1.2 (authorized media source detector)", "Accept": opts.accept || "text/html,video/*;q=0.9,*/*;q=0.5" }
    });
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      if (hop === 3) throw new Error("Too many redirects.");
      current = new URL(response.headers.location, current);
      continue;
    }
    return { response, finalUrl: current.href };
  }
  throw new Error("Could not open that URL.");
}
function absolute(raw, base) {
  try { const u = new URL(raw, base); return ["http:", "https:"].includes(u.protocol) ? u.href : null; } catch { return null; }
}
function looksLikeVideo(url, type = "") {
  return /^video\//i.test(type) || /\.(mp4|webm|mov|m4v|ogv|m3u8|mpd)(?:$|[?#])/i.test(url);
}
function scanHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  const found = new Map();
  function add(raw, label, type, source) {
    const url = absolute(raw, baseUrl);
    if (!url || !looksLikeVideo(url, type || "")) return;
    if (!found.has(url)) found.set(url, { url, label: label || "Detected video", type: type || "Video source", source });
  }
  $("video").each((_, el) => {
    const label = $(el).attr("aria-label") || $(el).attr("title") || "Video element";
    add($(el).attr("src"), label, $(el).attr("type"), "video tag");
    $(el).find("source").each((__, src) => add($(src).attr("src"), label, $(src).attr("type"), "source tag"));
  });
  ['meta[property="og:video"]','meta[property="og:video:url"]','meta[name="twitter:player:stream"]'].forEach(sel => {
    $(sel).each((_, el) => add($(el).attr("content"), "Page video metadata", $(el).attr("type"), "metadata"));
  });
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href && looksLikeVideo(href)) add(href, $(el).text().trim() || "Video link", "", "link");
  });
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const visit = obj => {
        if (!obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) return obj.forEach(visit);
        if (/VideoObject/i.test(String(obj["@type"] || ""))) {
          add(obj.contentUrl, obj.name || "Structured video", obj.encodingFormat || "", "JSON-LD");
          add(obj.embedUrl, obj.name || "Embedded video", obj.encodingFormat || "", "JSON-LD");
        }
        Object.values(obj).forEach(v => { if (v && typeof v === "object") visit(v); });
      };
      visit(JSON.parse($(el).text()));
    } catch {}
  });
  return [...found.values()].slice(0, 40);
}
app.get("/api/health", (_req, res) => res.json({ ok: true, app: "VidNova", version: "1.2.0" }));
app.post("/api/scan", async (req, res) => {
  try {
    const raw = String(req.body && req.body.url || "").trim();
    if (!raw) return res.status(400).json({ error: "Paste a website URL first." });
    const { response, finalUrl } = await safeGet(raw);
    const type = String(response.headers["content-type"] || "");
    if (looksLikeVideo(finalUrl, type)) return res.json({ pageUrl: finalUrl, videos: [{ url: finalUrl, label: "Direct media source", type: type || "Media file", source: "URL" }], mode: "static" });
    if (!/html|xhtml/i.test(type)) return res.json({ pageUrl: finalUrl, videos: [], note: "This URL did not return a readable HTML page." });
    res.json({ pageUrl: finalUrl, videos: scanHtml(String(response.data), finalUrl), mode: "static" });
  } catch (e) { res.status(400).json({ error: e.message || "Could not scan this page." }); }
});
app.post("/api/smart-scan", async (req, res) => {
  let browser;
  try {
    const raw = String(req.body && req.body.url || "").trim();
    if (!raw) return res.status(400).json({ error: "Paste a website URL first." });
    const start = parseUrl(raw);
    await checkPublicHost(start);
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const page = await browser.newPage({ acceptDownloads: false });
    const found = new Map();
    page.on("response", response => {
      const url = response.url();
      const type = response.headers()["content-type"] || "";
      if (looksLikeVideo(url, type) && !found.has(url)) found.set(url, { url, label: "Loaded media request", type, source: "browser network" });
    });
    await page.route("**/*", async route => {
      try {
        const u = parseUrl(route.request().url());
        await checkPublicHost(u);
        await route.continue();
      } catch { await route.abort(); }
    });
    await page.goto(start.href, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(2500);
    const html = await page.content();
    scanHtml(html, page.url()).forEach(v => { if (!found.has(v.url)) found.set(v.url, v); });
    res.json({ pageUrl: page.url(), videos: [...found.values()].slice(0, 40), mode: "smart" });
  } catch (e) { res.status(400).json({ error: e.message || "Smart Scan could not open this page." }); }
  finally { if (browser) await browser.close().catch(() => {}); }
});
app.get("/api/download", async (req, res) => {
  try {
    const raw = String(req.query.url || "");
    if (!raw) return res.status(400).send("Missing media URL.");
    const { response, finalUrl } = await safeGet(raw, { responseType: "stream", timeout: 20000, maxContentLength: MAX_DOWNLOAD_BYTES, accept: "video/*,application/octet-stream,*/*;q=0.5" });
    const length = Number(response.headers["content-length"] || 0);
    if (length > MAX_DOWNLOAD_BYTES) { response.data.destroy(); return res.status(413).send("File exceeds the 200 MiB limit."); }
    const pathname = new URL(finalUrl).pathname;
    let filename = pathname.split("/").pop() || "vidnova-media";
    filename = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "vidnova-media";
    res.setHeader("Content-Type", response.headers["content-type"] || "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="' + filename.replace(/"/g, "") + '"');
    res.setHeader("X-Content-Type-Options", "nosniff");
    let total = 0;
    response.data.on("data", chunk => {
      total += chunk.length;
      if (total > MAX_DOWNLOAD_BYTES) { response.data.destroy(new Error("Download size limit exceeded")); res.destroy(); }
    });
    response.data.on("error", () => { if (!res.headersSent) res.status(502).end("Media transfer failed."); else res.destroy(); });
    response.data.pipe(res);
  } catch (e) { if (!res.headersSent) res.status(400).send(e.message || "Download failed."); }
});
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, "0.0.0.0", () => console.log("VidNova listening on port " + PORT));