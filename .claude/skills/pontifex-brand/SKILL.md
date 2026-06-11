---
name: pontifex-brand
description: Applies the Pontifex Industries brand (bridge-P mark, purple-to-red journey gradient, dark indigo surfaces) to anything visual — marketing pages, decks, social graphics, PDFs, emails, App Store assets. Use whenever creating Pontifex-branded (NOT tenant-branded) visual output.
---

# Pontifex Industries Brand

## When this applies — and when it must NOT

- **Applies to:** Pontifex-owned surfaces — the marketing/landing site, pitch decks, social
  graphics, demo materials, App Store assets, platform-level emails, the Platform Hub.
- **Does NOT apply to tenant-facing app UI.** The platform is white-label: tenant surfaces pull
  brand from `BrandingProvider` / `tenants.logo_url` / `tenants.primary_color`. Never hardcode
  Pontifex colors into tenant-visible product screens.

## The mark

Single-stroke **bridge-P**: tower → arch span → landing — "one line, one bridge." The static mark
stays CLEAN (legible at 16px favicon size); the tech personality lives in the launch ANIMATION
(self-drawing bridge, data pulse across the span, circuit nodes, blueprint grid), never in the
static icon. Source files: `public/logo.svg`, `public/favicon.svg`; white variant on
`app/company-login`; animation reference `assets/logo-concepts/splash-demo-v4.html`.

## Colors

**The journey gradient (signature):** `#7C3AED` (violet) → `#DB2777` (pink) → `#EF4444` (red),
left-to-right or along the bridge stroke. Use for the mark, hero accents, and key CTAs — sparingly;
it loses meaning if everything glows.

**Surfaces:**
- Deep indigo dark: `#120A24` (app icon tile, dark headers) and `#1e1b4b` (splash/launch background)
- App light mode: white / `slate-50` surfaces, `ring-slate-200`, slate text (matches the
  light-default admin restyle)

**Status accents (product convention):** emerald = success/complete, amber = warning/pending,
rose = danger/blocked, violet = info/brand.

## Typography & tone

- UI: the platform's existing Tailwind system font stack — clean, geometric, medium weights.
  Headlines tight (`tracking-tight`), generous spacing. No serif display faces on product surfaces.
- Voice: builder-to-builder. Confident, concrete, zero corporate filler. "Bridge" language is
  welcome as a motif (we bridge field and office), never as a pun-overload.

## Rules

1. Gradient is for moments, not wallpaper — one hero use per surface.
2. Dark surfaces use the indigo family (`#120A24`/`#1e1b4b`), never pure black.
3. The P mark is never stretched, recolored outside the gradient/white/dark variants, or given effects.
4. Icons: lucide-react, consistent stroke weight.
5. Mobile-first always — assets must read at phone sizes (the audience is in the field).
