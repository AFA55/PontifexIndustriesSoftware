# Operator flow rebuild — Aug 6, 2026

Everything the founder and the crew reported in one place, grouped so it can be
worked in small batches. **Two or three items at a time, then an agent reviews
behind it, then continue** — his instruction, and the right one given how many
regressions this codebase has produced when several things move at once.

The demo ticket for watching all three points of view is **DEMO-2026-000001**
(`1b9b5010-d553-49d8-9210-3c3809f57daa`) — 2 days, wall sawing + core drilling +
slab sawing, Demo Operator as lead, Demo Helper as team member.

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

## Working rules for this rebuild

- **Two or three items, then stop.** Agent review behind each batch before moving on.
- **Nothing ships without the founder seeing it** on DEMO-2026-000001.
- **Never break what operators already recorded.** Add fields, derive old ones;
  do not rename or migrate stored JSON. (The `equipment_selections` near-miss on
  Aug 6 is why.)
- **A disabled control must say why.** Devin lost three days to a button that
  was simply below the fold.

## Open question for the founder

On **1c**: when a multi-day job resets each morning, should the previous days'
entries still count toward the job's SCOPE PROGRESS (they should — the work was
done), while only the day's ENTRY FORM starts empty? That is the reading I am
building to unless told otherwise.
