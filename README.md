# VidNova — Mobile Chrome Edition

VidNova is a mobile-friendly web app for finding direct video sources on public webpages and downloading media you are authorized to save.

## Deploy to use on Android Chrome

This app requires a Node.js backend, so GitHub Pages alone cannot run its scanner or download API. The repository includes a Dockerfile and Render Blueprint (`render.yaml`).

1. Open the repository on GitHub and choose **Deploy to Render** / create a new Blueprint from the repo at Render.
2. Review the service settings and deploy. Browser installation can take several minutes.
3. When Render provides the HTTPS URL, open it in Chrome on your phone.
4. In Chrome, tap **⋮ → Add to Home screen** to create a shortcut.

## Run locally

Requires Node.js 18+.

```bash
npm install
npx playwright install chromium
npm start
```

Open `http://localhost:3000`.

## Features

- Mobile-first dark/silver interface and installable PWA shell
- Static page scan and best-effort Playwright Smart Scan
- Browser preview with open-in-new-tab fallback
- Direct media download endpoint, limited to 200 MiB
- Basic URL/DNS validation, redirect limits, and per-IP rate limiting

## Limitations and responsible use

This is a prototype. It does not bypass DRM, authentication, paywalls, anti-bot controls, or site access restrictions. Some sites block iframe previews, and HLS/DASH streams may not download as a single playable file. Only download content you own or are authorized to save. Before exposing this service publicly, strengthen SSRF/egress protections, browser isolation, monitoring, and rate limiting.
