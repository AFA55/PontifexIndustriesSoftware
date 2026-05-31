# New-Chat Kickoff Prompt — Splash Transition + "P" Logo

Copy everything in the code block below into a fresh Claude Code chat to start this work with full
context. (Only start once the App Store shows the app **Approved** — these are native changes needing
a new build.)

---

```
We're picking up a planned task on the Pontifex Industries platform (Next.js 15 + React 19 +
Capacitor iOS app). Read these first for full context:
- SPLASH_AND_LOGO_REVAMP.md  ← the detailed spec for this task
- CLAUDE.md                  ← project conventions, cost/deploy rules
- APP_STORE_APPROVAL_PLAYBOOK.md ← App Store guidelines that apply to us

GOALS (three things):
1. SMOOTH LAUNCH TRANSITION. Right now the splash/logo shows then the app screen snaps in abruptly.
   Make the splash fade out smoothly into the app — no white flash, no hard cut. The fix is in
   capacitor.config.ts (launchAutoHide: false + fade) plus a native-guarded SplashScreen.hide({
   fadeOutDuration }) call once the app is ready, plus matching the LaunchScreen storyboard / splash /
   app first-paint background colors. See Plan A in the spec.

2. NEW LOGO = THE LETTER "P". Replace the current "bridge" mark with a clean, modern "P" lettermark in
   the brand palette (indigo/purple #1e1b4b, optional subtle gradient). Apply it everywhere: iOS app
   icon (flat 1024, NO alpha), iOS splash, web favicon, and the in-app public/logo.svg. Use
   @capacitor/assets to regenerate all icon/splash sizes from one source image. See Plan B.
   - First, show me 2-3 "P" logo design options (you can generate SVGs, or use the Figma/Canva MCP).
     Let me pick one before you apply it everywhere.

3. LIVE PREVIEW so I can SEE each change as we go. For web UI use the dev server at iPhone size
   (hot reload). For the native splash + app icon, use the iOS Simulator (npx cap run ios). See Plan C.
   Set this up at the start so I can watch the changes.

IMPORTANT CONSTRAINTS:
- Install @capacitor/assets (dev dep) — it's the tool that regenerates all icon/splash sizes.
- iOS app icon MUST be opaque (no alpha) or Apple rejects it (we hit this before).
- capacitor.config.ts server.url must point at PROD before any release build — if you point it at a
  local dev server to preview, revert it before building.
- Web-only changes (in-app logo, framer-motion transitions) can ship via the normal Vercel deploy.
  The icon/splash changes need a NEW iOS build (Build 6) + resubmission to Apple.
- Cost discipline: batch commits, push once, confirm before pushing to main (see DEPLOYMENT_COST.md).
- Don't start the native build/resubmit until I confirm the current Build 5 is Approved.

Start by: (a) reading the spec, (b) setting up the live preview, (c) showing me 2-3 "P" logo options.
```

---

## Quick reference for the new chat

- **Splash config:** `capacitor.config.ts` → `plugins.SplashScreen`
- **Native check helper:** `lib/is-native.ts` → `isNativeApp()`
- **Asset source folder:** `assets/` (drop `logo.png` 1024² + `splash.png` 2732² here)
- **Generate command:** `npx @capacitor/assets generate --iconBackgroundColor '#1e1b4b' --splashBackgroundColor '#1e1b4b'` then `npx cap sync ios`
- **Live native preview:** `npx cap run ios`
- **Live web preview:** `npm run dev` → Chrome device toolbar (iPhone 14 Pro)
- **Already installed:** `@capacitor/splash-screen`, `framer-motion`
- **MCP available for logo design:** Figma, Canva
