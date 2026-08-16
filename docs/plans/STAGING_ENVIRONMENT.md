# Staging Environment — Decision Document

**Date:** August 16, 2026 (written hours after the ~3.5 hour production database outage)
**Status:** Decision document. No implementation. Nothing in here has been built.
**Author:** Principal engineer review, at the founder's request.

> **The ask, verbatim:**
> "We have to stop debugging in production environment but instead recreate issue in staging
> environment then once resolved push to production. For our design principles we need scalability,
> maintainability, efficiency, and reliability."

The instinct is correct and this document takes it seriously. But the honest version of the answer is
narrower than the ask, cheaper than expected, and blocked on one thing nobody has named yet.

---

## 0. Read this part if you read nothing else

**Three things matter, in this order.**

**1. You are not "occasionally" debugging in production. You deployed to production 20 times in the
last 48 hours.** Every single one of those 20 deployments targeted production — there was no other
target available. That is not a discipline failure; it is the only door in the building. The
`DEPLOYMENT_COST.md` rule of "one push per session" has quietly become fiction, and it will stay
fiction until there is somewhere else to push.

**2. Your build costs may be roughly 50× lower than you think, and that changes this whole
decision.** Vercel's current published price for a build is **$0.0035 per CPU-minute** — rounded-up
minutes multiplied by the number of CPU cores. For a 2-minute build on a 4-core machine that is
**about 3 cents**, not $1–2. Your May invoice had a separate "Build Minutes" line at roughly
$0.124/minute that accounted for $418 of the $487 bill; **that line does not appear in Vercel's
current pricing documentation at all.** If it is gone, preview deployments are essentially free and
the main reason you have no staging environment evaporates. **This is a 10-minute check on your most
recent invoice and it is the highest-leverage item in this document.** I could not verify it from
here — I can read your deployments but not your billing page. Do this first.

**3. Staging cannot be built from your repository today, and that — not money — is the real
blocker.** Your `supabase/migrations/` folder has 262 SQL files. Your production database records
**321 applied migrations**, and its migration history *starts on January 26, 2026* — roughly twelve
months after your oldest migration file. Whatever built the first year of your schema was never
recorded. On top of that, **213 of the 262 files are named in a format the Supabase CLI cannot
order** (`20260130_name.sql`, an 8-digit date, where the tool requires a 14-digit timestamp), there
is **no `supabase/config.toml`** so the CLI has never been initialised here, and there is **no
`seed.sql`**. A staging database you cannot rebuild from the repo is a second production database,
not a staging environment.

**And one thing that must be said plainly, because the outage is fresh:**

> **A staging environment would not have caught today's outage.** Today's failure was connection-pool
> exhaustion — `idle_in_transaction_session_timeout = 0` against `max_connections = 60`, with leaked
> sessions accumulating until all 60 slots were gone. That only happens under real traffic over real
> hours. An idle staging database with three test users will never reproduce it. What would have
> caught it early is **monitoring** — an alert when connection count crosses 40, or when `select 1`
> stops answering. Do not let the relief of "we're building staging now" convince you that today's
> class of failure is handled. It is not.

Staging would have caught the **15 duplicate work-item rows** and the **"work performed saved!" bug**
(the one that reported success and saved nothing). Those are logic and data-integrity bugs, they are
deterministic, and they reproduce beautifully in a seeded environment. Two out of three. Say two out
of three, not three out of three.

---

## 1. What I verified, and where your summary was wrong

Everything below was checked against the live systems and the actual files, not assumed.

