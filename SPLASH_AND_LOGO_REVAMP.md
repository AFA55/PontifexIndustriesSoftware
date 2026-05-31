# Splash Transition + "P" Logo Revamp — Spec

**Status:** PLANNED (do NOT build/submit while Build 5 is in App Review — these are *native* asset
changes that require a fresh build). Pick this up once the app is **Approved**.
**Created:** 2026-05-30

---

## What we want to achieve

1. **Smooth launch transition.** Today the logo/splash shows, then the app screen "snaps" in — a
   hard, abrupt swap. We want the splash to **fade out smoothly** into the app with no flash or jump.
2. **New logo = the letter "P".** The current mark (the Pontifex "bridge") isn't the look we want.
   Replace it with a clean, modern **"P" lettermark** that better represents the brand, applied
   everywhere: iOS app icon, iOS splash, web favicon, and the in-app `/logo.svg`.
3. **A live preview while we work.** Like the React-Native dev clip — code on one side, a live phone
   preview on the other that updates as we change things, so we can *see* every tweak.

---

## Current assets (what exists today)

| Asset | Path | Notes |
|---|---|---|
| Web logo | `public/logo.svg` | Bridge mark; shown in-app before tenant branding loads |
| Web favicon | `public/favicon.svg`, `favicon-16/32.png`, `apple-touch-icon.png` | |
| Web icons | `public/icon-1024.png`, `icon-512.png`, `icon-192.png` | PWA/manifest icons |
| iOS app icon | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` | single 1024px (no-alpha) |
| iOS splash | `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png` | 3 variants (light/dark/universal) |
| iOS launch screen | `ios/App/App/Base.lproj/LaunchScreen.storyboard` | native pre-splash |
| Splash config | `capacitor.config.ts` → `plugins.SplashScreen` | `launchShowDuration: 2000`, `launchAutoHide: true`, `backgroundColor: '#1e1b4b'` |

Already installed: `@capacitor/splash-screen`, `framer-motion`. **Not** installed: `@capacitor/assets`.

---

## Plugins / tools to add

### 1. `@capacitor/assets` ⭐ (the key one — regenerates ALL icon + splash sizes from one source)
```bash
npm install -D @capacitor/assets
```
- Put source files in `assets/`:
  - `assets/logo.png` — 1024×1024, the "P" mark, **transparent** background (used to compose icon + splash)
  - `assets/icon-only.png` — 1024×1024 (optional, icon-specific)
  - `assets/splash.png` — 2732×2732, "P" centered on brand background
  - `assets/splash-dark.png` — 2732×2732 dark variant (optional)
- Generate everything (iOS + Android icons & splashes) in one command:
```bash
npx @capacitor/assets generate --iconBackgroundColor '#1e1b4b' --splashBackgroundColor '#1e1b4b'
npx cap sync ios
```
This rewrites `AppIcon.appiconset` + `Splash.imageset` automatically — no manual resizing.

### 2. `@capacitor/splash-screen` (already installed — for the fade)
Used programmatically to control *when* and *how* the splash hides (fade duration).

### 3. `framer-motion` (already installed — optional, for a polished first-paint animation)
Can fade/scale-in the first screen's content right after the splash hides, for an extra-smooth feel.

---

## Plan A — Smooth splash transition

The "snap" happens because `launchAutoHide: true` hides the splash on a fixed timer (2s) regardless of
whether the web app has painted — so you get splash → (possible flash) → hard cut to the app.

**Fix:**
1. `capacitor.config.ts` → `SplashScreen`:
   - `launchAutoHide: false` (we'll hide it ourselves, after the app is ready)
   - `launchFadeOutDuration: 500` (Android fade; iOS fade is via the hide call below)
   - keep `backgroundColor` matched to the app's first-paint background.
2. Add a tiny client component (guarded by `isNativeApp()` from `lib/is-native.ts`) mounted in the root
   layout that, once the app has rendered its first meaningful screen, calls:
   ```ts
   import { SplashScreen } from '@capacitor/splash-screen';
   await SplashScreen.hide({ fadeOutDuration: 500 });
   ```
3. **Color continuity (kills the flash):** make these three the SAME color so the fade is seamless:
   - `LaunchScreen.storyboard` background
   - `capacitor.config.ts` splash `backgroundColor`
   - the web app's initial `<body>`/login background (or a brand-colored loading shim)
4. Optional polish: wrap the first screen in a `framer-motion` `motion.div` with a 300ms fade/scale-in
   so content arrives gracefully as the splash fades.

**Acceptance:** on launch (iOS Simulator + real device), splash holds on the "P" until the app is ready,
then cross-fades into the first screen with no white flash and no hard cut.

---

## Plan B — New "P" logo

**Design direction:** a clean, geometric/rounded **"P"** lettermark in the brand palette
(indigo/purple `#1e1b4b` → consider a subtle gradient). Works as: a small monochrome favicon, a
centered icon on a solid tile (iOS, no transparency/alpha), and a splash mark.

