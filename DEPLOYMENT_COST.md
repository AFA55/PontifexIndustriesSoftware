# Deployment Cost Discipline

> ## 🚨 LIVE BUDGET (May 2026): ~$15 of build credit remaining
> **Every `git push origin main` triggers ONE billed production build (~$1–2).** With ~$15 left, that's only ~7–10 pushes before we're out. **Therefore:**
> - **BATCH commits, push rarely.** Commit each feature locally as it's finished (commits are free), but **push to `main` only when a meaningful batch is ready** — ideally once per work session, not once per feature.
> - **Never push docs-only or trivial one-line changes on their own.** Fold them into the next feature batch.
> - **Confirm with the user before pushing** unless they've said "push it." A push spends real money now.
> - Only `main` builds (branch builds are disabled via `ignoreCommand`) — that protection stays.
> - If a build fails, fix locally and re-verify with `npm run build` BEFORE pushing again — a failed push still burns a build.

**Why this doc exists:** we got hit with a ~$487 Vercel invoice on a $20/month plan. **86% of it was build time** — not runtime, not bandwidth, not function invocations. Every reckless `git push` to a branch with auto-deploy enabled costs real money.

This doc captures the actual cost drivers, what we changed, and the rules we follow now. Read it before changing any deployment behavior.

---

## The actual bill (line items)

From the Vercel invoice we received in May 2026:

| Line item | Usage | Cost | % of bill |
|---|---|---:|---:|
| **Build Minutes** | 2d 8h 12m (3,372 min) | **$418.82** | **86%** |
| **Build CPU Minutes** | 13d 8h (19,200 min) | **$67.20** | **14%** |
| Function Invocations | 40,793 | $0.60 | 0.1% |
| Fluid Active CPU | 23m 9s | $0.05 | — |
| Fluid Provisioned Memory | 4.777 GB-Hrs | $0.05 | — |
| Fast Origin Transfer | 134.56 MB | $0.01 | — |
| Edge Requests / ISR / Edge CPU | various | $0.00 | — |
| **Subtotal** | | **$486.73** | |
| Pro plan base | | $20.00 | |
| Credits applied | | -$19.99 | |
| **Total** | | **~$486.74** | |

**The rest of this doc is about controlling builds. Runtime is essentially free.**

---

## Why builds are expensive

Every `git push` to a branch with Vercel auto-deploy enabled triggers:
1. **A full Next.js production build** — compile (15-25s) + type-check (15-30s) + lint (10-20s) + page collection / static generation (30-60s) = **60-120s wall-clock per build**.
2. **Build CPU is multi-threaded** — Vercel allocates ~5-8 vCPU per build, so CPU minutes accumulate ~5-8× faster than wall time.
3. **Each commit on a configured branch = one new build.** 20 commits = 20 builds.

Pro plan includes **6,000 build minutes/month**. Overage is roughly **$0.07-0.12/minute** depending on tier. Build CPU minutes have their own quota and overage.

We exceeded both.

---

## What we changed (in code)

### 1. Auto-deploy disabled for AI feature branches

**File:** [`vercel.json`](vercel.json)

```json
"git": {
  "deploymentEnabled": {
    "main": true,
    "claude/*": false
  }
}
```

Only `main` triggers Vercel builds now. `claude/*` branches I push during sessions don't burn build minutes. Previews can still be triggered manually with `vercel deploy` when actually needed.

### 2. Lint + TypeScript check skipped during Vercel builds

**File:** [`next.config.js`](next.config.js)

```js
typescript: { ignoreBuildErrors: true },
eslint: { ignoreDuringBuilds: true },
```

Skips ~30-60 seconds per build. **This is only safe because** the husky pre-commit hook runs `npx tsc --noEmit` locally before any commit can happen — TS errors are caught there. ESLint warnings shouldn't block deploys anyway.

**If you ever bypass the pre-commit hook with `--no-verify`, TS errors won't be caught until runtime.** Don't do that.

### 3. Function `maxDuration` capped at 10s by default

**File:** [`vercel.json`](vercel.json)

Was `30s` for every `/api/**` route. Now `10s` for general routes, `60s` only for the 10 routes that genuinely need it (PDF generation, exports, dashboard-summary aggregation, crons). Prevents runaway routes from quietly burning GB-Hours.

### 4. Visibility-paused polling

**File:** [`lib/hooks/useVisiblePoll.ts`](lib/hooks/useVisiblePoll.ts)

Polls only fire while the tab is visible AND online. Cuts function invocations by ~80%. Function invocations were $0.60 of the bill — so this saves cents, not dollars — but it's still the right pattern for any future polling we add.

---

## Rules of the road (how we deploy from now on)

### When pushing code

1. **Push to `main` only when ready to deploy.** Every `git push origin main` is a billed build. Squash commits before push if you can; one push = one build.
2. **Push to other branches freely** — they don't auto-deploy. Use the Vercel preview URL only when you actually want to verify a change in cloud.
3. **Local dev (`npm run dev`) costs nothing.** Iterate locally as much as you want. The dev server uses your machine's CPU, not Vercel's.

### When you DO need a preview deploy on a branch

Don't add the branch to `git.deploymentEnabled` — that re-enables auto-deploy on every commit. Instead:

```bash
# One-shot preview without auto-deploy:
vercel deploy           # builds locally, uploads, returns a preview URL
# OR:
vercel --prebuilt       # if you already ran `next build` locally
```

This builds **once**, on demand. No more.

### When NOT to push

- Don't push to `main` for typo fixes or doc-only changes if you can batch them with the next real change.
- Don't push to `main` for "let me see if this works in prod" — verify locally first.
- Don't `git commit --amend && git push --force` repeatedly to fix a single change. Each force-push is a new build.

### Migration discipline (separate from deploy cost)

Migrations apply to the live DB regardless of which branch the code is on. They don't trigger Vercel builds, but they DO mutate production. Apply via the Supabase MCP, idempotent DDL only. See [`CLAUDE.md`](CLAUDE.md) for migration conventions.

---

## What to do if the bill is still high next cycle

1. **Open Vercel Usage tab** → [vercel.com/dashboard/usage](https://vercel.com/dashboard/usage). Top line item tells you what to fix.
2. **If Build Minutes still dominates**:
   - Check the deploy log — count how many builds happened.
   - If many: someone pushed to a configured branch repeatedly. Squash + push once.
   - If few but each build is slow: bisect for a heavy dependency or import that's slowing the build.
3. **If Function Invocations rises**: a new poll was added without `useVisiblePoll`. Search for `setInterval(.*30000)` in the codebase.
4. **If Fast Origin Transfer / Bandwidth rises**: a large API response or PDF route is being hit a lot. Cache it.

---

## Long-term options (if Vercel is still too expensive)

These are bigger lifts but worth knowing about:

- **Cloudflare Workers / Pages** — free tier covers most small SaaS apps. Pricing model doesn't charge per build minute. Migration is a few days of work given Next.js compatibility.
- **Self-host on Hetzner / DigitalOcean** — $5-20/month for a VPS. No build minute charges; you eat the build cost on your own CI. More ops work.
- **Render / Railway** — $5-7/month tiers. Pricing closer to flat than Vercel's metered model.

We are NOT migrating right now. This doc just notes the escape hatches for future reference.

---

## TL;DR

- Builds = 99.97% of the bill. Runtime = ~$0.70.
- One push = one build. Push to `main` deliberately.
- `claude/*` branches won't auto-deploy anymore.
- TS + lint skipped during Vercel builds (caught by pre-commit locally).
- For one-off branch previews: `vercel deploy`. Not `git push`.