| Claim in the brief | Verdict | What is actually true |
|---|---|---|
| `vercel.json` disables branch deploys "twice over" | **Confirmed** | Two independent locks: `"ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" != \"main\" ]"` (exits 0 → skips build for any non-`main` ref) **and** a `git.deploymentEnabled` denylist covering `claude/*`, `feat/*`, `fix/*`, `worktree/*`, `develop` and more. Enabling a staging branch requires changing **both**. |
| No Vercel preview URLs exist | **Confirmed** | Last 20 deployments, spanning Aug 15–16: **all 20 had `target: production`**. Zero previews. |
| CLAUDE.md's preview claim is stale | **Confirmed — and it is not the only stale doc** | `CLAUDE.md` promises "Vercel preview — auto-created by Vercel on every branch push." False. Also `supabase/migrations/README.md` instructs `supabase db push`, which **cannot work here** (no `config.toml`, no link, 213 misnamed files). Both need correcting. |
| One Supabase project | **Wrong — there are three** | `klatddoyncxidgqtcjnu` (production, us-east-1, `ACTIVE_HEALTHY`). `thebticaroasspmbhisx` "Pontifex Industry Software" — created Sept 2025, **`ACTIVE_HEALTHY`**, largest table has **5 rows**. Abandoned first attempt, apparently still running. `hpmzqpxuwezwklpzxmrc` "vc-engine" — `INACTIVE`. **See §6a; the abandoned project may be costing you ~$10/month and could fund this entire project.** |
| Local dev points at production | **Confirmed** | `.env.local` targets the production project. `npm run dev` reads and writes live customer data. |
| 261 files vs ~311 applied | **Close, and worse than stated** | **262 `.sql` files** (263 entries incl. `README.md`) vs **321 applied migrations**. More importantly the earliest *recorded* migration is `20260126045207` while the earliest *file* is `20250130_*` — **about 12 months of schema history exists in the database with no ledger entry at all.** |
| `operator_status_history` matches no file | **Confirmed in substance** | It appears in exactly one file, `20260328_multi_tenant_foundation.sql`, but only as `ALTER TABLE operator_status_history ADD COLUMN ... EXCEPTION WHEN undefined_table THEN NULL`. **Nothing in the repo creates it.** A rebuild-from-repo would silently skip it and the app would break on first use. |
| Supabase↔GitHub auto-branching switched off | **Confirmed, and correctly so** | Branching is enabled at the project level — a `main` branch record was created today at 19:10 UTC — but **zero preview branches exist**. Leaving auto-branching off was the right call; see option (c). |
| Scale: 5,532 rows / 41 MB | **Confirmed** | 41 MB database. 46 job orders, 287 timecards, 66 work items, 45 profiles. **Your five largest tables are all logs** — notifications (948), login_attempts (756), audit_logs (680), reminder_log (469), schedule_notifications (400). Actual business data is a rounding error. |

**Three things I found that were not in the brief, and that matter:**

- **Your production `public` schema contains 177 tables, 19 views, 116 functions and 517 RLS
  policies.** That is the surface area any staging environment has to reproduce. It is the single
  biggest driver of the hour estimates below, and it is why "just clone it" is more work than it
  sounds.
- **Three ad-hoc backup tables are sitting in production right now**: `_day_number_backup_20260814`
  (127 rows), `_jda_future_backup_20260812` (85), `_work_items_backup_20260814` (78). These are the
  fingerprints of debugging in production — snapshots taken by hand before risky fixes because there
  was nowhere safe to try them. They are exactly the artefact staging is supposed to eliminate.
- **Docker 29.4.0 is already installed on this machine**, and the Supabase CLI runs via `npx`
  (v2.114.0). Option (d) needs no new purchases and no new accounts.

---

## 2. The options

Costs are monthly and in US dollars. Hours are **my estimates** — labelled where I am guessing —
and assume you working with an AI assistant, not a team.

| # | Option | $/month | Setup hrs | Ongoing burden | Reproduces a prod bug? | Reversible? |
|---|---|---:|---:|---|---|---|
| **a** | Vercel previews → **production** Supabase | ~$0–2 | 1–2 | Near zero | **No. See below.** | Fully — one config line |
| **b** | **Second Supabase project** (free tier, separate org) + previews | **$0** | 10–16 | ~1 hr/month | **Yes**, for logic/data bugs | Fully — delete the project |
| **b2** | Second Supabase project on your **Pro** org | **$10** | 8–14 | ~1 hr/month | Yes | Fully |
| **c** | One **persistent Supabase branch** | **$9.81** | 8–14 | ~1 hr/month | Yes | Fully — delete the branch |
| **d** | **Local only** — Supabase CLI + Docker | **$0** | 12–20 | ~2 hrs/month | **Yes**, and fastest loop | Fully — delete the folder |
| **e** | **Hybrid: (d) now, (b) at 3–5 customers** | **$0 → $0** | 12–20 now | ~2 hrs/month | Yes | Fully |

