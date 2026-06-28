# UI Catalog — Pontifex reusable component patterns

> **Purpose:** one place every model/session checks BEFORE building a card, button, modal,
> etc., so the UI stays uniform instead of 322 slightly-different hand-rolled cards.
> **We do NOT use a component library** (no shadcn/Radix) — we hand-roll Tailwind. This doc
> is our component memory.
>
> **The rule:**
> 1. **Before** building UI → reach for a **real component** from `@/components/ui` (see the
>    "Core component library" section below) FIRST. Only fall back to the raw class patterns
>    when no component fits.
> 2. **After** building a genuinely new reusable pattern → either add it to `components/ui/`
>    (preferred) or document the classes here (name, canonical file, classes).
> 3. For *aesthetic direction* on net-new screens, the `frontend-design` + `pontifex-brand` skills
>    are the authority; this catalog is the "what we've actually shipped" companion.

---

## Core component library — `@/components/ui` (USE THESE FIRST)

Brand-token-aware (`bg-brand`, `text-brand`, `bg-brand/10`, `from-brand to-brand-accent` — driven by
`tenant_branding`; NO numeric brand scale), full dark mode, mobile-first (≥44px tap targets). One file
each in `components/ui/`, all re-exported from the barrel `components/ui/index.ts`. Class merging uses
the dependency-free `cn()` in **`lib/cn.ts`** (last-write-wins token de-dupe — no clsx/tailwind-merge).

```tsx
import { Button, Card, Modal, StatusBadge, EmptyState, StatCard,
         Tabs, TabList, Tab, TabPanel, Alert, PageHeader, Spinner } from '@/components/ui';
```

### Button · `components/ui/Button.tsx`
Variants `primary` (bg-brand) · `secondary` (outline) · `ghost` · `danger`; sizes `sm`/`md`/`lg`
(md/lg ≥44px); `loading` (swaps spinner), `fullWidth`, `leftIcon`/`rightIcon`; renders an `<a>` when
given `href`, or `asChild` to clone a child element.
```tsx
<Button leftIcon={<Plus className="w-4 h-4" />} loading={saving}>Save</Button>
<Button variant="secondary" href="/dashboard/admin/fleet/new">New Vehicle</Button>
<Button variant="danger" onClick={remove}>Delete</Button>
```

### Card · `components/ui/Card.tsx`
The canonical surface (`rounded-2xl border bg-white dark:bg-white/[0.03] p-5 sm:p-6`). Optional
`title` / `subtitle` / `action` header slot; `noPadding` for edge-to-edge tables. `CardHeader`/`CardBody`
for custom composition.
```tsx
<Card title="Recent activity" action={<Button size="sm">View all</Button>}>…</Card>
```

### Modal · `components/ui/Modal.tsx`
Portal overlay + panel; `size` `sm`/`md`/`lg`/`xl`; sticky header (title + X) and `footer` slots,
scrollable body, mobile slides up full-width. Closes on overlay click + Esc (both toggleable);
body-scroll-lock.
```tsx
<Modal open={open} onClose={() => setOpen(false)} title="Edit vehicle"
       footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button>Save</Button></>}>
  …form…
</Modal>
```

### StatusBadge · `components/ui/StatusBadge.tsx`
Pill. Semantic `variant` (`success`/`warning`/`danger`/`info`/`neutral`/`brand`) OR a data-driven
`color` (any CSS color → tinted bg+text+ring via color-mix). Optional `dot`.
```tsx
<StatusBadge variant="success" dot>Active</StatusBadge>
<StatusBadge color={stage.color}>{stage.name}</StatusBadge>
```

### EmptyState · `components/ui/EmptyState.tsx`
Lucide `icon` in a soft brand square + `title` + `description` + optional `action` (a Button).
```tsx
<EmptyState icon={Truck} title="No vehicles yet" description="Add your fleet to get started."
            action={<Button href="/dashboard/admin/fleet/new">Add vehicle</Button>} />
```

### StatCard · `components/ui/StatCard.tsx`
KPI tile: `label` + big `value` + optional `delta` (auto up/down color from sign, `invertDelta`
for "down is good") + optional brand-accent `icon`.
```tsx
<StatCard label="Active Jobs" value={42} delta="+12%" icon={Briefcase} />
```

### Tabs · `components/ui/Tabs.tsx`
Accessible tablist with a brand active underline. Controlled (`value`+`onValueChange`) or
uncontrolled (`defaultValue`).
```tsx
<Tabs defaultValue="open">
  <TabList><Tab value="open">Open</Tab><Tab value="done">Done</Tab></TabList>
  <TabPanel value="open">…</TabPanel><TabPanel value="done">…</TabPanel>
</Tabs>
```

### Alert · `components/ui/Alert.tsx`
Left-accent banner; variants `success`/`warning`/`danger`/`info`; `title` + message body; optional
`onDismiss` (renders X) and custom `icon`.
```tsx
<Alert variant="warning" title="Heads up">Registration expires in 30 days.</Alert>
```

### PageHeader · `components/ui/PageHeader.tsx`
Page title block: `title` + `subtitle` + optional `backHref`/`backLabel` + right `action` slot
(action drops below on mobile).
```tsx
<PageHeader backHref="/dashboard/admin" backLabel="Dashboard" title="Fleet"
            subtitle={`${n} vehicles`} action={<Button>New Vehicle</Button>} />
```

### Spinner + Skeleton · `components/ui/Spinner.tsx`, `components/ui/Skeleton.tsx`
`<Spinner size="lg" brand />` — sizes `xs`/`sm`/`md`/`lg`, inherits `currentColor` unless `brand`.
Skeleton family (`Skeleton`, `SkeletonCard`, `SkeletonTable`, `SkeletonStat`, …) for shape-matching
loading states.

**First adopter:** `app/dashboard/admin/fleet/page.tsx` (migrated to PageHeader + Button + EmptyState +
Spinner + StatusBadge as the proof-of-adoption reference).

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
