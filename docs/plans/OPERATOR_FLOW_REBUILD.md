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

**Founder / demo site contact:** Andres Altamirano — **470-658-6313**. This is
the number to put on any demo ticket so he receives the waiver, the customer
notifications and the portal link himself. NEVER seed a demo with an invented
number that might reach a real person; use his, or the reserved 555-01xx range.

⚠️ **Seeding scope_details — use the keys the display actually reads**, or the
fields render as "-". Cuts: `linear_feet`, `depth`, `num_cuts`. Holes: `qty`,
`bit_size`, `depth`. (`length`/`width` are the AREA-mode keys and do not render
in the cuts table — that mistake made the first demo ticket look half-empty.)

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

## BATCH 6 — waiver timing ✅ MOSTLY RESOLVED (revised Aug 7 after live test)

**REVISED BY THE FOUNDER after testing the real flow.** He pressed Start In
Route, received the "crew is on the way" notification AND the waiver request,
and concluded the double message is **correct and wanted**: the site contact
learns we're coming *and* what they need to sign before we arrive.

So the earlier instruction — "move the waiver prompt to after In Route" — is
**superseded**. The automatic send already fires on the first In Route tap
(`lib/waiver-dispatch.ts`), which is exactly the moment he wants. Nothing to
move.

**What the flow should be, confirmed:**
1. Operator taps **Start In Route** → contact gets the en-route notice **and**
   the waiver link. They can sign before the crew arrives.
2. If it's still unsigned when the crew lands, the operator has
   **Resend waiver** / **Sign in person** on the ticket — already built
   (`WaiverBanner.tsx`) — so it gets signed **before work starts**.
3. Either way the signed waiver is saved. → **batch 11b** (PDF stored against
   the job).

**6a. STILL OPEN — the operator's card position.** The amber "Waiver not signed
yet" card currently sits ABOVE the Start In Route button, so it greets the
operator at the shop before he's set off or had any contact with the site. Move
it BELOW Start In Route, so it appears once he's travelling/arrived — which is
when he can actually do something about it. This is a placement change only; the
send timing is right as it is.

**6b. STILL OPEN — one waiver, one wording.** See batch 8: "Sign in person"
opens a different page carrying different, unreviewed text. That matters more
now that the founder has confirmed on-site signing is a normal path, not an edge
case.

---

## BATCH 7 — equipment intelligence (added Aug 7, explicitly NOT urgent)

**7a. Recommend equipment from the physics.** Floor sawing at 12in thick needs a
30in blade and a 30in guard — usable depth is roughly (blade ÷ 2) minus arbor
and guard allowance. Encode the table Patriot actually uses and recommend from
it. **This part must never be "learned"**: it is a fact, and a wrong guess sends
a crew out with a blade that cannot reach the depth.

**7b. Learn from what PMs actually pick.** Today, equipment added that isn't in
the quick-add list renders OFF TO THE SIDE as free text instead of matching the
catalogue items. It should (a) render identically, and (b) be saved against the
WORK TYPE it was chosen for, so next time that work type is scoped it is
offered. Over time the catalogue reflects how Patriot really works rather than
what was hardcoded.

*Cautions to state out loud when building:* recommend, never auto-add — a crew
arriving without gear because software silently dropped it is far worse than an
extra tick box. Frequency is not correctness: if three PMs pick the wrong blade
the system will cheerfully learn the wrong blade, so the physics table stays
authoritative and learning may only SUGGEST. Tenant-scoped. And always show WHY
("30in blade — needed for 12in depth") so an operator can overrule it knowingly.

---

## BATCH 8 — one waiver, one wording (added Aug 7)

**8a. Delete the separate in-person waiver page.**

The founder opened the `/sign/[token]` link and liked it — wording and layout
both. Then he pressed **Sign in person** on the operator ticket and got a
DIFFERENT page.

**This is not cosmetic.** Verified: `app/sign/[token]/page.tsx` imports
`lib/legal/utility-waiver` (the researched SC text — §32-2-10 savings clause,
gross-negligence carve-out, SC811 statement). The in-person page,
`app/dashboard/job-schedule/[id]/utility-waiver/page.tsx` (366 lines), **does not
import it at all** and carries its own separate wording. A site contact signing
in person is therefore agreeing to different, unreviewed text than one signing
remotely. Two versions of a liability document in circulation is an exposure.

**Build:** delete the in-person page; point "Sign in person"
(`WaiverBanner.tsx:150`) at the same `/sign/[token]` experience — get-or-create
the request, then open it on the operator's own device for the contact to sign
there and then. Same component, same wording, same record; only the delivery
differs. The remote path is unchanged, and the job should carry a visible
**"Utility waiver pending"** affordance so the customer knows a signature is
outstanding.

