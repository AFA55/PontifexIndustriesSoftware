# Operator flow rebuild — Aug 6, 2026

Everything the founder and the crew reported in one place, grouped so it can be
worked in small batches. **Two or three items at a time, then an agent reviews
behind it, then continue** — his instruction, and the right one given how many
regressions this codebase has produced when several things move at once.

The demo ticket for watching all three points of view is **DEMO-2026-000002**
(`b50c0f3a-b96c-457b-9e76-7129ff7d321b`) — 2 days, wall sawing + core drilling +
slab sawing, Demo Operator as lead, Demo Helper as team member, sitting at the
very start with In Route untapped.
Logins: `zztest.operator@pontifexqa.com` / `zztest.helper@pontifexqa.com`,
password `DemoTest2026!`, company code `PATRIOT`.

---

## BATCH 1 — the entry flow stops fighting them  ← START HERE

The single biggest complaint, and it is really four separate faults that feel
like one.

**1a. The page moves while they type.**
Partly fixed Aug 5 (the autosave indicator was reflowing the header on every
keystroke, commit `bb2023ce`). Still reported, so at least one more element is
changing height mid-entry. Find it by MEASURING scroll position across a full
entry session — not by eye. Every fix here must hold the viewport still.

**1b. It doesn't remember where they were.**
Two parts: the STEP (once they've gone In Route, that screen must never appear
again) and the FIELD (coming back to work-performed must restore exactly what
they had, not a fresh form). A draft already saves; the resume is what's missing.

**1c. Yesterday's work shows as done.**
Work types render green from a PREVIOUS day's entry, so an operator opens today's
ticket and it looks like he already did it. **Every day must start clean.**
Add a read-only "View previous work performed" so history is still reachable —
visible, not editable.

**1d. Pick the work type first, then fill everything in.**
Selecting a type must NOT immediately open a modal. They tick the types they did
(core drill, slab saw, …), scroll down, and fill in each one's fields in
sequence, then notes. Includes an **Other** type where they type what they did.

---

## BATCH 2 — the order of the day

**2a. Photos come AFTER the work is fully entered** — their own step, not mixed
into the entry screen.

**2b. Only THEN** the "done for today / job complete" choice.

**2c. Remove "Arrived on site" entirely.** Active Jobs shows a job as not
active with 0 hours while the crew is on site and already cutting. GPS already
tells us when they arrived — the button adds a step and produces a lie.

---

## BATCH 3 — what the office sees

**3a. Active Jobs colour states.** One colour when the crew goes In Route (the
job is live), another once they finish for the day or complete it (heading back
to the shop). Colour choice doesn't matter; being able to read the board at a
glance does.

**3b. Added crew submit like team members.** Duplicating a job and assigning
someone makes them do a full work-performed ticket — correct. But when people
are ADDED to an existing job and one is made lead, the others must submit the
lighter team-member ticket, not a full one.

---

## BATCH 4 — Team Profiles

**4a. The roster is wrong.** 37 rows, 21 "active", but only ~18 real people —
and only 13 are field crew. Polluting it: 4 QA/demo accounts marked active, a
DUPLICATE of the founder (`andres@patriotconcretecutting.com` and
`andres.altamirano1280@gmail.com`), and 16 inactive rows that are mostly
"Deleted User" tombstones. Team Profiles must show REAL PEOPLE by default.

**4b. Nowhere to enter pay.** `hourly_rate` is NULL on all 37. There is no field
for it, which is why it has never been filled in. Labor cost reads "rates not
set" everywhere as a direct result.

**4c. Their data isn't shown.** DOB and emergency contact ARE being captured at
signup and never displayed.

**4d. The screen looks unchanged.** Redesign using the `frontend-design` skill.

---

## BATCH 5 — dispatch and job sequencing (office-side, added Aug 7)

**5a. One active job per operator — visible but LOCKED.** *(founder decided
Aug 7)* An operator finishes one job before starting the next. The second
dispatched job still SHOWS on their schedule — they can see what's coming — but
cannot be started, and **the lock must say why**: "Finish DEMO-2026-000002
first". Never a silently greyed button.
Nuance: **"finished for today" on a multi-day job frees them for the next job**,
while that job stays open and returns to their schedule tomorrow. Only
"complete" closes it out.

**5b. Smart dispatch — push only what changed.** Pressing Dispatch lists all 6
tickets even when most were dispatched already and untouched. The real scenario:
he dispatches the day, someone doesn't show, he swaps an operator or re-pairs a
helper, and needs to re-push **only** those tickets.
Separate NEW/CHANGED from ALREADY DISPATCHED & UNCHANGED, default the selection
to the changed ones, and say WHAT changed per ticket ("operator: Zack →
Devin"). Re-dispatching an unchanged ticket stays possible but deliberate.
The point: the crew must not get a duplicate "you've been dispatched" alert for
a ticket that didn't change.
*Implementation note:* `updated_at > dispatched_at` is the naive test and it is
wrong — `updated_at` moves on any write at all. Store a fingerprint of the
fields the crew would actually notice (operator, helper, crew roster, dates,
arrival time, scope) at dispatch time and compare against it.

---

## BATCH 6 — the waiver sits at the wrong moment (added Aug 7)

**6a. Move the waiver prompt to AFTER "Start In Route".**

*From a screenshot of the operator's ticket on DEMO-2026-000002, before
departure.* The screen currently reads, top to bottom: the job description; a
**SCOPE QUANTITIES** block (Floor Sawing / Electric Core Drilling / Wall Track
Sawing, each with linear feet, cut depth and # of cuts, mostly blank dashes
because nothing is entered yet); then an amber **"Waiver not signed yet"** card
— *"The site contact has not been sent the waiver yet. Get it signed before you
start cutting."* — with a solid orange **Send waiver** and an outlined **Sign in
person**; and only BELOW that, the green **Start In Route** button, with a red
**Job Not Ready** beneath it.

The waiver card sitting ABOVE Start In Route asks the operator to chase a
signature while he is still at the shop, before he has set off and before he has
any contact with the site. Wrong moment, and it clutters the pre-departure
screen.

**Required order:** Start In Route → travelling / arrived → waiver prompt →
work performed. The founder's reason, in his words: liability protection — get
it signed once they are on site and **before any cutting starts**.

Keep the ability to send it early for an operator who knows the contact is
already on site; just stop it being the first thing he sees before leaving.
The send + reminder machinery in `lib/waiver-dispatch.ts` already fires on the
first In Route tap — this is about WHERE the operator-facing card lives in the
flow, not about re-plumbing the send.

---

## Working rules for this rebuild

- **Two or three items, then stop.** Agent review behind each batch before moving on.
- **Nothing ships without the founder seeing it** on DEMO-2026-000002.
- **Never break what operators already recorded.** Add fields, derive old ones;
  do not rename or migrate stored JSON. (The `equipment_selections` near-miss on
  Aug 6 is why.)
- **A disabled control must say why.** Devin lost three days to a button that
  was simply below the fold.

## Answered by the founder

- **1c** — progress is KEPT; only the day's entry form starts clean. ✅ shipped.
- **5a** — second job is **visible but locked**, and the lock states why.
- **5a** — "finished for today" frees the operator for the next job.

## Open question

**5b** — does a SCOPE / work-type edit count as a change worth re-dispatching,
or only crew and timing? He mentioned operators, helpers and work type, so the
current assumption is that all three count. Confirm before building.