**How to create the P mark (pick one):**
- **Figma** (MCP connected) — design the P, export SVG + 1024 PNG.
- **Canva** (MCP connected) — quick branded P.
- **Claude generates an SVG** — a precise geometric "P" in brand colors, then we rasterize to PNG.

**Then apply everywhere:**
1. Replace `public/logo.svg` (in-app) + `public/favicon.svg` with the new P.
2. Drop `assets/logo.png` + `assets/splash.png` (the P) and run `@capacitor/assets generate` →
   regenerates iOS app icon + splash automatically.
3. Replace `public/icon-1024/512/192.png` + `apple-touch-icon.png` (PWA/web) with the P.
4. `npx cap sync ios`, rebuild, verify icon on home screen + splash on launch.

> **iOS icon rule:** the app icon must be a **flat 1024×1024 with NO alpha/transparency** (opaque
> background), or Apple rejects it (we hit this before). `@capacitor/assets` handles this if the
> source/background is set correctly.

---

## Plan C — Live preview while we work ("see what we're building")

The clip shows a React-Native live device preview. Our app is Next.js + Capacitor, so:

- **Web UI changes** (in-app logo, page transitions, anything in the browser): run the dev server and
  view at iPhone size with hot reload — instant feedback.
  ```bash
  npm run dev   # localhost:3000
  ```
  Then Chrome → DevTools → device toolbar → iPhone 14 Pro. (Or use the project's Claude preview server
  on port 3000 — see `.claude/launch.json`.)
- **Native splash + app-icon changes** (Plans A & B): these are *native* and only show on a real
  launch, so use the **iOS Simulator**:
  ```bash
  npx cap run ios          # builds + launches in the Simulator
  ```
  To preview *local* changes (not the live prod site), temporarily point Capacitor at your dev server:
  in `capacitor.config.ts` set `server.url` to `http://<your-LAN-IP>:3000` (or localhost), `npx cap sync`,
  run. **Revert `server.url` to the prod URL before any release build.**

**Recommended layout:** editor on one monitor, iOS Simulator (for splash/icon) or the iPhone-sized
browser (for web UI) on the other — exactly the code-next-to-phone setup from the clip.

---

## Files this work will touch
- `capacitor.config.ts` (splash config)
- `app/layout.tsx` or a new `components/SplashController.tsx` (programmatic hide, native-guarded)
- `ios/App/App/Base.lproj/LaunchScreen.storyboard` (background color match)
- `assets/logo.png`, `assets/splash.png` (new — source for the generator)
- `public/logo.svg`, `public/favicon.svg`, `public/icon-*.png`, `public/apple-touch-icon.png`
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/*` + `Splash.imageset/*` (auto-regenerated)
- `package.json` (add `@capacitor/assets` dev dep)

## Guardrails
- **Do not start until the app is Approved** (native changes need a new build; don't disturb the
  in-review Build 5).
- Web-only pieces (in-app `/logo.svg`, framer-motion transitions) *can* ship via the normal web deploy;
  the icon/splash pieces need a new iOS build (Build 6) + resubmission.
- Keep the iOS icon opaque (no alpha). Revert any local `server.url` change before building for release.
- Batch commits; one push. See `DEPLOYMENT_COST.md`.