Only `WaiverBanner` links to the old page today, but check before deleting.
Once wording becomes editable (batch 5/task #55), having ONE source stops being
tidiness and becomes mandatory.

---

## BATCH 9 — the team member's view + who grades whom (added Aug 7)

**9a. The team member's ticket is missing what they need.** Add, as plain
reference they can see the moment they open it — NOT as a step, and NOT gated
behind anything (a team member has no equipment-checklist responsibility):
  • Site contact
  • **Job location / address**, with the same Open-in-Maps affordance the
    operator gets — the helper may be driving their own vehicle
  • **The operator's phone number** — working with Zack means Zack's number is
    right there. This is the genuinely missing piece.

⚠️ **CORRECTION (Aug 7):** I first reported these numbers as missing. They are
not. `profiles` has **two** phone columns — signup and invite write
`phone_number`, which is populated for every active crew member, while `phone`
is empty. I read `phone`. The founder was right that the data is collected.
See **batch 10a** — fix the column before building this, then the number is
simply there to read. Still handle "no number on file" gracefully, and decide
who may edit: the person themselves always, probably admin/ops too; never let
one crew member silently overwrite another's contact details.

**9b. Ratings — who grades whom.** Never one blended score; each SOURCE keeps its
own average and its own count.

An **operator** is graded by three sources: the **helpers** who worked with them,
the **supervisor** from site visits, and **customers** at signature time.

A **helper** is graded by two: the **operator** they worked with, and the
**supervisor**.

⚠️ **Schema gap:** `supervisor_visits` records ONE `operator_id` and rates only
the operator. When the supervisor visits a site there is usually a team member
there too, and he must be able to rate them as well. A visit therefore needs
ratings for MULTIPLE people — a per-person child of the visit, not a UI tweak.

Always show the COUNT beside the average. A 5.0 from one rating is not a 4.6
from twelve and must not look like it.

---

## BATCH 10 — the phone-column bug + notifications centre (added Aug 7)

**10a. `profiles` has TWO phone columns and everything reads the empty one.**
*(P0 — do this first; it unblocks 9a.)*
Signup and the invite flow write **`phone_number`**; it is populated for every
active Patriot person. **`phone` is NULL for all of them.** Any code reading
`phone` sees nothing — which is why crew numbers look missing across the app,
and why the founder was told the data had never been collected. It had.

Audit both columns' readers and writers, make `phone_number` canonical (it holds
the real data — renaming a populated column is the risky direction), and
**normalise on write**: live values include `(864) 275-0064`, `+4706586313` and
`470-658-6313` all at once, and SMS needs a predictable shape.

**10b. Notifications centre.** Admin should SEND, not only receive.
  • Choose recipients — one operator, several, or all.
  • Attach an ACTION the recipient ticks off, same pattern as the equipment
    checklist: "verify your phone number", "edit your phone number", "your
    personal info is incomplete" — and let them update it from that prompt.
  • Time-off decisions send the confirmation back to the requester.
  • **See and control the AUTOMATED notifications too** — clock-in, work-performed,
    clock-out, dispatch, waiver chase, midday — at minimum on/off and timing.

*Build note:* there are already two notification tables — `notifications` (what
the bell reads) and `schedule_notifications`. Writing to only one is exactly why
PM hand-backs went unseen. Be explicit about which is canonical instead of
adding a third path. The founder asked that this be **merged into the dashboard
grouping work (batch 5 / task #56)** rather than becoming another top-level tab.

---

## BATCH 11 — after they sign (added Aug 7)

The founder tested a live waiver send end to end. **The send works.** The tail
end doesn't exist yet.

**11a. SMS wording — ✅ DONE Aug 7.** It used to open "Our crew is heading to
{address}…", duplicating the en-route notification the contact already receives
when the operator taps In Route, and burying the one thing the message is for.
Now: *"{Company}: before we start cutting we need the utility & liability waiver
signed for {site}. Sign here: {link}"*.

**11b. On signature → PDF, stored, attached to the job.** Render the signed
waiver exactly as they saw it, with signature, name, date and job, and attach it
to that job so the office can pull it up later. Private bucket + signed URLs —
see the maintenance-photos lesson, where a private bucket served through
`/object/public/` 403s silently and the photos looked lost. Surface it on the
job ticket and in the documents area (batch 5 / task #55).
*Reuse `lib/generate-completion-pdf.ts` and the `completion-pdfs` machinery
rather than inventing a second PDF path, and reuse tenant branding.*

**11c. Offer the copy, don't demand the address.** Keep the thank-you, then ask
whether they'd like it emailed: a field for their email, or "No thanks". Never
block on an email address.

**11d. Return them to their dashboard**, not a dead end — the customer portal,
where they can view the project and its details, **Add work / Add notes** (ties
into the queued change-order flow) and **Leave operator review** (feeds the
CUSTOMER rating track, batch 9b).

**11e. A contact on several live jobs** must be able to move between the jobs
currently running for them rather than being stuck on the one they just signed.
Portal tokens are per-customer with an optional job pin — check how a contact
with multiple live jobs resolves today before building.

---

## Working rules for this rebuild

- **Two or three items, then stop.** Agent review behind each batch before moving on.
- **Nothing ships without the founder seeing it** on DEMO-2026-000002.
- **Never break what operators already recorded.** Add fields, derive old ones;
  do not rename or migrate stored JSON. (The `equipment_selections` near-miss on
  Aug 6 is why.)
- **A disabled control must say why.** Devin lost three days to a button that
  was simply below the fold.
- **Before reporting data as "missing", check for a second column.** `profiles`
  has both `phone` and `phone_number`; reading the wrong one produced a
  confident, wrong report to the founder. Read/write path mismatches are the
  single most common defect class in this codebase.
- **Merge overlapping tasks in this file rather than letting them multiply.**
  The founder repeats himself across sessions by design; the file should stay
  short enough to read in one sitting.

## Answered by the founder

- **1c** — progress is KEPT; only the day's entry form starts clean. ✅ shipped.
- **5a** — second job is **visible but locked**, and the lock states why.
- **5a** — "finished for today" frees the operator for the next job.

## Open question

**5b** — does a SCOPE / work-type edit count as a change worth re-dispatching,
or only crew and timing? He mentioned operators, helpers and work type, so the
current assumption is that all three count. Confirm before building.