### (a) Previews pointed at production Supabase — why this is not staging

This is the cheapest thing that could be called staging, and it is the one option I want you to
reject explicitly rather than drift into.

A preview deployment reading and writing your production database is **a second front door to the
same house.** When you "reproduce" the duplicate work-item bug there, you create real duplicate rows
in Patriot's real data. When you test the clock-out fix, you write real timecard rows that feed real
payroll. When you test a notification change, **Twilio sends a real SMS to a real operator's real
phone number**, because the code reads the same `notification_preferences` rows and the same verified
toll-free number. Your five largest tables are logs, and preview traffic would pollute every one of
them, making the audit trail — the thing you would rely on to reconstruct an incident — untrustworthy.

More fundamentally: it does not remove the risk you are trying to remove. A migration is a schema
change, and a preview deployment shares the schema. The failure mode you had today lives in the
database, and previews share the database.

**What (a) is genuinely good for:** front-end-only work — a colour, a layout, a mobile tap-target
sweep, a copy change — where you want a shareable URL and there is no write path. That is real value
and worth having. Just never call it staging, and never test a write path or a migration on it.

**Verdict: adopt as a convenience, never as the answer to the founder's ask.**

### (b) A second Supabase project as staging — the free tier is genuinely available

I checked this specifically because it sounded too good to be true. It is not:

- You get **two active free projects**, and the limit is counted **across all organisations where you
  are Owner or Admin**.
- **Paid projects do not count toward it.** Your Pro production project does not consume a free slot.
- You **can** hold a Free-plan organisation and a Pro-plan organisation on the same account
  simultaneously — Supabase says so explicitly and supports self-serve project transfers between
  them. What you *cannot* do is mix paid and free projects inside one organisation.

So: create a **new Free organisation**, create the staging project there. **$0/month.**

**The limits, against your actual numbers:**

| Free tier limit | Your production reality | Headroom |
|---|---|---|
| 500 MB database | 41 MB | 12× — and staging will hold *less* |
| 1 GB file storage | 186 MB | Fine, and staging needs almost none |
| **Paused after 1 week of inactivity** | — | **This is the real catch** |

The pausing behaviour is the thing to understand. If you do not touch staging for seven days it goes
to sleep, and you must click restore and wait a few minutes before you can use it. For a founder who
debugs in bursts — three fixes in a day, then nothing for two weeks — you will hit this repeatedly.
It is an annoyance, not a blocker, and paused projects are neither billed nor counted against quota.
But it means staging is never *instantly* there when a bug lands at 6am, which is precisely when you
want it.

**(b2)** is the same thing inside your existing Pro org at **$10/month** (verified against the
Supabase API for your organisation) — no pausing, no size caps. That $10 buys away the pause
annoyance and nothing else.

### (c) One persistent Supabase branch

I got the real number rather than guessing: **$0.01344 per branch per hour**, confirmed both from
Supabase's pricing page and from the billing API for your specific organisation. Left running
continuously that is **$9.81/month** — effectively identical to (b2), with two differences that both
cut against it.

First, **branches start with no data from production** (Supabase's deliberate design, to protect your
customer data) and are populated by replaying **your migrations plus `seed.sql`**. You have a broken
migration ledger and no seed file. **Option (c) is the option most directly blocked by §3.** It
cannot work at all until the drift is fixed.

Second, per-branch billing is metered by the hour, which is exactly the shape of bill that surprised
you in May. One forgotten branch is $9.81/month forever; five forgotten branches is $49. You turned
auto-branching off today for this reason and you were right.

**Verdict: correct choice eventually, wrong choice now.** Revisit once the schema baseline exists and
`seed.sql` is real — at that point (c) becomes strictly better than (b2) because it rebuilds itself
from the repo automatically.

### (d) Local-only — Supabase CLI + Postgres in Docker

Docker 29.4.0 is already installed. The CLI runs from `npx`. This costs **nothing, forever**, has no
pausing, no metered billing and no vendor account to forget about.

The loop it gives you is also the *fastest* one available: `supabase db reset` rebuilds the entire
database from the baseline and seed in well under a minute. You can reproduce a bug, break it further,
reset, and try again — ten times in an hour. No hosted option can match that, because every hosted
reset is a network round trip.

