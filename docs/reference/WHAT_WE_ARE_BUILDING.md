# What we are building

Written Aug 17 2026, from the founder's own account of the goal, with the state
of the system measured against it rather than assumed.

This is the document to read when a decision needs to be judged against the
point of the company rather than against the ticket in front of you.

---

## The goal, in three horizons

**1. Make it work for Patriot.** One real concrete-cutting company, ~13 crew,
running its whole operation on this. Not a demo — the trial customer's real
money moves through it. Everything else depends on this being genuinely true
first, because a platform sold on a promise it has not kept for its own first
tenant is a platform that gets returned.

**2. Make it sellable.** Release publicly with zero issues. Add companies,
white-label them behind their own company code, and let them plug in the
features they want — an automated, plug-and-play onboarding where a new company
starts collecting its own data on day one without the founder touching anything.

**3. Make it an instrument.** With enough companies running on it, the software
becomes the mechanism by which a private-equity fund can acquire concrete-cutting
companies and integrate them: one modular operating system, dropped into each
acquisition, so the operators can stop administering and focus on culture, sales
volume, and valuation.

The founder's words for horizon 3: *"I have the bones with this software."* That
is the right read. The bones are real. What follows is what turns bones into
something that carries weight.

---

## What the software is for

A concrete-cutting company runs on facts that live in three places: what the
office quoted, what the crew actually did, and what the customer will pay for.
Traditionally those three are reconciled by hand, late, by a project manager with
a paper ticket and a memory. That reconciliation is where the margin leaks.

**This platform's job is to make those three things the same record.**

Everything below is downstream of that sentence:

| Capability | Why it exists |
|---|---|
| Schedule board + dispatch | The office's intent, in one place, dispatchable directly |
| Work tickets (printed + digital) | The instruction the crew carries; the same document either way |
| Time & performance | What each person actually did, per job, per day |
| Live job tracking | Where the work is now, without a phone call |
| Revenue per employee | Which work and which people actually make money |
| Invoicing from the ticket | The bill is generated from the record, not retyped from it |
| Takeoff assistance | Scope measured once, carried forward |
| Learning from collected data | Every job makes the next quote better |

The strategic prize is the sixth line. A project manager who spends their week
invoicing is a project manager not selling. Every hour this software takes off
that task converts directly into revenue capacity — which is the argument that
sells it to the next company, and the argument that makes it valuable to a fund.

---

## Where it actually stands (measured Aug 17 2026)

```
Code            433 API routes · 140 pages · 154 components · 167 lib modules
                ~300,000 lines of TypeScript · 75 test files · 1,513 tests
Database        177 tables · 517 RLS policies · 0 tables with RLS disabled
Live            2 tenants · 27 active users · 52 jobs
```

Built in roughly five months by a founder who does not write code, directing AI.
That is the fact to hold onto when judging everything else here: the scale is
real, and so are the gaps that come from building fast.

### What is genuinely solid

- **Tenant isolation.** Every table has RLS enabled. Role checks go through
  SECURITY DEFINER helpers reading `profiles`, never client-writable metadata.
  This is the thing that would be fatal to get wrong for horizon 2, and it is
  right.
- **The field workflow end to end.** Dispatch → route → work → day log → closeout
  exists and is used daily by real crews.
- **The printed ticket.** One design, two renderers, one formatting library.
  Measured to fit one page across every production job.
- **A verification habit.** Builders are followed by an adversarial review pass.
  It has caught a blocking defect in most batches, including a live cross-tenant
  read and a route that returned "job not found" for every job.

### What is not yet true, and blocks horizon 2

**1. Customer signatures do not hold up.** Of 15 completed jobs, 7 are marked
signed, 2 carry an actual signature image, 2 carry a signer's name, and 4 assert
a signature with no artifact behind it at all. A completion record that says a
customer signed when nothing was captured is worse than a blank one — it is the
document you would produce in a dispute, and it is empty inside. Fix the capture
flow *and* stop writing the flag without an artifact.

