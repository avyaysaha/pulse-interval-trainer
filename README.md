# Pulse — Interval Trainer

A dependency-free interval training web app built with **HTML, CSS, and vanilla JavaScript**. Deploy it to GitHub Pages, Netlify, Cloudflare Pages, or any static file host. No build, framework, backend, or API keys needed.

## Features

- Customize **work seconds (1–3600)**, **rest seconds (0–3600)**, **rounds (1–99)**, **warm-up seconds (0–3600)**, and **cool-down seconds (0–3600)**.
- Start, pause/resume, skip, and reset.
- HIIT, Tabata, Endurance, and **Speed Ramp** treadmill presets; type precise values or use the +/- controls.
- Animated countdown ring, round counter, overall progress, and session duration estimate.
- Optional audio tones and mobile vibration on phase changes.
- Remembers your settings locally in the browser.
- Responsive layout for phones, tablets, and desktops.
- Installable web app and offline support after the first successful load.
- Uses wall-clock deadlines to handle throttled browser tabs. Requests a screen wake lock on supported devices.
- Keyboard shortcuts: **Space** start/pause/resume; **Right Arrow** skip; **R** reset (when not focused on a control).

**Timing:** Warm Up runs once before the first round, Work runs once per round, Rest runs only between rounds, and Cool Down runs once after the final round. Set Rest to `0` for consecutive work rounds. Set Warm Up or Cool Down to `0` to skip either phase.

**Speed Ramp:** A treadmill-specific sequence: **30 seconds Warm Up → 10 continuous 60-second running stages → 30 seconds Cool Down** (11 minutes total). The timer sounds a cue at the start of each running stage so you can manually increase treadmill speed once per minute. There are no between-stage rests and no automatic treadmill speed changes. Warm Up and Cool Down can be adjusted independently without losing Speed Ramp cues; editing Work, Rest, or Rounds switches to regular interval mode.

## Deploy to GitHub Pages

1. Use your existing repository: `https://github.com/avyaysaha/pulse-interval-trainer`.
2. Upload **all files in this folder to the repository root**: `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, `icon.svg`, `icon-192.png`, and `icon-512.png`.
3. Open the repository's **Settings → Pages**.
4. In **Build and deployment**, choose **Deploy from a branch**. Select `main` and `/ (root)`, then **Save**.
5. Visit `https://avyaysaha.github.io/pulse-interval-trainer/` once the deployment is published.

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
- When you deploy changes, update `CACHE_NAME` in `sw.js` to refresh the offline app cache. This release uses `v3`. If an older offline install persists, reload the page after the new service worker activates.

## On-screen organization

01 Session · 02 Presets · 03 Configure · 04 Preferences. All four are distinct cards, with Presets above Configure and Preferences in its own panel.
