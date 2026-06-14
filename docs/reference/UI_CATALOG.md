# UI Catalog — Pontifex reusable component patterns

> **Purpose:** one place every model/session checks BEFORE building a card, button, modal,
> etc., so the UI stays uniform instead of 322 slightly-different hand-rolled cards.
> **We do NOT use a component library** (no shadcn/Radix) — we hand-roll Tailwind. This doc
> is our component memory.
>
> **The rule:**
> 1. **Before** building UI → check here for an existing pattern and reuse its classes.
> 2. **After** building a genuinely new reusable pattern → add it here (name, canonical file, classes).
> 3. For *aesthetic direction* on net-new screens, the `frontend-design` + `pontifex-brand` skills
>    are the authority; this catalog is the "what we've actually shipped" companion.

---

## Brand tokens (the non-negotiables)
- **Journey gradient** (hero/marketing accents): `#7C3AED → #DB2777 → #EF4444` (violet → pink → red).
- **Product primary action:** violet→indigo gradient `from-violet-600 to-indigo-600` (hover `from-violet-500 to-indigo-500`). Tenant login buttons instead use `branding.primary_color → secondary_color`.
- **Surfaces:** light = `white` / `gray-50`; dark = `white/[0.03]` on the dark-indigo app bg (`#1e1b4b`). Borders: `gray-200` / `dark:white/10`.
- **Radius:** cards `rounded-2xl`, modals `rounded-3xl`, buttons/inputs `rounded-xl`.
- **Icons:** `lucide-react` ONLY. ~`w-5 h-5` inline, `w-4 h-4` in dense rows.
- **Mobile-first:** every tap target ≥ **44px** (`min-h-[44px]`, often `min-h-[48px]` for primary). No horizontal overflow at 375px.
- **Theme:** the app has a light/dark toggle (`dark` class strategy). Every pattern MUST carry `dark:` variants — never hardcode one theme (this is what broke the notification bell).

---

## Patterns (canonical examples — copy the classes)

### Surface card  ·  canonical: `components/PasskeySettings.tsx`
The default container for a section/panel. Used ~322 places — match it.
```
rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6
```

### Primary action button  ·  canonical: `components/PasskeySettings.tsx` ("Add a passkey")
```
min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl
bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
text-white font-bold text-sm transition-all disabled:opacity-60
```
Tenant-branded variant (login): `style={{ background: linear-gradient(to right, primary_color, secondary_color) }}`.

### Secondary / outline button  ·  canonical: `components/PasskeyLoginButton.tsx`
```
min-h-[48px] flex items-center justify-center gap-2 rounded-xl border
border-gray-300 dark:border-white/15 text-gray-700 dark:text-white/90
hover:bg-gray-50 dark:hover:bg-white/5 font-semibold text-sm transition-all
```

### Stat card (gradient)  ·  canonical: `app/dashboard/page.tsx` (Active Jobs / Hours Today)
Big-number tiles. Blue-purple `from-blue-500 to-purple-600`, teal-emerald `from-teal-500 to-emerald-600`. White number + label, `rounded-2xl p-6`.

### Modal / dialog  ·  canonical: `components/BiometricEnrollPrompt.tsx`, `components/WelcomeProfileModal.tsx`
```
overlay:  fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4
panel:    w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-gray-200 dark:border-white/10 p-6
```
Icon-in-gradient-square header (`w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600`), title, body, primary + "Not now" ghost button.

### Theme-aware icon button  ·  canonical: `components/NotificationBell.tsx`
NEVER hardcode icon color — it must invert with the theme:
```
bg-gray-100 text-gray-600 hover:bg-gray-200  dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/20
```

### Text input  ·  canonical: `app/login/page.tsx`
Icon-left, `rounded-xl`, `min-h` ≥44px, light bg with `dark:` variant, focus ring in brand color. Mobile font ≥16px to avoid iOS zoom (see `[ios-mobile-gotchas]`).

### List row / setting row  ·  canonical: `components/PasskeySettings.tsx` (passkey list)
```
flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3
```

---

## Maintenance
When you ship a new reusable pattern, append a section above with: **name · canonical file · the classes**.
Keep it to patterns used (or meant to be reused) in 2+ places — not one-offs.

*Inspiration sources we vet (NOT installed):* see `docs/TOOLING_EVALUATION.md` → "UI component libraries" — copy-paste-and-rebrand only; never adopt wholesale (would clash with the brand + read as templated).
