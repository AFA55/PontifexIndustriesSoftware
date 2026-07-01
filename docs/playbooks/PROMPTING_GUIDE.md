# Founder's Prompting Guide — how to drive development fast

> Objective on record: **get the app running flawlessly with the features it already has, as fast
> as possible.** Stabilization > new features until the loose ends are gone. This guide is how the
> founder gets maximum speed out of each session.

## The one rule that matters most

**Report outcomes, not implementations.** You describe what's wrong or what you want to happen in
the real world; Claude decides how to build it. You're the customer + product owner; Claude is the
engineering team.

- ❌ "add a useEffect to refresh the timecard state"
- ✅ "Zack clocked out at 5pm but his timecard still shows him clocked in until he refreshes the page"

## The fastest workflow: the bug dump

Don't fix one thing per conversation. **Dump everything broken in ONE message**, in plain words,
numbered. Claude triages them into BACKLOG.md (P0–P3), fixes them in priority order with parallel
agents, runs guardian + build checks, and ships them in ONE push (~$1–2 instead of 5 pushes).

Template (copy, fill, send):

```
BUG DUMP:
1. [what you did] → [what you expected] → [what actually happened]. Role: [operator/admin]. Where: [page]. Device: [iPhone/desktop].
2. ...
3. ...
The worst one for the crew is #__.
```

A screenshot per bug is gold (paste it right in). "It looks wrong on my phone" + screenshot beats
three paragraphs.

## The magic phrases (each one triggers a defined procedure)

| Say this | What happens |
|---|---|
| **"pick up next task"** | Claude reads BACKLOG.md and starts at the top — zero context needed from you |
| **"where are we?"** | Status report: shipped / in flight / blocked on you / next |
| **"bug dump:" + list** | Triage → fix in priority order → one push |
| **"push it"** | Pre-authorizes the production push for this batch (otherwise Claude asks first) |
| **"guardian it"** | Forces an architecture-guardian review on whatever was just built |
| **"this is urgent / crew is blocked"** | Jumps the queue as P0, fix ships solo even if push budget suffers |
| **"plan first"** | For big/ambiguous things: Claude writes a short plan to approve before building |

## What you never need to do anymore

- **Paste giant context prompts.** The repo IS the context (handoff + backlog + architecture).
  Open a new chat and just say "pick up next task" or dump bugs.
- **Re-explain the stack, the tenants, the conventions.** CLAUDE.md carries it.
- **Track what was done.** BACKLOG.md 📊 STATUS + handoff carry it.

## What slows us down (avoid)

1. **One bug per chat** — every fix then needs its own push ($) or sits unshipped.
2. **Switching priorities mid-build** — finish the batch, then re-aim. (Real emergencies excepted.)
3. **Vague reports** — "the app is acting weird" forces a 20-question round trip. Use the template.
4. **Mixing new features into a stabilization batch** — new features create new bugs; we ship them
   in their own batch after the loose ends are closed.
5. **Sitting on founder-only actions** — some fixes dead-end until you do your part (test invite,
   TestFlight install, Vercel/Supabase dashboard clicks). The STATUS table lists them; knocking
   those out is often the fastest thing anyone can do.

## Session rhythm for the stabilization push

1. You: bug dump (or "pick up next task").
2. Claude: triage → status report → builds top-down, guardian-checked, batched.
3. You: when asked, eyeball the preview URL or test the specific flow on your phone (5 min).
4. Claude: one confirmed push → verifies deploy READY → updates BACKLOG/handoff.
5. Next session inherits everything automatically.

**Cadence suggestion:** one focused session per day beats three scattered ones — each session has
fixed overhead (orientation, build, push).

## When you want something NEW (after stabilization)

Use the feature brief — 4 lines, outcomes only:

```
FEATURE: [name]
Who uses it: [role(s)]
What they can do after: [outcome in real-world terms]
Why now: [what it unblocks]
```

Claude turns that into a plan in docs/plans/ (you approve), then builds it with the full pipeline.

---

## How Claude reconfigures your prompts (Claude-facing — read this every session)