**What it honestly cannot do:**

- **Nothing is shareable.** No URL to send anyone. For a one-person team today that costs nothing;
  the day a second person needs to look at a bug, it costs a lot. That day is your trigger to add (b).
- **The iOS and Android apps cannot point at it.** Both are remote-URL webviews loading
  `pontifexindustries.com`. Anything you must verify *inside the native app* — Face ID, push
  registration, native GPS — still has to go to production. Web UI, API and database behaviour, which
  is the overwhelming majority of your bugs, are all testable locally.
- **Third-party services need sandbox keys or stubs.** Resend, Twilio, Stripe and Google Maps all
  need test credentials or a no-op mode, or staging either fails confusingly or — much worse —
  **sends real messages to real people**. Budget a couple of hours for this and treat it as
  non-optional. (Google Maps already degrades gracefully on localhost today; that is documented
  behaviour, not a bug.)
- **Setup will not be smooth on the first attempt.** 177 tables, 116 functions, 517 policies, the
  `pg_trgm` extension, several storage buckets, and Supabase's `auth` schema all have to come up
  correctly. My 12–20 hour estimate is honest, and it is mostly first-run friction, not typing.

### (e) The hybrid — what I actually recommend

**Do (d) now. Add (b) when a second person needs to see a bug, or when you sign customer number two.
Adopt (a) for front-end-only previews once you have confirmed what a build really costs. Keep (c) on
the shelf until the migration baseline exists.**

This gets you a real reproduce-a-bug environment for **$0/month**, adds nothing you have to operate,
and every step is reversible by deleting a folder or a project.

---

## 3. The migration drift problem — and why it is 3 hours, not 40

**Nothing else in this document works until this is solved.** Options (b), (b2), (c) and (d) all
begin with "build a database from the repository," and today the repository cannot build your
database.

**The state of the drift, precisely:**

- 262 `.sql` files in `supabase/migrations/`.
- **321** migrations recorded in production's `supabase_migrations.schema_migrations`.
- The earliest *recorded* migration is `20260126045207`. The earliest *file* is `20250130_*`.
  **Roughly a year of schema was applied outside the ledger** — dashboard SQL editor, ad-hoc scripts,
  the loose `.sql` files still sitting in `supabase/` (`schema.sql`, `enable-rls.sql`,
  `equipment-schema.sql`, `fix-rls-policies.sql`).
- **213 of 262 files use an 8-digit date prefix**, which the Supabase CLI cannot order. Only 20 use
  the required 14-digit timestamp.
- No `supabase/config.toml` — the CLI has never been initialised in this repo.
- At least one live table (`operator_status_history`) is created by no file anywhere.

### Do not reconcile this file by file

The obvious plan — open all 262 files, match each against the 321 ledger rows, work out what the
missing 12 months did, write the gap migrations, rename everything — is **30–50 hours of archaeology
with almost no payoff**. You would be reconstructing the history of a schema you are going to keep
using either way. Nobody will ever read the result. I want to be blunt: **if a plan lands on your
desk that starts with "reconcile the 262 files," push back on it.**

### Do this instead: declare a baseline

This is the standard move for exactly your situation, and it takes an afternoon.

1. **Dump production's schema — structure only, no data** — into a single file:
   `supabase/migrations/00000000000000_baseline.sql`. This file *is* the reconciliation. It is
   correct by construction, because it was generated from the thing you are trying to describe. It
   captures all 177 tables, 19 views, 116 functions and 517 policies, including
   `operator_status_history` and everything else from the lost year.
2. **Move the 262 historical files to `supabase/migrations/_archive/`.** Keep them — they are useful
   commit history — but take them out of the CLI's path. Same for the loose `.sql` files in
   `supabase/`.
3. **Record the baseline as already-applied in production** so production is never tempted to re-run
   it.
4. **`supabase init`** to create `config.toml`.
5. **From this day forward, every schema change is a new 14-digit-timestamped file** created through
   the CLI, applied to staging first, then to production. The drift stops accumulating the moment
   this rule starts.
