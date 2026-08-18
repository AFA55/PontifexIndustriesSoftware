# Feature ideas — the parking lot

Ideas worth building eventually, captured before they are lost. Nothing here is
scheduled. An idea graduates out of this file into `BACKLOG.md` or its own plan
document when it is next.

**Format.** Each idea states the problem it solves, why it fits the strategy, and
what would have to be true first. An idea with no problem attached is a feature
looking for a justification — write the problem or leave it out.

**Source labelling matters.** Founder ideas carry his reasoning; anything I
suggest is marked as mine, so nobody later mistakes my speculation for his
direction.

---

## 1. Hands-free capture → a repair knowledge repository
**Source: founder, Aug 17 2026**

> "Eventually using Meta glasses to record mechanics fixing things — being able to
> keep a repository of how to fix different things. I've been collecting that
> data."

**The problem.** A concrete-cutting company's most valuable knowledge lives in
the heads of a few experienced people: how to change a bearing on a specific wall
saw, why a hydraulic unit keeps losing pressure, which fix actually held last
time. When that person is unavailable — or leaves — the knowledge leaves. Every
company in this trade pays this tax, and none of them have solved it, because the
capture cost has always exceeded the perceived benefit. A mechanic with greasy
hands does not stop to write documentation.

**Why glasses are the right instrument.** They remove the capture cost. The
mechanic is already looking at the thing; hands stay on the work. That is the
whole unlock — not the video, the *absence of a decision to record*.

**Why it fits the strategy.** The founder's stated goal includes "self-learning
software from all the data it collects" and managing *every* operational system.
Equipment downtime is a direct hit to revenue: a saw that is down is a crew that
is idle on a job that is booked. A searchable repository of how this exact
machine was fixed last time turns a day of downtime into an hour.

For horizon 3 — a fund acquiring several companies — this is arguably the highest
value asset in the platform. Acquired companies each hold undocumented
maintenance knowledge; a system that captures and pools it across the portfolio
compounds in a way no single company can replicate. That is a genuine moat, and
it is a much stronger acquisition argument than scheduling software.

**What would have to be true first:**
- Equipment must be a first-class record with a service history. Today the
  platform has equipment selections on jobs and maintenance requests, but not a
  per-asset history a repair could attach to.
- Storage and retrieval cost of video needs a real answer. Video is expensive to
  store and nearly useless without indexing — the value is in the *transcript and
  the steps*, not the footage. Transcribe, extract steps, keep the clip as
  evidence.
- Consent and privacy: recording people at work has legal and cultural
  implications. Crew buy-in is a precondition, not an afterthought.
- It should start without glasses. A phone video attached to a completed
  maintenance request, transcribed and indexed, tests the whole thesis for
  near-zero cost. If nobody uses that, glasses will not fix it.

**Smallest first step:** attach a video and a transcript to a maintenance record,
and make repairs searchable by symptom. Prove people search it before investing
in the capture hardware.

---

## 2. Estimating that learns from what actually happened
**Source: founder's vision — "self-learning software from all data it collects"**

**The problem.** Estimates are made from a walk-through and experience. The
platform already holds the ground truth for every job: quoted scope versus actual
quantities, estimated hours versus attributed hours, conditions encountered,
change orders raised. Nothing currently feeds that back.

**Why it fits.** This is the compounding asset. Every job makes the next quote
better, and an estimating engine grounded in a company's own history is not
something a competitor can copy. It also directly serves "reduce the time project
managers spend on invoicing so they can focus on revenue" — a PM who trusts the
estimate spends less time defending it.

**What would have to be true first:**
- Quoted versus actual has to be reliably captured. Today `job_scope_items`
  carries targets and `work_items` carries actuals, but completion rates are low
  enough that the training data would be thin and biased.
- Pay rates must exist (12 of 14 crew have none) or cost-side learning is
  impossible.
- Enough jobs. 52 jobs all-time is not a dataset. This idea needs horizon 2
  volume before it is worth building.

**Honest read:** this is the most strategically valuable idea in this file and
the one furthest from being buildable. Its prerequisite is not AI — it is data
discipline on the boring records.

---

## 3. Ideas raised elsewhere, tracked here so they are not lost

- **Change orders** — scoped and parked in `docs/plans/CHANGE_ORDERS.md`.
  Prerequisite for the estimating-feedback loop above, since a change order is
  the labelled example of "the estimate was wrong, and here is why".
- **Shop tickets** — in progress, `docs/plans/BILLABLE_HOURS_AND_SHOP_TICKETS.md`.
- **Notification control centre** — per-tenant, per-role, per-event. Blocking for
  horizon 2, since a company the founder does not work for cannot currently
  change who gets told what.
- **Progressive job entry, customer profiles, work authorisation** — see
  `docs/plans/GETTING_PAID.md`.

---

## Adding to this file

Write the problem first. If the problem cannot be stated in terms of money,
downtime, risk or someone's wasted hour, the idea is not ready. Then note what
would have to be true before it could be built — that field is usually what tells
you whether it is next or in two years.