> Source: distilled from @itsaiguide's "10 prompts" post (instagram.com/p/DZzzH4Cje60), Jun 2026.
> Core insight: **"write the code" produces junior-intern output. Naming which senior-engineer
> LENS to think through first produces senior-engineer output.** The founder types fast, in
> shorthand, often with typos and run-on sentences — that is not a signal to ask for
> clarification, it's the raw material. Claude's job is to silently detect intent, map it onto the
> right lens(es) below, and execute the EXPANDED version — never make the founder re-type a
> cleaner prompt.

**The reconfiguration step (do this before acting on any non-trivial ask):**
1. Read past the typos/shorthand to the real-world outcome being asked for (per the "report
   outcomes" rule above).
2. Pick the lens (or 2-3 combined) that matches what's actually needed — see table below.
3. Silently expand the ask into that lens's fuller frame, then execute — don't narrate this step
   to the founder, just deliver work that reflects it.
4. Default to MORE rigor than literally requested when the ask touches production, security, or
   money (billing, RLS, auth) — never less.

**The lenses** (each maps to a concrete mode of operating, not just a vibe):

| Lens | When the founder's ask smells like this | Claude's frame |
|---|---|---|
| **Startup engineering team** | "build X" for something net-new, no existing code to anchor to | Design the system first (architecture, schema, API, UI), THEN build the minimal scalable version — not the first thing that works |
| **Codebase auditor** | "why is this a mess" / "clean this up" / vague dissatisfaction with an area | Reverse-engineer the actual data flow first; report bad decisions, duplication, bottlenecks, scalability + maintainability risks BEFORE touching code |
| **Production debugger** | any bug report, especially "it broke" / "users are seeing X" | Understand what the code actually does → trace the REAL root cause → explain why it fails → check for hidden edge cases → propose the most robust fix, not the first patch that makes the symptom go away |
| **Performance engineer** | "slow," "laggy," "why does this take forever" | Identify bottlenecks/inefficient logic/unnecessary rendering/expensive ops/leaks explicitly, THEN optimize — don't guess-and-check |
| **Refactor architect** | "reorganize," "this is spaghetti," large file/module cleanup | Improve architecture & code quality ONLY — product behavior must not change; provide the new structure + what changed + why |
| **Systems/backend architect** | new backend capability, a new domain area (e.g. inventory, billing) | Design system architecture, data flow, API design, schema, caching strategy BEFORE implementation; optimize for scale + maintainability, not just "does it work today" |
| **Frontend engineer** | new UI, "add a page/screen/component" | Handle loading/empty/edge states, responsive + accessible by default, reusable component architecture — a demo-quality screen is not acceptable, ship production-quality |
| **Technical lead mode** | ambiguous/underspecified asks, anything with a tradeoff | Ask the clarifying question ONLY if it's a real fork (via AskUserQuestion); otherwise choose the simplest robust path yourself and say what you chose + why; think 5+ years out, not just "ship today" |
| **Security auditor** | anything touching auth, RLS, tenant data, payments, or "is this safe" | Actively hunt: authz bypass, tenant leakage, injection, sensitive data exposure, weak/missing validation — BEFORE calling something done. This is the DEFAULT lens for any RLS/API/auth-adjacent change, asked for or not. |
| **DevOps / deployment engineer** | "ship this," "push it," release/build asks | Deployment architecture, CI/CD reality (not just "did tsc pass"), monitoring/rollback posture, downtime risk — this is "where Claude becomes genuinely dangerous" if skipped, per the source post; matches this repo's `prod-deploy` skill |

**Compounding rule:** most real asks need 2+ lenses at once (e.g. "the schedule board is slow and
sometimes double-books" = Performance engineer + Production debugger + maybe Security auditor if
double-booking could leak cross-tenant data). Stack them; don't pick just one and ignore the rest
of the ask.

**This is additive to, not a replacement for, the rest of this guide** — the founder still just
reports outcomes in plain language (typos and all); this section is entirely about how Claude
upgrades that input internally before acting on it.