**2. There is no staging environment.** Every change is verified against
production data because there is nowhere else. The trial customer's live records
are the test fixture. This is survivable with one tenant and disciplined review;
it is not survivable with ten, and "release with zero issues" is not reachable
from here.

**3. Nothing catches a schema lie.** Twice this month a route named a column that
does not exist. PostgREST rejects the whole query on one bad name, so the feature
returned "not found" for every job — and it passed the typechecker, passed the
build, and passed 1,500 tests. The only thing that caught it was a human checking
names against the database. That check must become automatic before more people
depend on it.

**4. Configuration lives in code.** Who receives which notification, what a
supervisor's shift end is, what a role may do — much of it is decided in source
files. A company the founder does not work for cannot change any of it without
him editing the repository. That is the opposite of plug-and-play, and it is the
single largest gap between this system and horizon 2.

**5. Features exist that nobody can find.** Three times in one day the founder
asked for something already built: the office close button (shipped early August,
rendered in one place he never visited), the day-after notification suppression,
the print permissions. The cost is not wasted code — it is that the product feels
incomplete when it is not, and that judgement about what to build next gets made
on a false picture.

**6. Money data is incomplete.** 12 of 14 active crew have no pay rate on file,
so labor cost computes to $0 no matter how correct the hours are. Revenue per
employee — a headline capability — cannot work until that is filled in.

---

## The principles this build is held to

These are not generic best practices. Each one is here because violating it has
already cost this project something real.

**A field may only be editable once the load can re-populate it.**
Sent-but-not-loaded is a wipe. Loaded-but-not-sent is a silent discard. Both are
worse than an honestly absent control. This rule was learned from six separate
silent failures.

**A dead query must be loud, not empty.** The recurring defect in this codebase
is not a crash — it is a screen that shows nothing and looks like missing data.
Ask of every empty state: *is this empty, or was I refused?*

**A screen must never offer what the server will refuse.** Print buttons that
403'd for supervisors. A close button that 403'd for salesmen. Same shape every
time: the page says yes, the API says no. Role rules belong in one place both
sides read.

**Verify against the database, not against memory.** Every claim in this document
was measured. The habit matters more than any individual number: this project has
repeatedly been saved by someone checking rather than reasoning.

**Never `new Date('YYYY-MM-DD')`, never `toISOString().split('T')[0]`.** Both
render the previous day in US timezones. Use `lib/dates.ts`.

**Every new table carries `tenant_id` and tenant-scoped RLS**, via the SECURITY
DEFINER helpers. `supabaseAdmin` bypasses RLS entirely, so every query using it
needs an explicit tenant filter.

**Fire-and-forget does not work in serverless.** The instance freezes after the
response and kills the in-flight call. Await anything that must land.

---

## What has to be true before another company can be sold this

In rough order of what would hurt most if skipped:

1. **A signature that means something.** Legal artifact, captured reliably, never
   asserted without evidence.
2. **A staging environment.** Somewhere that is not the customer's live data.
3. **An automated schema check.** A test that fails when a route names a column
   that does not exist.
4. **Configuration out of code.** Notifications, roles, shift windows, pay basis
   — a tenant admin changes these, not the founder.
5. **Onboarding that runs itself.** Company code, branding, users, settings —
   without a developer in the loop.
6. **A discoverability pass.** Every capability reachable from where the work
   happens. If the founder cannot find it, a stranger certainly cannot.
7. **Data completeness rules.** A tenant with no pay rates should be told its
   revenue reporting will not work, at setup, not discovered months later.

---

## Related

- `BACKLOG.md` — what is being worked on now
- `ARCHITECTURE.md` — how the system is built
- `docs/plans/BILLABLE_HOURS_AND_SHOP_TICKETS.md` — the billing model in progress
- `docs/plans/STAGING_ENVIRONMENT.md` — item 2 above
- `docs/playbooks/HOW_WE_BUILD.md` — the operating model between founder and AI