6. **Prove it**: `supabase db reset` against a local database, then diff the result against
   production's schema. If the diff is empty, the repo can now rebuild your database — the property
   you need and do not currently have.

**Honest estimate: 2–4 hours for steps 1–5, plus 1–3 hours for step 6** (step 6 is where the
surprises live — extensions, storage buckets, `auth` schema grants). Call it **3–7 hours total**,
versus 30–50 for the archaeology approach.

**What you lose:** the ability to replay your schema's history step by step. You will never again be
able to check out March 2026 and rebuild March's database. **You do not do this and you never will.**
This is the right trade.

**Must it happen before staging is useful?** **Yes — it is the first task, not a parallel one.**
Every option except (a) consumes the repo as its source of truth. This is not a case where you can
start staging and clean up later; the cleanup *is* the start. The good news is it is the smallest
task in this document.

---

## 4. Seeding staging without leaking customer data

Patriot's production data contains customer names, jobsite addresses, phone numbers, signed PDFs,
and payroll hours. Three ways to populate staging:

| Approach | Realism | Build hrs | Ongoing | Leak risk | Verdict |
|---|---|---:|---|---|---|
| **Anonymised production dump** | Highest | 20–30 | High — every new column needs a rule | **High and permanent** | **No** |
| **Synthetic generator** | Good | 15–25 | Medium | None | Later, maybe |
| **Hand-built fixture set** | Adequate | 6–10 | Low — edit a file | **None** | **Yes** |

**Recommendation: the hand-built fixture set — a single `supabase/seed.sql`.**

The reasoning is about liability, not effort. An anonymiser over **177 tables** is a permanent
obligation: every new column added anywhere is a column the anonymiser does not know about, and the
failure mode is silent. One missed `phone` column and staging holds a real operator's real number —
**and then a test run of the reminder cron texts him.** That is not a hypothetical; your Twilio
integration is live and approved, and `reminder_log` shows 469 rows of it working. A dump-based
staging is a system where a routine test can page a real customer. Do not build it.

A fixture file has none of that. It is data you wrote, so there is nothing to leak, and you can read
the whole thing. It is also the *same file* Supabase branching expects (`seed.sql`), so this work is
not thrown away if you later move to option (c) — it is a prerequisite for it.

**What the fixture set must contain for the operator app to be testable at all.** I verified every
table below exists in production:

- **Tenant bootstrap** — `tenants` (with `company_code`, since login is company-code + email +
  password) and `tenant_branding` (the login page and all outbound email read branding from here, not
  from `tenants`). Two tenants, so you can actually test that tenant isolation holds.
- **Identity** — `auth.users` plus matching `profiles` rows, one per role you need to exercise: at
  minimum `super_admin`, `admin`, `operator`, `apprentice`. Plus `role_permissions` and
  `user_card_permissions`, which drive what the dashboard renders.
- **The work** — `customers`, `job_orders` (several, spanning statuses including `on_hold`),
  `job_daily_assignments`, `job_crew`, `work_items`, `daily_job_logs`, `job_notes`.
- **The money and hours** — `timecards`, `timecard_breaks`, `invoices`. These carry the highest
  consequence and deserve the most fixture coverage.
- **Supporting** — `notification_preferences` (or notification code paths behave oddly), `equipment`,
  and the tenant shop location, without which GPS clock-in cannot be exercised at all.

Roughly 20 tables of the 177. The remaining 157 can stay empty; the app tolerates it, and you add a
fixture the first time a bug proves you need one.

**One rule, and it is the whole point:** *when a production bug is reproduced, the fixture that
reproduces it gets committed.* Over six months the seed file becomes a precise record of every way
this system has broken — which is far more valuable, and far safer, than a copy of Patriot's data.

---

## 5. The workflow, in plain language

This has to survive contact with a bad week or it will be abandoned. Four steps.

**1. A bug is reported.** Zack calls, or an operator says the board will not load.

Before anything else, **write down what you would need to see to know it is fixed.** One sentence.
"Zack's Tuesday hours show 8.5, not 17." This is the single highest-value habit in the whole workflow
and it costs thirty seconds. Without it you cannot tell "fixed" from "seems fine now."

**2. Reproduce it in staging — but time-box it to 20 minutes.**

