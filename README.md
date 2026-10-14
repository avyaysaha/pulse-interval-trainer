# Pulse — Interval Trainer

A dependency-free interval training web app built with **HTML, CSS, and vanilla JavaScript**. Deploy it to GitHub Pages, Netlify, Cloudflare Pages, or any static file host. No build, framework, backend, or API keys needed.

## Features

- Customize **work seconds (1–3600)**, **rest seconds (0–3600)**, **rounds (1–99)**, and **get-ready countdown (0–60 seconds)**.
- Start, pause/resume, skip, and reset.
- HIIT, Tabata, and Endurance presets; type precise values or use the +/- controls.
- Animated countdown ring, round counter, overall progress, and session duration estimate.
- Optional audio tones and mobile vibration on phase changes.
- Remembers your settings locally in the browser.
- Responsive layout for phones, tablets, and desktops.
- Installable web app and offline support after the first successful load.
- Uses wall-clock deadlines to handle throttled browser tabs. Requests a screen wake lock on supported devices.
- Keyboard shortcuts: **Space** start/pause/resume; **Right Arrow** skip; **R** reset (when not focused on a control).

**Timing:** One work interval counts as one round. Rest happens *between* rounds, not after the last round. Set rest to `0` for back-to-back work rounds. Prep occurs once at the beginning.

## Deploy to GitHub Pages

1. Create a new GitHub repository (for example, `pulse-trainer`).
2. Upload **all files in this folder to the repository root**: `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, `icon.svg`, `icon-192.png`, and `icon-512.png`.
3. Open the repository's **Settings → Pages**.
4. In **Build and deployment**, choose **Deploy from a branch**. Select `main` and `/ (root)`, then **Save**.
5. Visit `https://YOUR-GITHUB-USERNAME.github.io/pulse-trainer/` once the deployment is published.

For a user/organization site named `YOUR-GITHUB-USERNAME.github.io`, the URL is `https://YOUR-GITHUB-USERNAME.github.io/` instead.

## Run locally

Open `index.html` directly in a browser to use the timer. For service-worker/PWA functionality, run a local static web server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Notes

- Works completely on the client. Settings only live in your browser's local storage.
- Sound depends on the device's audio policy and volume; iPhones in Silent Mode may mute browser sounds. Vibration and Wake Lock depend on browser support.
- The timer is most reliable with the site open and the screen awake. Background tab/browser suspension and device sleep can delay sound cues, though the visible countdown catches up from wall-clock time on return.
- If you change source files after deployment, update `CACHE_NAME` in `sw.js` (for example, from `v1` to `v2`) to refresh the offline app cache.
