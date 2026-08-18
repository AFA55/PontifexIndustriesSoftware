# Getting paid — the commercial workflow

Written Aug 17 2026 from the founder's brief. Planned, not built.

> **I am not a lawyer, and nothing here is legal advice.** This document sets out
> the commercial mechanisms that are standard in trade contracting and how the
> software should support them. Every clause, notice and deadline below must be
> reviewed by an attorney licensed in the states Patriot works in before it is
> used on a real customer — lien rights and notice requirements in particular are
> state-specific, deadline-driven, and unforgiving. What this document is good
> for is telling that attorney precisely what you want to achieve, and telling a
> builder precisely what to build.

---

## The problem

Cash arrives long after the saw stops. The gap is filled by a project manager
chasing paperwork that should have existed before the crew ever mobilised. The
founder's aim: **be paid for the job sooner, with less of a PM's week spent on
it**, and stop discovering a payment problem after the work is done.

Three failures cause almost all of it:

1. **Work starts before the paperwork exists.** No signed authorisation, no
   credit terms agreed, no PO number, no confirmed billing contact.
2. **The scope that was quoted is not the scope that was cut** — and nobody
   captured the difference at the moment it happened.
3. **Completion is not provable.** Of 15 completed jobs, 2 carry a real customer
   signature. Four assert a signature with nothing attached. An invoice disputed
   on "we never agreed that was done" has nothing behind it.

Everything below attacks one of those three.

---

## Part 1 — Estimate, not bid

The founder's own words, and they should appear on every quote:

> "We are a concrete cutting company and our business is cutting concrete. When
> we send estimates, these are estimates for what we can do the work for — not
> bids. We cannot determine concrete bids due to lack of information, and change
> orders will be imposed if circumstances change from what was described in the
> quote."

This is right, and it is standard practice in the trade for a real reason: what
is inside a slab is unknown until it is opened. Rebar density, post-tension
cables, actual thickness, aggregate hardness, unmarked conduit — all of these
change the work and none are knowable from a walk-through.

**What the software must do:**

- Every quote carries a **qualifications and exclusions** block. Not an
  attachment — printed on the document, in the customer's language.
- The block states what the price assumes (thickness, reinforcement, access,
  hours of work, water and power availability, who removes spoil) and what it
  excludes.
- The estimate says plainly it is an **estimate based on the described
  conditions**, and that conditions differing from those described are handled by
  change order.
- The same assumptions are carried onto the **work ticket**, so the crew knows
  what was priced and can recognise a deviation on site.

That last point is the one that makes it real. A clause the crew never sees
cannot be enforced by the crew, and the crew is who discovers the deviation.

**For the attorney:** ask them to review the qualifications block, the change
order authority language, and whether your state requires specific contract
disclosures for this class of work.

---

## Part 2 — Progressive job entry

The founder's ask:

> "Maybe first we can put a job on the schedule after we won bid, and not have to
> input all information at once — being able to add it to the schedule and later
> on being able to input information."

Correct instinct. Today the schedule form demands the full picture up front,
which means either a delay in scheduling or a job entered with invented details.
Both are worse than an honest partial record.

**The model: a job has stages, and each stage has its own required set.**

| Stage | Required to advance | What it unlocks |
|---|---|---|
| **Won** | Customer, site address, rough scope, date | Appears on the schedule board |
| **Scheduled** | Crew, arrival time, equipment, conditions | Dispatchable; ticket printable |
| **Authorised** | Signed authorisation, PO (if required), terms confirmed | Crew may mobilise |
| **Complete** | Work performed, quantities, customer signature | Invoiceable |
| **Invoiced** | Invoice issued | Collections clock starts |

**The rule that makes this safe:** a job may sit incomplete, but the software
must say what is missing and refuse the action that depends on it. A job with no
signed authorisation can be scheduled — it cannot be dispatched. That is a
visible, explained block, never a silent one.

This is the same principle as §2 of the UI principles: *is this empty, or was I
refused?* An incomplete job should look incomplete, with a checklist, not look
finished and fail later.

---

## Part 3 — The customer profile as a paying entity

Today `job_orders` carries loose customer text fields. A customer who pays is a
different object from a name on a ticket. A complete profile should hold:

- **Legal entity name** and billing address (often not the site address)
- **Billing contact** — name, email, phone — distinct from the site foreman
- **Payment terms** — net days, deposit required, retainage
- **PO requirements** — does this customer reject invoices without one?
- **Tax status** — exemption certificate on file where applicable
- **Credit status** — approved limit, current exposure, hold flag
- **Preferred documents** — some GCs require their own forms, lien waivers,
  certified payroll
- **Insurance certificate requirements** — who must be named additional insured

**Why this pays for itself:** most invoice disputes are administrative, not
substantive. A missing PO number, an invoice sent to the wrong address, a form
the GC required and never received. Each is a two-week delay. Capturing them once
per customer eliminates them for every subsequent job.