Start staging, walk the same steps, see the same wrong thing. If you reproduce it, you now have
something you can break and re-break freely, and you will fix it in a fraction of the time.

**If you cannot reproduce it in 20 minutes, stop and say so out loud.** That is not a failure — it is
information, and it tells you which kind of bug you have:

- *It reproduces on fixtures* → a logic bug. Fix it in staging. This is the common case and the whole
  reason to build this.
- *It only happens with Patriot's real data* → a data bug. The fix is usually a database constraint
  (the duplicate work items are the textbook example — a unique index makes that bug permanently
  impossible, in every environment, forever).
- *It only happens under real load or over real hours* → **today's outage.** Staging will never show
  you this. Stop looking and go add monitoring instead.

**3. "Green" means these four things, and no more:**

- `npm run build` passes with zero errors.
- The one sentence from step 1 is now true in staging.
- The most important thing *adjacent* to your change still works. Touched timecards? Clock in and
  clock out once. Not a full regression sweep — one adjacent path.
- If the change includes a migration, it ran cleanly against a **fresh** staging database
  (`supabase db reset`), not just against a staging database that happened to already be in the right
  shape.

That is the entire gate. Four checks, maybe ten minutes. Resist every temptation to add a fifth — a
gate that takes an hour is a gate that gets skipped, and a skipped gate is worse than no gate because
you will believe it ran.

**4. Promote to production.**

Commit, push to `main`, watch the deploy, and check the one sentence again *in production*. Then tell
whoever reported it. That last step is not ceremony — it is how you find out the fix did not work,
before you find out three days later from an operator standing on a jobsite.

**What this workflow deliberately does not include:** pull requests reviewed by nobody, a manual test
checklist, a QA sign-off column, a release calendar, or a staging deployment for every commit. You
are one person. Every one of those is a ritual that will feel responsible for two weeks and then be
skipped, and the skipping will feel like failure and make you trust the whole process less.

---

## 6. Sequencing

### 6a. This week (highest risk reduction per hour, all reversible)

| # | Task | Hrs | $/mo | What it removes |
|---|---|---:|---:|---|
| 1 | **Check your latest Vercel invoice** for a "Build Minutes" line | 0.25 | — | The belief that every deploy costs $1–2. May be false by ~50×. Do this first. |
| 2 | **Check whether `thebticaroasspmbhisx` is billing you** | 0.25 | **-$10?** | An abandoned Sept-2025 project whose biggest table has 5 rows is `ACTIVE_HEALTHY`. If it is billing, **pause it** — pausing is free, reversible, and keeps the data. Do not delete; deletion is permanent. This alone may pay for everything else here. |
| 3 | **Baseline the schema** (§3) | 3–7 | 0 | The repo cannot rebuild the database. Gates everything below. |
| 4 | **Local Supabase stack in Docker** (§2d) | 6–12 | **0** | Nowhere to reproduce a bug. |
| 5 | **Write `supabase/seed.sql`** (§4) | 6–10 | 0 | An empty staging database is not testable. |
| 6 | **Point `.env.local` at local staging** | 0.5 | 0 | `npm run dev` writing to Patriot's live data. |
| 7 | **Fix the two stale docs** — `CLAUDE.md`'s preview claim and `supabase/migrations/README.md`'s `db push` instructions | 0.5 | 0 | Instructions that send a future session down a path that does not work. |

**Total: roughly 17–30 hours, $0/month, possibly $10/month saved.** Every item is reversible.

Items 1 and 2 are 30 minutes combined and could change the budget picture entirely. Do them before
you commit to anything else.

### 6b. Also this week — the thing staging cannot do

**Add monitoring.** Today's outage ran ~3.5 hours and you found out because the system stopped
working, not because anything told you. Staging does not help with this, and it is the highest-value
reliability item you have:

- An error tracker (Sentry is already connected to this workspace) so failures reach you rather than
  waiting to be discovered.
- An uptime check that hits an endpoint touching the database and alerts a phone when it stops
  answering.
- **A connection-count alert.** Today's specific failure was 60 of 60 connections consumed. An alert
  at 40 would have given you hours of warning. You already applied the `idle_in_transaction` timeout
  fix; the alert is what tells you when something *else* starts leaking.
