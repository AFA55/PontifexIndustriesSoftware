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
