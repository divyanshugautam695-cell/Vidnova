const byId = id => document.getElementById(id);
const scanForm = byId("scan-form"), urlInput = byId("url-input"), scanBtn = byId("scan-btn"), smartBtn = byId("smart-scan");
const message = byId("scan-message"), results = byId("results"), count = byId("result-count");
const browseForm = byId("browse-form"), browseInput = byId("browse-input"), frame = byId("browser-frame");
const placeholder = byId("browser-placeholder"), hostLabel = byId("browser-host"), openTab = byId("open-tab"), scanBrowser = byId("scan-browser");
let currentBrowserUrl = "";
function normalizeUrl(raw) {
  let value = String(raw || "").trim();
  if (!value) throw new Error("Enter a website URL first.");
  if (!/^https?:\/\//i.test(value)) value = "https://" + value;
  const u = new URL(value);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only HTTP and HTTPS URLs are supported.");
  return u.href;
}
function showMessage(text, kind = "") { message.textContent = text; message.className = "message " + kind; message.hidden = false; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function mediaType(v) {
  const u = String(v.url || "").toLowerCase();
  if (u.includes(".m3u8")) return "HLS playlist";
  if (u.includes(".mpd")) return "DASH manifest";
  if (u.includes(".webm")) return "WebM video";
  if (u.includes(".mov")) return "MOV video";
  if (u.includes(".mp4") || /video\//i.test(v.type || "")) return "Video file";
  return v.type || "Media source";
}
function renderResults(videos) {
  count.textContent = String(videos.length);
  if (!videos.length) {
    results.innerHTML = '<div class="empty"><div class="play">↗</div><strong>No source detected</strong><span>Try Smart Scan, or use a direct public media URL.</span></div>';
    return;
  }
  results.innerHTML = videos.map((v, i) => {
    const url = escapeHtml(v.url || "");
    return '<article class="source-item"><div class="source-icon">▶</div><div class="source-info"><strong>' + escapeHtml(v.label || ("Video source " + (i + 1))) + '</strong><small>' + escapeHtml(mediaType(v)) + ' · ' + escapeHtml(v.source || "Detected source") + '</small></div><div class="source-actions"><button type="button" class="preview-action" data-url="' + url + '" aria-label="Open source">↗</button><a href="/api/download?url=' + encodeURIComponent(v.url || "") + '" aria-label="Download media" rel="nofollow">↓</a></div></article>';
  }).join("");
  results.querySelectorAll(".preview-action").forEach(btn => btn.addEventListener("click", () => window.open(btn.dataset.url, "_blank", "noopener,noreferrer")));
}
async function performScan(url, smart) {
  scanBtn.disabled = true; smartBtn.disabled = true;
  scanBtn.textContent = smart ? "Smart scanning…" : "Scanning…";
  showMessage(smart ? "Checking the page in a controlled browser. This may take a little longer…" : "Inspecting the public page for accessible media URLs…");
  try {
    const response = await fetch(smart ? "/api/smart-scan" : "/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Scan failed.");
    renderResults(data.videos || []);
    showMessage(data.videos && data.videos.length ? "Found " + data.videos.length + " possible source(s)." : (data.note || "No supported media source found. Some sites hide or protect their streams."), data.videos && data.videos.length ? "success" : "");
  } catch (e) { showMessage(e.message || "Could not scan this URL.", "error"); }
  finally { scanBtn.disabled = false; smartBtn.disabled = false; scanBtn.textContent = "Scan page"; }
}
scanForm.addEventListener("submit", async e => {
  e.preventDefault();
  try { const url = normalizeUrl(urlInput.value); urlInput.value = url; await performScan(url, false); }
  catch (e2) { showMessage(e2.message, "error"); }
});
smartBtn.addEventListener("click", async () => {
  try { const url = normalizeUrl(urlInput.value); urlInput.value = url; await performScan(url, true); }
  catch (e) { showMessage(e.message, "error"); }
});
function openBrowserUrl(raw) {
  try {
    currentBrowserUrl = normalizeUrl(raw);
    browseInput.value = currentBrowserUrl;
    hostLabel.textContent = new URL(currentBrowserUrl).hostname;
    frame.src = currentBrowserUrl; frame.hidden = false; placeholder.hidden = true;
    openTab.disabled = false; scanBrowser.disabled = false;
    showMessage("Preview requested. If the site blocks embedding, open it in a new tab and scan its URL separately.");
  } catch (e) { showMessage(e.message, "error"); }
}
browseForm.addEventListener("submit", e => { e.preventDefault(); openBrowserUrl(browseInput.value); });
openTab.addEventListener("click", () => { if (currentBrowserUrl) window.open(currentBrowserUrl, "_blank", "noopener,noreferrer"); });
scanBrowser.addEventListener("click", () => { if (currentBrowserUrl) { urlInput.value = currentBrowserUrl; performScan(currentBrowserUrl, false); } });
if ("serviceWorker" in navigator && location.protocol === "https:") window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
let deferredInstall;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; byId("install-app").hidden = false; });
byId("install-app").addEventListener("click", async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; byId("install-app").hidden = true;
});