**A credit hold is the highest-leverage feature here.** A customer who has not
paid should not silently get another job cut. The software knows; nobody is
watching.

---

## Part 4 — The document pack

Each job accumulates a set of documents. Today some exist, some are partial.

| Document | When | Status today |
|---|---|---|
| Estimate with qualifications | On quoting | Partial — no qualifications block |
| Work authorisation | Before mobilising | **Missing** |
| Utility waiver | Before cutting | Exists |
| Silica / safety plan | Per site rules | Exists |
| Change order | When conditions differ | **Parked** (`docs/plans/CHANGE_ORDERS.md`) |
| Completion sign-off | At finish | Exists but unreliable — see Part 5 |
| Lien notices | State-deadline driven | **Missing** — attorney territory |
| Invoice | After completion | Exists |

**Work authorisation is the gap that costs the most.** A signature before the
crew mobilises — acknowledging the scope, the qualifications and the change-order
mechanism — converts a dispute from "we never agreed that" into "here is what you
agreed to." It is also the cheapest to add, because the signature machinery
already exists.

**Preliminary lien notices are a genuine legal instrument and genuinely
dangerous to get wrong.** In many states the right to lien is lost by missing a
notice deadline measured in days from first furnishing labour. Software can track
and remind. Software must not decide. Ask your attorney which states, which
deadlines, and which form — then the platform can enforce the calendar.

---

## Part 5 — Completion that proves itself

**The measured state:** 15 completed jobs, 7 flagged signed, **2** with an actual
signature artifact, 2 with a signer's name. Four say signed with nothing behind
them.

That is the single weakest link in getting paid. The completion signature is the
document you produce when a customer says the work was not done, or not done to
that quantity. On most jobs it does not exist, and on four it exists as an
assertion with no evidence — which is worse, because it looks like proof until
someone asks to see it.

**What has to change:**

1. **Never write a "signed" flag without an artifact.** If no signature was
   captured, the record must say so honestly. This is a data-integrity fix and
   should not wait for the redesign.
2. **Make signing the path of least resistance at the moment the work ends.** The
   crew is standing next to the customer exactly once. The current flow buries
   the signature behind a completion choice that crews frequently get wrong —
   five of six closeouts in four days left the job un-completed, so the signature
   step was never reached.
3. **When the customer is not on site, the texted link must be the obvious
   fallback**, sent before the crew leaves, not remembered later.
4. **Capture what was signed for**: quantities, not just a name. A signature
   against "work complete" is weaker than a signature against "148 LF cut, 12
   cores drilled."

---

## Part 6 — Change orders, and owning your own mistakes

The founder:

> "Some people may be unhappy or weren't planning for a change order, but we need
> to accept liability and take accountability."

This is the right posture and worth designing for deliberately. A change order
policy that is transparent and occasionally self-penalising is a commercial
advantage — customers who trust your change orders stop treating every one as an
argument.

**The mechanism:**

- A change order is raised **on site, at the moment the deviation is found**,
  with a photo and a note — not reconstructed in the office a week later.
- It states what the quote assumed, what was actually found, and the cost impact.
- It needs **authorisation before the extra work proceeds** wherever possible.
  Retroactive change orders are where disputes live.
- **A category for "our error"** — where the deviation came from our own
  estimating, the change order records it and does not bill it. That record is
  also how estimating gets better.

The last item is the one most companies skip, and it is the one that makes the
other three credible.

---

## What to build first

Ordered by cash impact per unit of work:

1. **Stop writing `completion_signed_at` without an artifact.** Small, and it
   removes a live legal exposure.
2. **Redesign the signature moment** so it is reached and taken. Ties directly to
   the closeout work already shipped.
3. **Work authorisation document** — reuses existing signature machinery.
4. **Progressive job entry** with per-stage requirements and a visible checklist.
5. **Customer profile** as a paying entity, with credit hold.
6. **Change orders** — already scoped and parked.
7. **Lien notice calendar** — only after an attorney defines the rules.

---

## Questions for the attorney

Bring these, not a blank page:

1. Does our qualifications-and-exclusions language hold up in the states we work
   in, and does it survive being incorporated into a GC's own contract?
2. What preliminary notice is required to preserve lien rights in each state, and
   on what clock?
3. Can we require a signed work authorisation before mobilising when the GC's
   purchase order says otherwise — which document governs?
4. What retainage and pay-when-paid terms are enforceable here?
5. What does a completion signature need to contain to be evidence — is a
   captured signature image with a timestamp and a name sufficient?
6. Are there disclosures we must make on estimates that we currently do not?

---

## Related

- `docs/plans/CHANGE_ORDERS.md` — parked, feeds Part 6
- `docs/reference/WHAT_WE_ARE_BUILDING.md` — the goal this serves
- `docs/reference/UI_PRINCIPLES.md` — §2 and §3 govern the progressive entry model