- Cron liveness — a way to know a cron did **not** run. You have 15 crons in `vercel.json` and
  currently no way to notice silence.

**Estimated 4–8 hours, $0–26/month depending on tier.** If you only have time for one thing this
week, and today's outage is what is on your mind, **do this instead of staging.** Staging addresses
the bugs you can reproduce; monitoring addresses the ones you cannot. Today was the second kind.

### 6c. When you have 3–5 customers (or a second person testing)

- **A hosted staging project** (§2b, free tier, separate org, **$0**) so bugs can be shared by URL.
  **Trigger: the first time you need to send someone a link to a broken thing.**
- **Preview deployments re-enabled for exactly one long-lived `staging` branch** — requires changing
  both locks in `vercel.json`. **Trigger: after item 1 above confirms builds are cheap.** Keep every
  other branch pattern disabled.
- **Migrate staging to a Supabase branch** (§2c, $9.81/mo) once `seed.sql` is mature enough that a
  branch rebuilds itself correctly. **Trigger: when you have reset staging by hand three times and
  resented it.**

### 6d. Premature — do not build these

| Thing | Why not now | Trigger that changes my mind |
|---|---|---|
| Per-PR ephemeral Supabase branches | You are one person; there are no PRs. Metered per hour — this is the shape of your May bill. | A second engineer, and PRs that actually get reviewed |
| Anonymised production dump pipeline | 20–30 hrs to build, permanent maintenance, and it can text real customers (§4). | A compliance requirement demanding production-shaped test data |
| A separate `staging.pontifexindustries.com` domain | The auto-generated preview URL is identical in function and free. | Customers doing UAT on staging |
| A full CI test suite gating deploys | You have Jest configured and few tests. Writing tests to satisfy a gate is how gates become theatre. | Tests that already exist and already catch real regressions |
| A third environment (dev/staging/prod) | Two is one more than you have and one fewer than you can maintain. | Three or more people deploying |
| Separate staging Supabase for the mobile apps | Both apps are remote-URL webviews pointed at production; there is nothing to separate. | A native build that talks to the database directly |

---

## 7. Your four principles, answered honestly

You named scalability, maintainability, efficiency and reliability. Three of the four point somewhere
different from where the textbook would send you, and one of them is dead right.

**Scalability — your instinct is right about *change*, wrong about *load*.**
At 5,532 rows and 41 MB, load scalability is a solved problem you did not have to solve; that database
would be comfortable at a thousand times its current size. Anyone who tells you to shard, add read
replicas, or introduce a caching layer at this volume is not looking at your numbers. **But there is a
real scalability problem here and it is a different one: you cannot scale the number of changes you
make safely.** You made 20 production deployments in two days and every one carried full risk. That is
the ceiling you are actually hitting, and staging is the correct instrument for it. Keep the word,
change the object.

**Maintainability — this is where the ask is most correct, and it is worse than you think.**
The migration drift is the maintainability debt (§3). A repo that cannot rebuild its own database has
silently become a system where the only complete description of your schema is the running production
server. If that server were lost you would be reconstructing 177 tables from memory. Supabase Pro's
automated backups and PITR protect the *data*; nothing currently protects the *definition*. The
baseline dump in §3 fixes this in an afternoon and it is the best-value work in this entire document.

**Efficiency — measure before you optimise, and you have not measured.**
You have been rationing deploys against a cost model taken from one invoice in May. Vercel's current
published price is $0.0035 per CPU-minute with no separate wall-clock charge — if that is what your
account is actually billed, you have spent months of caution defending against roughly three cents a
build. Meanwhile a project you abandoned last September may have been quietly billing $10/month the
whole time. **The inefficiency is not in your deploys; it is that you are optimising a number you
have not looked at recently.** Thirty minutes of checking beats another month of rationing.

**Reliability — right word, wrong mechanism, and today proves it.**
Staging improves reliability for bugs you can reproduce. Today's outage was not that. The chain was:
a connection leak accumulated for hours → no alert existed → discovery happened when the system
stopped answering → 3.5 hours to resolve. **Staging would not have shortened that by one minute.**
Monitoring would have shortened it to minutes. Your recovery was good — the restart cleared it, the
timeout fix landed, and every row count matched the morning's audit exactly, so **no data was lost**.
But you got that outcome by responding well, not by being warned. If reliability is the principle you
care most about, §6b matters more than everything else in this document, and I would rather you did
that first and staging second.

