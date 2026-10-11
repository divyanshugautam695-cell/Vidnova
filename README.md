# VidNova — Mobile Chrome Edition

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/divyanshugautam695-cell/Vidnova)

VidNova is a mobile-friendly web app for finding direct video sources on public webpages and downloading media you are authorized to save.

## Deploy for Android Chrome

1. Tap the **Deploy to Render** button above, or open [this deployment page](https://render.com/deploy?repo=https://github.com/divyanshugautam695-cell/Vidnova).
2. Sign in to Render and connect GitHub if asked.
3. Review the Blueprint service settings and tap **Apply** to start deployment.
4. Wait for the build to finish. Render will provide an HTTPS address ending in `.onrender.com`.
5. Open that address in Chrome on your phone.
6. In Chrome, open **⋮ → Add to Home screen** (or **Install app**, if offered).

The first build installs Chromium and may take several minutes. Free hosting may sleep when idle and take a little time to wake up. I cannot create the Render service or accept account permissions on your behalf.

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
