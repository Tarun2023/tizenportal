# 📺 TizenPortal (v1121) — Project Reference & Architecture Guide

> **Quick Summary**: This document serves as the persistent architectural reference, changelog, and operational manual for **TizenPortal v1121**, customized and maintained by **Tarun2023** (forked from [axelnanol/tizenportal](https://github.com/axelnanol/tizenportal)).

---

## 📌 Repository & Deployment Coordinates

| Resource | Value |
|---|---|
| **GitHub Repository** | [`https://github.com/Tarun2023/tizenportal`](https://github.com/Tarun2023/tizenportal) |
| **Git Remote (SSH)** | `git@github.com:Tarun2023/tizenportal.git` |
| **GitHub Pages** | [`https://tarun2023.github.io/tizenportal/`](https://tarun2023.github.io/tizenportal/) |
| **Release Tag** | [`1121`](https://github.com/Tarun2023/tizenportal/releases/tag/1121) |
| **TizenBrew Module ID** | `Tarun2023/tizenportal` |
| **Original Author** | Axel Nanol ([github.com/axelnanol/tizenportal](https://github.com/axelnanol/tizenportal)) |

---

## 🛠️ Root Causes & Solutions Implemented

### 1. The Samsung TV "Freeze" on Pop-up Ads
* **Root Cause**: TizenBrew runs as a single-window WebKit/Blink webview on Tizen OS. The TV hardware remote keys (`tizen.tvinputdevice.registerKey`) are bound exclusively to this primary window. When an aggressive website calls `window.open()` or triggers an `<a target="_blank">`, the browser creates a detached secondary tab. Because this secondary tab lacks Tizen remote keybindings, the user is permanently stranded and cannot navigate, close the tab, or return to TizenBrew without force-rebooting the app or TV.
* **Solution**:
  1. **Early `window.open` Guard**: `core/index.js` and `bundles/adblock/main.js` intercept `window.open` calls before ad scripts execute.
  2. **Safe Mock Window Stubs**: If an ad network or popunder triggers `window.open`, it returns a dummy `Window` object with safe no-op methods (`close`, `focus`, `blur`, `postMessage`).
  3. **In-Window Navigation for Legit Sites**: If a user clicks a legitimate external link that called `window.open`, TizenPortal redirects the *current* window (`win.location.href = urlStr`) instead of opening a disconnected tab.
  4. **Target Blank Neutralization**: A document capture-phase click listener strips `target="_blank"` and `target="_new"` from anchor tags dynamically.

### 2. Transparent Clickjack & Overlay Traps
* **Root Cause**: Anime and video streaming sites (e.g., `senpai-stream.makeup`) inject invisible `<div>` overlays spanning the entire viewport (`width: 100vw; height: 100vh; z-index: 2147483647; opacity: 0;`). Clicking anywhere to play a video triggers ad redirects and popunders.
* **Solution**:
  1. `removeClickOverlays` in `bundles/adblock/main.js` detects elements with high `z-index` (>= 1000), fixed/absolute positioning, viewport coverage >= 70%, and near-zero text content or transparency, and purges them from the DOM.
  2. Added CSS rules in `bundles/adblock/style.css` hiding `.ad-overlay`, `.popunder`, and `.click-trap`.

### 3. Session Loss & Navigation Failure on Cross-Origin Redirects
* **Root Cause**: `sessionStorage` in browsers is strictly origin-scoped. When a streaming site or login portal executed a cross-origin redirect, the `#tp=` URL fragment was discarded by the site router, dropping the active bundle to `'default'` and breaking the Yellow button ("Return to portal").
* **Solution**:
  1. Stored the active session ID, card metadata, and bundle name in `window.name` (`__tp_session__=...`), which persists across cross-origin navigations in the same tab.
  2. In `initTargetSite()`, if `#tp=` is missing from the URL, TizenPortal recovers the session from `window.name`, preserving the `adblock` bundle and remote key handlers.

---

## 🛡️ Protection Engine Capabilities

### A. Ad & Popunder Blocking
* Blocks major ad networks: DoubleClick, Google Syndication, Google AdServices, Taboola, Outbrain, RevContent, Criteo, Rubicon, OpenX, PubMatic, Amazon AdSystem.
* Blocks aggressive video/popunder networks: PopAds, PopCash, Adsterra, Monetag, HilltopAds, ExoClick, Clickadu, TrafficJunky, AdCash, PropellerAds, Bet365, 1xBet, Stake, and ~60 top video pre-roll providers.
* Removes in-page ad banners, sponsored sections, and promoted containers.

### B. Telemetry & Analytics Blocking
* **Networks Dropped**:
  * Google Analytics (`google-analytics`), Google Tag Manager (`googletagmanager`, `googletagservices`)
  * Facebook Pixel (`facebook.com/tr`, `fbevents`)
  * Microsoft Clarity (`clarity.ms`)
  * Hotjar (`hotjar.com`, `hotjar.io`)
  * Yandex Metrica (`mc.yandex.ru`, `yandex.ru/watch`)
  * Segment (`segment.io`, `segment.com`), Mixpanel (`mixpanel.com`), Amplitude (`amplitude.com`)
  * New Relic (`newrelic.com`, `nr-data.net`), Datadog (`browser-intake-datadoghq.com`)
  * Session recorders: CrazyEgg, Mouseflow, Inspectlet, LuckyOrange, StatCounter, Histats
* **Safe SDK Stubs**: Injects dummy stubs for `window.gtag`, `window.ga`, `window.fbq`, `window.clarity`, `window.hj`, `window.ym`, `window.mixpanel`, `window.amplitude`, `window.dataLayer`, and `window.__tcfapi` so web applications don't crash when their tracking fails.

### C. Persistent Global Protection Storage
* Implemented in `core/stats.js`.
* Stats are stored in `localStorage['tp_adblock_stats']` and cross-origin relays via `window.name` and `#stats=` payloads.
* Tracks: **Total Blocked**, **Popups Prevented**, **Ads Removed**, **Trackers Dropped**, **Clickjack Traps Cleaned**.
* **TV Preferences (🟡 Yellow button on portal)**: Displays the **"🛡️ Protection Statistics"** section with an on-screen **"Reset to Zero"** button.
* **TV Diagnostics (🔵 Blue button on remote)**: Status bar displays `Shield: X blocked (Y popups, Z ads, W reqs, V traps)`.

### D. Default-True Configuration
* In `bundles/adblock/manifest.json`:
  * `blockPopups`: `true`
  * `strict`: `true`
  * `hideCookieBanners`: `true`
  * `inlineHeuristics`: `true`
* Clicking **"+"** in the portal defaults to `adblock` with all features active.
* Entering URLs in the **🔴 Red** Address Bar runs under the strict `adblock` bundle.
* Fresh installs automatically pre-seed an AdBlock starter card (`FMHY`).

---

## 🧪 Testing Environment

### 1. Automated Test Runner (`npm test`)
* File: `test/test-runner.cjs`
* Runs 39 automated headless DOM assertions via JSDOM:
  * Runtime initialization & registry verification
  * Popup blocker (`window.open` on ad networks and `about:blank`)
  * Link & `target="_blank"` neutralization
  * Clickjack overlay detection and deletion
  * Request interception (`fetch` & `XMLHttpRequest`)
  * Ad & Telemetry SDK neutralization stubs (Google, Facebook, Clarity, Hotjar, Yandex, Mixpanel, Amplitude)
  * Persistent global storage (`TizenPortal.stats` get/save/reset)

### 2. Interactive TV Simulator
* File: `test/interactive-test.html`
* URL: `http://localhost:8080/test/interactive-test.html`
* Features:
  * On-screen Samsung TV remote control (D-pad, OK, Back, Color buttons)
  * Simulated attack vectors: PopAds, Adsterra, Monetag, `about:blank`, clickjack traps, programmatic anchor clicks
  * Live Interceptor Activity Log and real-time Session / Lifetime counters

---

## 💻 Common Commands & Workflows

### Build & Test
```bash
# Rebuild distribution bundle
npm run build

# Run automated tests
npm test

# Start local test server
python3 -m http.server 8080 --directory "/home/tarun/Projects/tizen TV browser"
```

### Git & Release Workflow
```bash
# Commit changes
git add -A
git commit -m "feat/fix: description"

# Push to master
git push origin master

# Update Release tag 1121 to latest HEAD
git tag -f 1121 HEAD
git push --force origin 1121

# Update GitHub release notes
gh release edit 1121 --notes "..."
```

---

## 📺 How to Install / Update on Samsung Smart TV

1. Ensure **TizenBrew** is installed and running on your Samsung TV.
2. Open the TizenBrew package manager / module loader.
3. Add module:
   ```text
   Tarun2023/tizenportal
   ```
4. Launch TizenPortal from the TizenBrew dashboard.
5. All web browsing from the launcher or address bar will now automatically run with ad and popup protection enabled.