**One thing you did not ask about, which outranks all four.** Your architecture note records **413 of
431 API route files using the service key that bypasses row-level security, with only 34 using
`resolveTenantScope`.** At two tenants that is a latent problem. At five it is the failure that ends
the company — one missing tenant filter and Patriot's payroll appears in another customer's dashboard.
**Staging is the environment where you can safely test that isolation holds**, with two seeded tenants
and a deliberate attempt to read across them. That is not the reason you asked for staging, but it may
turn out to be the most valuable thing you do with it. Its trigger is customer number two, and that is
close.

---

## 8. What I recommend against, and what would change my mind

| Recommend against | Trigger to revisit |
|---|---|
| **Calling preview-on-production-database "staging."** Adopt it for front-end previews only. | Never. This one does not become correct later. |
| **Reconciling the 262 migration files individually.** 30–50 hrs, no payoff. Baseline instead. | Never. |
| **Copying production data into staging, anonymised or not.** | A compliance requirement you do not currently have. |
| **Supabase per-PR auto-branching.** You turned it off today; that was right. | A second engineer opening real PRs. |
| **Any paid staging tier before the free one has been outgrown.** | You hit the 500 MB cap, or the 1-week pause genuinely blocks you twice in a month. |
| **Building staging before the schema baseline.** It is not a parallel task; it is the first task. | Never. |
| **Believing staging would have prevented today's outage.** It would not have. | Never — this is a fact about the failure, not a judgement. |

---

## Sources

Every price and platform limit below was retrieved on August 16, 2026. Everything about this
repository and these projects was read from the files and the live APIs, not assumed.

- Supabase pricing — free tier (2 active projects, 500 MB database, 1 GB storage, paused after 1 week
  of inactivity), Pro base and compute credits, branching at **$0.01344 per branch per hour**:
  https://supabase.com/pricing
- Supabase billing FAQ — two free projects counted across all orgs where you are Owner/Admin, paid
  projects excluded, a single account may hold both a Free and a Pro organisation, paused projects
  are neither billed nor counted: https://supabase.com/docs/guides/platform/billing-faq
- Supabase branching — persistent branches are supported and recommended for staging; branches start
  with **no production data**; seeded from migrations plus `seed.sql`:
  https://supabase.com/docs/guides/deployment/branching
- Vercel pricing — builds at **$0.0035 per CPU-minute**, rounded up to the minute and multiplied by
  machine cores; "Builds on Standard build machines are only billed when on-demand concurrency is
  enabled or Elastic build machines are selected": https://vercel.com/docs/pricing
- Vercel build machines and concurrency — Standard 4 vCPU / Enhanced 8 / Turbo 30 / Elastic 4–30;
  Elastic is the default for new paid teams; Pro allows up to 500 concurrent builds with on-demand
  concurrency, or 3 without: https://vercel.com/docs/builds/managing-builds
- Supabase organisation `AFA55` — Pro plan, second-project cost **$10/month**, branch cost
  **$0.01344/hour**: retrieved live from the Supabase management API for this organisation.
- Production database facts (321 applied migrations, earliest `20260126045207`, 177 tables, 19 views,
  116 functions, 517 RLS policies, 41 MB, per-table row counts): queried directly against
  `klatddoyncxidgqtcjnu`.
- Deployment history (20 deployments Aug 15–16, all `target: production`): retrieved live from the
  Vercel API for project `prj_vubQAdrHfAlSq9msk0sfedlBq5zJ`.
- Outage root cause (`idle_in_transaction_session_timeout = 0` against `max_connections = 60`, ~3.5
  hours, no data loss): commit `20260816_reap_idle_in_transaction_sessions`.

**Explicitly estimated, not verified:** all setup-hour figures; the per-build dollar cost under
Vercel's current model (I can read your deployments but not your invoice); and whether
`thebticaroasspmbhisx` is currently generating a charge. Items 1 and 2 in §6a exist to close the last
two gaps, and both take fifteen minutes.
