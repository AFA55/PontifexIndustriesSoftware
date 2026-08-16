# Parent Org & Hub Access — how Andres reaches Pontifex, and how Pontifex reaches Patriot

> **Status: DECISION DOCUMENT — research and design only. No code written, no migration applied, nothing pushed.**
> Date: 2026-08-16.
> Reconciles with `docs/plans/IDENTITY_AND_TENANT_ROUTING_PLAN.md` (Jun 8, 2026 — designed, **never built**; see §8).
> Part 1 is written to be read and approved by a non-technical reader. Part 2 (§9 onward) is the engineering detail.
>
> **Measurement caveat, stated up front:** the Supabase database was unreachable from this session all afternoon
> (every `execute_sql` call timed out — consistent with the Supabase Auth incident already documented in
> `lib/api-auth.ts:78-128` for today, Aug 16, 16:50–16:52 UTC). **Every number below marked (code) was counted
> from the source tree today and is solid. Numbers marked (carried) come from a prior verified session or from a
> migration file's own recorded verification and should be re-confirmed against the live database before anyone
> acts on them.**

---

# PART 1 — THE DECISION

## 1. The three things that matter, in your terms

**First: you are not confused — you genuinely have two jobs, and the software should say so.**
You are an employee of Patriot *and* the owner of the company that sells Patriot its software. Those are two
different people in the eyes of every records system, every insurer and every future customer's IT department.
When you look at a Patriot timecard as Patriot's operations manager, that is Patriot business and nobody needs
to be told. When you look at that same timecard as Pontifex-the-software-vendor, that is a vendor touching a
customer's payroll record, and that is a different act with different rules. **The two logins you already have
are not a workaround for a limitation. They are the correct model, and it is what Amazon, Shopify and Microsoft
all landed on.** What is wrong today is not that you have two accounts — it is that switching between them is
clumsy, and that the vendor-side access is neither bounded nor recorded.

**Second: the hub does not need to be able to read Patriot's jobs in order to manage Patriot.**
Managing a customer company means: create it, set its branding, see how many users and jobs it has, watch its
error rate, handle its billing, run its backup. Every one of those is *about* Patriot without being *inside*
Patriot. GitHub built its entire enterprise product on exactly this line — "Enterprise owners do not have access
to organization settings or content by default" ([GitHub docs](https://docs.github.com/en/enterprise-cloud@latest/admin/managing-accounts-and-repositories/managing-users-in-your-enterprise/roles-in-an-enterprise)).
So your two statements — "I need a hub to manage the other companies" and "everything Patriot stays Patriot,
even from the parent" — are only in conflict if you assume the hub must see job data. It must not, and it
mostly already doesn't.

**Third: none of this is enforceable today, and that is the actual emergency.**
Whatever identity model you approve, the tenant boundary in this codebase is enforced by hand, one route file at
a time. Counted today: **431 API route files, of which 413 use the admin database key that skips the database's
own safety net, and only 34 (about 8%) go through the one function that scopes a query correctly** (code).
Across those routes there are **263 places** where the tenant filter is applied conditionally rather than always
(code). The worst of them is not about you or super-admins at all — see §4.1. Fixing the identity model without
fixing that is buying a better lock for a door that is not attached to the wall.

---

## 2. What you actually asked for, restated

| You said | What it means technically | Answer |
|---|---|---|
| "I login to Patriot with my email, and I'm owner of Pontifex so I login to Pontifex with the same email" | One email currently maps to exactly one company | True today, and it is the reason your Pontifex account gets "not found" on every Patriot job |
| "If it makes it easier we can just have a different way that I access the companies hub" | You are open to the hub being a separate door | **Yes — take this.** It is the safest option and the industry norm |
| "If it doesn't need to be a company code, let's not make it a company code" | Don't make me type PONTIFEX | Agreed, and easy — the code is only a lookup, not a security control |
| "Pontifex is the company that controls the other companies within it" | Parent/child org relationship | Correct as a *commercial* relationship. Deliberately **not** as a data relationship |
| "Patriot data should remain within Patriot… including from the parent org" | Vendor access must be bounded | This is the constraint that decides everything else |

---

## 3. How real platforms do this

Seven vendors, checked against their own documentation today. The pattern splits cleanly by **who owns the
customer org** — and that split is the whole answer.

### 3a. Users inside a product: one identity, many memberships

Nobody makes an ordinary multi-org user hold two accounts.

- **WorkOS** — a user "is uniquely identified by their email address" and joins organisations through
  Organization Memberships; switching org is a token exchange that stamps a new `org_id`
  ([WorkOS](https://workos.com/docs/authkit/users-organizations), [switching APIs](https://workos.com/changelog/organization-switching-apis)).
- **Auth0 Organizations** — "any user may belong to multiple organizations and should be able to use the same
  identity to navigate between organizations"; an org picker appears after login, capped at the first 20 orgs
  ([Auth0](https://auth0.com/docs/manage-users/organizations/organizations-overview), [login flows](https://auth0.com/docs/manage-users/organizations/login-flows-for-organizations)).
  Costs from **$150/mo** (Essentials) on the B2B tier ([pricing](https://auth0.com/pricing)).
- **Vercel / GitHub** — one login, a team/org switcher, no second account.
- **Stripe Organizations** — added specifically to give "a centralized view… of all of your business lines or
  subsidiaries" with org-level roles ([Stripe](https://docs.stripe.com/get-started/account/orgs)).

### 3b. A vendor or agency reaching into a customer: an explicit, consented, revocable grant

This is your actual situation, and here the pattern is completely different.

- **Shopify collaborator accounts** — the closest analogue in existence. The *merchant* generates a **4-digit
  code** and shares it; the partner "must enter this code when they submit a collaborator request"; the merchant
  gets an email and an in-product notification and must click **Accept request**; the merchant chooses which
  areas the partner can touch ("Grant only the permissions that the partner needs for their work") and can remove
  the collaborator at any time. Collaborators "don't count towards your store's user limit"
  ([Shopify Help Center](https://help.shopify.com/en/manual/your-account/staff-accounts/collaborator-accounts)).
- **GitHub Enterprise** — "Enterprise owners do not have access to organization settings or content by default,
  but they can gain access by joining any organization"
  ([GitHub](https://docs.github.com/en/enterprise-cloud@latest/admin/managing-accounts-and-repositories/managing-users-in-your-enterprise/roles-in-an-enterprise)).
  The join is self-service, so this is the *weak-consent* end of the spectrum — but note that even here, crossing
  the line is a **named, discrete act**, not ambient superuser vision.
- **Stripe Connect** — visibility is fixed at account-creation and is irreversible ("After you create a connected
  account, you can't change its type"). For Standard accounts the platform is permanently walled out of the
  merchant's identity data: "After you create an account link on a Standard account, you won't be able to read or
  write Know Your Customer (KYC) information" ([Stripe](https://docs.stripe.com/connect/accounts), [Standard accounts](https://docs.stripe.com/connect/standard-accounts)).
  Access is a per-request header (`Stripe-Account: acct_…`), not a session switch
  ([authentication](https://docs.stripe.com/connect/authentication)).
- **Slack Enterprise Grid** — the org admin plane can manage the container but not read the contents:
  "Messages and files from private channels are not viewable with channel management tools"
  ([Slack](https://slack.com/help/articles/360047512554-Use-channel-management-tools)). Reading content requires a
  separately-gated compliance API.

### 3c. When a vendor held *standing* access, the industry has taken it away

This is the strongest evidence, because it is a case where the permissive model existed at enormous scale and
was **deliberately dismantled**.

- **Microsoft — DAP replaced by GDAP.** Microsoft partners used to hold standing Global Admin rights across all
  their customers' tenants. That is gone. GDAP "provides partners with least-privileged access following the Zero
  Trust cybersecurity protocol. It lets partners configure **granular and time-bound access** to their customers'
  workloads," and — the sentence that matters most for you — **"Customers must explicitly grant the
  least-privileged access to their partners."** Microsoft is explicit that "partners no longer have access to all
  customer tenants… by default" and "no longer receive the Global Admin role on their customer's tenant"
  ([Microsoft Learn, updated 2026-05-27](https://learn.microsoft.com/en-us/partner-center/customers/gdap-introduction)).
  Microsoft's stated reason is customers "who might be uncomfortable with the current levels of partner access"
  and those "with regulatory needs that require least-privileged access to partners." That is your Aug 16
  constraint, written by Microsoft.

- **AWS Organizations — the parent holds no standing credentials in the child.** To reach a member account "you
  must have the following permission: **`sts:AssumeRole`**". Access runs through a role
  (`OrganizationAccountAccessRole`) that lives *in the member account*, and for an account that was **invited**
  rather than created by the parent, the member has to create that role before the parent can get in at all
  ([AWS docs](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_access.html)).
  Newly created member accounts "have no root user credentials by default." The management account's power is
  the *ability to assume*, not ambient sight — and every assumption plus everything done afterwards lands in
  CloudTrail.

- **Salesforce — the user grants access, with an expiry, and every keystroke is attributable.** "You can grant a
  Salesforce administrator or a support representative login access to your account when you need help resolving
  a problem," with an **Access Duration** picklist setting the expiry. "All actions performed by the support agent
  while logged in as your user are recorded in the Setup Audit Trail and Login History," and support "never sees
  or receives your credentials"
  ([Salesforce Help](https://help.salesforce.com/s/articleView?language=en_US&id=xcloud.granting_login_access.htm&type=5)).
  Note the ordering: the *customer* initiates, the access *expires*, and the log names the agent.

Three different companies, three different decades of scale, one shape: **no standing access; a bounded,
attributable act instead.**

### 3d. The rule these encode

> Model the operator as **one identity that can carry a membership into a customer org** — same join table,
> different row. Do **not** model the operator as a flag that reads across every tenant ambiently. Make the
> crossing an explicit, scoped, revocable, logged act, and pick the consent strength based on whether the
> operator and the customer share an owner.

You and Patriot **do not share an owner**. Pontifex is the vendor. So you are in the Shopify column, not the
Stripe-Organizations column — even though today you happen to also be a Patriot employee.

---

## 4. What is true in your system today (measured)

### 4.1 The bug that is bigger than the question you asked

`lib/get-tenant-id.ts` is nine lines long:

```ts
export async function getTenantId(userId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('profiles').select('tenant_id').eq('id', userId).single();
    return data?.tenant_id || null;
  } catch {
    return null;      // <-- a database hiccup is indistinguishable from "no company"
  }
}
```

That `null` is then consumed by **178 places** written as `if (tenantId) query = query.eq('tenant_id', tenantId)`
(code). When the value is null, **the filter is not applied at all** — the query runs across every company. Some
of those are writes: deleting a job, updating a timecard, rewriting role permissions.

In plain terms: **if the database has a bad moment while someone is loading a page, that page can silently return
or modify every company's data instead of their own.** This has nothing to do with super-admins; it applies to
every role.

This is not theoretical today. `lib/api-auth.ts:78-128` documents a real Supabase outage this morning
(196 failed auth calls in twenty minutes), and I could not reach the database from this session at all.

**This one function is the highest-value fix on the entire list, and it is roughly a one-hour change.**

### 4.2 Why your Pontifex account gets "not found" on Patriot jobs

`app/api/job-orders/[id]/route.ts:29-33`:

```ts
// Only apply tenant filter if tenantId is set (super_admin may have none)
if (auth.tenantId) query = query.eq('tenant_id', auth.tenantId);
const { data, error } = await query.single();
if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
```

Your Pontifex account *does* have a tenant (PONTIFEX), so the filter *is* applied, and a Patriot job is correctly
invisible. **The system is doing the right thing.** The 404 is the tenant boundary working.

Note what the tempting "fix" would be — clearing the tenant on your Pontifex profile so the filter is skipped.
**Do not ever do that.** Line 175 of the same file is `if (tenantId) deleteQuery = deleteQuery.eq('tenant_id', tenantId)`,
so an account with no tenant can delete any company's jobs. Turning off the filter is not access, it is the
removal of the boundary.

### 4.3 The scope of the hand-rolled checks

You asked about ~18. The real count is **263 sites across roughly 150 files** (code):

| Class | Sites | What it does |
|---|---|---|
| Null-bypass `if (tenantId) …` | **178** | Filter silently skipped when tenant is null (§4.1) |
| `role !== 'super_admin'` skips the filter | **47** | *Any* super-admin, including one scoped to Patriot, reads/writes every company |
| Ternary form of the null-bypass | **9** | Same as above, different syntax — invisible to the obvious search |
| Hand-rolled `?tenantId=` override | **9** | Accepts a company id from the URL or POST body without checking the caller is the platform owner |
| `requireSuperAdmin` routes | **20** | This guard checks the *role* but never checks the person belongs to Pontifex |

Among the 47: deleting any company's timecards, marking any company's invoice paid, approving any company's
time-off, and reading or modifying any company's user profiles including pay rate and role.

Among the 20 `requireSuperAdmin` routes, eleven have no company filter at all — including one that mints a new
super-admin and one that runs raw database schema changes.

**The important nuance:** these are only exploitable by someone who already holds a `super_admin` role. Today
that is you. But the moment a customer gets their own super-admin — which is the whole point of selling this
software — every one of these becomes a live cross-customer leak. This is why the identity decision and the
route cleanup have to be sequenced together.

### 4.4 Where the boundary actually lives

- **431** API route files; **413** use the admin database key, which bypasses the database's own row-level
  security (code).
- Only **8** places in the whole front-end query the database directly (code). Everything else goes through those
  routes.
- **Conclusion: row-level security is a backstop here, not the enforcement.** The enforcement is 431 hand-written
  files. That is worth knowing before anyone proposes a fix that only changes database policies.

The backstop itself is a single restrictive policy applied to every table with a company column
(`supabase/migrations/20260723d_f3_tenant_isolation_restrictive.sql`), recorded in that file as covering
141 tables (carried — could not re-verify today):

```sql
USING (tenant_id IS NULL
       OR tenant_id = (SELECT public.current_user_tenant_id())
       OR (SELECT public.current_user_role()) = 'super_admin')
```

Two holes in it, both deliberate at the time and both now load-bearing:
`tenant_id IS NULL` lets orphan rows through, and `= 'super_admin'` lets **any** super-admin through, not just
Pontifex's.

### 4.5 The audit trail you would need — half of it already exists

`audit_logs` exists, has a `tenant_id` column, and has a helper (`lib/audit.ts`). But:

- The helper **never writes `tenant_id`** — look at the insert, the column simply isn't there. So audit rows
  written through it cannot be attributed to a company (code).
- It is **fire-and-forget**: `Promise.resolve(...).catch(...)`, errors go to the console. An access record that
  can be silently dropped is not an access record.
- About 30 routes bypass the helper and insert directly with inconsistent columns (code).

For an access log that has to answer "did Pontifex look at our payroll," fire-and-forget is a defect, not a
style choice.

### 4.6 The login door today

- `app/api/auth/login/route.ts:113-121` enforces the company boundary **only if the browser chooses to send
  `expected_tenant_id`**. If it is absent the check short-circuits and login proceeds.
- `app/shop-login/page.tsx:20-25` posts `{ email, password }` only — **it never sends it**. That door has no
  company boundary at all (code).
- `middleware.ts` does rate limiting and security headers and nothing else. There is **no host or subdomain
  handling anywhere** (code), and its own comment explains why nothing can be enforced there: Supabase stores the
  session in `localStorage`, not cookies, so the server cannot see who you are on a page request.
- The Platform Hub gate (`app/dashboard/platform/layout.tsx:37`) is a client-side check reading
  `localStorage['supabase-user']` — **editable in browser devtools**. The real boundary is the 10 routes using
  `requirePlatformOwner`; but the Hub also calls `requireSuperAdmin` routes, which any super-admin passes.

---

## 5. The identity question — three shapes, honestly compared

| | **(a) One email = one company** (today) | **(b) One identity, many memberships** | **(c) Separate platform identity + explicit, time-boxed access** |
|---|---|---|---|
| **What you do day to day** | Sign out, sign in as the other hat | One login, pick the company from a switcher | One login for Pontifex. To enter Patriot you click "Open Patriot", give a reason, and it expires |
| **Build time** *(estimate)* | 0 — it exists | **3–5 days** + the route cleanup | **2–3 days** + the route cleanup |
| **$ / month** | $0 | $0 | $0 |
| **Ongoing effort** | Re-typing a password | Low | Low; you review an access log occasionally |
| **Reversible?** | n/a | **Mostly.** The membership table already exists and is unused. The risky, hard-to-reverse part is anything that changes what the database thinks your company is | **Yes.** Purely additive: a grants table + one guard change. Delete it and you are back to today |
| **Meets "Patriot stays Patriot, even from the parent"** | Yes, accidentally | **No** — a standing seat in Patriot is exactly what the constraint forbids | **Yes, by construction** |
| **What a customer's IT questionnaire would say** | "Fine, but how do you support us?" | "Your vendor has a permanent account in our system. Show us the controls." | "Time-bound, logged, least-privilege — this is what we expect" |
| **Hidden constraint** | The 404 you already hit; and it gets worse as you add customers you are *not* an employee of | `current_user_tenant_id()` reads one column on your profile row; that column is the anchor of the whole database backstop (§6) | Requires the audit write to be **reliable**, i.e. awaited — which today's logger is not (§4.5) |
| **What it makes harder** | Nothing new | Every future "which company am I in?" bug becomes a data-exposure bug rather than a display bug | You cannot idly browse a customer's data; every look is a deliberate act. That is the point, and it will occasionally annoy you |

### 5.1 What each does to the database backstop

Current policy on every company-scoped table:

```sql
(tenant_id IS NULL) OR (tenant_id = current_user_tenant_id()) OR (current_user_role() = 'super_admin')
```

- **(a)** — unchanged. Still has both holes (`IS NULL`, and any super-admin).
- **(b)** — this is the expensive part, and it is where the June plan flinched (§8). `current_user_tenant_id()`
  is literally `SELECT tenant_id FROM public.profiles WHERE id = auth.uid()`. To make the backstop follow an
  *active* company you must either (i) change that function to read an "active company" from somewhere the
  database can see, or (ii) leave the backstop pinned to the home company and accept that it no longer matches
  what the application is doing. Option (i) is done properly with a **Supabase custom access token hook** writing
  an `active_tenant_id` into `app_metadata` — server-writable only, which CLAUDE.md already blesses, unlike
  `user_metadata`. The hook "runs before a token is issued and allows you to add additional claims"
  ([Supabase docs](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)). That is a real,
  supported mechanism — but it changes the behaviour of every policy in the database at once, which is exactly
  the kind of change a one-person team should not make to a live payroll system in the same week as a launch.
- **(c)** — the backstop can get **stricter**, not looser, and that is the tell that it is the right shape.
  The `= 'super_admin'` clause should become "is the platform owner **and** holds a live grant for this company":

  ```sql
  (tenant_id = current_user_tenant_id())
  OR public.has_active_tenant_grant(tenant_id)
  ```

  with `tenant_id IS NULL` dropped once the orphan rows are cleaned up (migration `20260816_tenant_id_not_null_on_business_tables.sql`
  already did this for the eight tables that carry the money and the hours). Each of those is a separate, small,
  reversible migration.

### 5.2 Blast radius of (b), specifically

If you pick (b), here is what actually has to change:

1. `tenant_users` already exists and already has rows (24, all pointing at Patriot, 22 of them orphaned — carried,
   from the June plan's verification). It is written by tenant onboarding and **read by nothing for authorization**
   (code: zero references to any membership check in `lib/` or `app/api/`). So the table is free; the trust in it
   is not.
2. `resolveTenantScope` becomes the switcher's enforcement point — but only **34 of 431 routes call it**. The other
   397 would silently keep using `auth.tenantId`, i.e. your home company, and the switcher would appear to do
   nothing on most pages. **This is the real cost of (b): it is not a 3-day feature, it is a 3-day feature plus a
   route-by-route migration.**
3. The database backstop either diverges from the application or gets the token-hook surgery above.

None of that is fatal. It is simply much more work than it looks, and the work is spread over 400 files rather
than concentrated in one.

---

## 6. The tension you have not noticed — named and resolved

You have asked for two things that pull against each other:

> "I still need access to a hub to be able to manage the other companies."
> "Patriot data should remain within Patriot… everything that is Patriot should remain as Patriot."

These are compatible **only if parent access is explicit, bounded and visible**. If Pontifex holds a permanent,
silent seat inside Patriot, the second sentence is false — and it will be false in a way you cannot prove
otherwise when a general contractor's compliance officer asks. If Pontifex holds *no* ability to enter Patriot at
all, you cannot support your own customer.

**The resolution, and it is the honest version of what you already want:**

1. **Managing a company ≠ being inside it.** Create/configure/bill/monitor/back up Patriot from the Hub without
   ever reading a job, a timecard or a customer name. Most of the Hub already works this way.
2. **Entering a company is a separate, deliberate act** — you click "Open Patriot", it lasts a set time, and it
   is written down. You act **as yourself**, visibly, not as Zack.
3. **You keep your Patriot employee account.** This is not a workaround — you really are Patriot's operations
   manager, and that work is Patriot business, not vendor access. Using the Patriot account for Patriot work is
   what keeps the vendor access log meaningful: it stays short and every entry means something.

### What does Patriot see?

My recommendation, in increasing strength — pick the level you are comfortable defending:

| Level | What Patriot gets | Build cost *(estimate)* | Recommended |
|---|---|---|---|
| 0 | Nothing. Access logged internally only | included | No — this is what you have, and it is unprovable |
| **1** | **A page in Patriot's own admin: "Support access history" — who, when, why, how long** | **+0.5 day** | **Yes — do this** |
| 2 | Level 1 + an email to Patriot's admin each time a grant opens | +0.5 day | Yes, once you have a customer who is not you |
| 3 | Patriot must *approve* the grant before it opens (the Shopify model) | +1–2 days | Not yet — you are Patriot's ops manager, you would be approving your own requests. **Trigger: your first customer where you are not an employee.** |

Level 1 costs almost nothing and converts "trust me" into "look for yourself." It is also the single best sales
asset you will have when the next customer's IT person asks what stops you reading their bids.

### What a security questionnaire expects

You will start seeing these the first time a general contractor or a larger customer's IT department reviews you.
The questions in this area are always the same four, and they are the four this design answers:

1. **Can vendor personnel access customer data?** — Yes, in bounded circumstances. (Answering "no" is a lie for
   any SaaS that supports its customers, and reviewers know it.)
2. **Under what circumstances, and who authorises it?** — Support and incident response only; the reason is
   recorded on every grant.
3. **Is it least-privilege and time-bound?** — Read-only by default, per-company, expires in 8 hours.
4. **Is it logged, and can the customer see the log?** — Yes, and the customer can read it themselves.

SOC 2's Common Criteria CC6 (Logical and Physical Access Controls) is where an auditor would look. The commonly
stated expectation is that contractors and vendors who can reach protected assets are treated the same as
employees for provisioning, MFA and periodic access review, that access is granted on **least privilege**, and
that privileged access is **time-boxed, reviewed and evidenced with a dated artefact**. *(These summaries come
from secondary compliance references — [compliancebase](https://www.compliancebase.org/controls/soc-2/cc6-1),
[Hicomply](https://www.hicomply.com/hub/soc-2-controls-cc6-logical-and-physical-access-controls) — not from the
AICPA's own Trust Services Criteria, which I did not fetch. Treat the shape as reliable and the wording as
approximate.)*

**You are not being asked to get SOC 2 certified.** You are being asked to build the thing now, cheaply, that
makes the certification a paperwork exercise later instead of a re-architecture. The grants table plus a
customer-visible access page is roughly a day of work and covers all four questions.

---

## 7. The hub entrance — you don't want a company code, so what instead?

The company code is **not a security control**. It resolves a code to a company id for branding, via a
`SECURITY DEFINER` function returning only id/name/code. Removing it for Pontifex removes nothing but typing.

| Option | What you do | Build *(estimate)* | Risk | Notes |
|---|---|---|---|---|
| **A. A distinct route — `/platform` or `/pontifex`** that skips the code and goes straight to the Pontifex-branded sign-in | Bookmark it. Type email + password | **1–2 hours** | **Lowest** | No new auth, no new model, no DNS, no cost. `PLATFORM_TENANT_ID` is already a constant in the client bundle (`lib/rbac.ts:363`), so the page can hard-wire the branding |
| B. A "Pontifex staff sign-in" link on the existing company-code page | One extra click from where you already are | ~1 hour | Lowest | Even smaller than A; slightly less bookmarkable |
| **C. Separate hostname — `admin.pontifexindustries.com`** | Bookmark a different domain | **half a day** + DNS | Low–medium | **Genuinely useful property:** sessions live in `localStorage`, which is per-origin, so a separate hostname means the Pontifex session and the Patriot session **cannot see each other at all** — two hats in two browser tabs, permanently isolated, with zero code. Costs: `vercel.json` has **no rewrites** today and `middleware.ts` has **no host handling** (code), so this is greenfield; HSTS is already `includeSubDomains` so it must be HTTPS (it will be); and it is one more thing to renew and remember |
| D. Org switcher after login | One login, dropdown | 3–5 days | **Medium–high** | This is option (b) from §5 and inherits its whole blast radius. It also *removes* the isolation property in C |
| E. Separate identity provider for staff (Google Workspace SSO) | Sign in with Google | 1–2 weeks + **$150+/mo** if via Auth0 | Medium | Right answer eventually; absurd for a two-person platform org today |
| F. Magic-link elevation ("email me a link to the hub") | Click a link in email | 1 day | Medium | Adds an email dependency to your own admin access. If Resend has a bad day you cannot get into your own hub |

**Recommendation: A now, C later.** A is an afternoon and reversible. C becomes worth it the moment you have a
second person doing Pontifex work, because the origin isolation stops the two hats from ever bleeding — and that
is a real defect class here, given the platform gate is client-side.

**Do not do D as the entrance.** An org switcher is the thing that makes "Patriot stays Patriot" hard to say
truthfully, and it is the most expensive option on the list.

---

## 8. Reconciling with the plan you already have

`docs/plans/IDENTITY_AND_TENANT_ROUTING_PLAN.md` (Jun 8) designed option (b) in detail: membership table,
`active_tenant` http-only cookie, cookie-aware `resolveTenantScope`, database backstop left pinned to the home
company. **It was never implemented** — verified today: zero references to `user_has_tenant_membership`, zero to
an `active_tenant` cookie, zero to `tenants.is_platform` anywhere outside the document (code).

It was good work and its central finding still stands (§3.3 of that document: a cookie cannot retarget the
database backstop). Two things have changed since:

1. **You added a constraint on Aug 16 that did not exist in June** — Patriot's data stays Patriot's *including
   from the parent*. The June design gives Pontifex a standing seat in Patriot. It does not meet the new bar.
2. **The route inventory is now known.** June assumed `resolveTenantScope` was the chokepoint. It is called by
   34 of 431 routes. A cookie-based switcher would visibly work on 8% of the product.

**Recommendation: keep its Phase 0 schema work (the unique constraint on the membership table, the
`is_platform` flag, the membership lookup function) — all of it is reusable and additive — and replace its
Phases 2–4 with §9 below.** Nothing in that document needs to be deleted; it should be marked "superseded in part"
with a pointer here.

---

## 9. RECOMMENDATION

**Take option (c): a separate Pontifex identity, a hub that manages companies without reading them, and an
explicit, time-boxed, logged "Open this customer" action when you genuinely need to be inside one.** Keep your
Patriot employee account and use it for Patriot work.

Why, in one line each:

- It is the only shape that makes both of your requirements true at the same time.
- It is the cheapest of the three to build **and** the cheapest to reverse — a grants table and one guard change.
- It makes the database backstop *stricter*, which is the direction you want to be moving before customer #2.
- It is what the vendors who face this exact problem across an ownership boundary all do (§3b).
- It turns "trust me" into an artefact you can show a customer, which has commercial value beyond the security.

### The sequence, ordered by risk removed per hour spent

#### THIS WEEK — small, reversible, unblocks you (≈1.5–2 days total, estimate)

| # | Do | Why | Reversible |
|---|---|---|---|
| 1 | **Fix `lib/get-tenant-id.ts`** so a database error throws instead of returning `null`. Distinguish "this user has no company" from "the query failed" | Removes the 178-site silent-unscoping failure (§4.1). Highest value on the list, and today's Supabase wobble shows it is live | Yes — 9 lines |
| 2 | **Require `expected_tenant_id` server-side** in `/api/auth/login`, and make `shop-login` send it | Closes a login door that has no company boundary (§4.6) | Yes |
| 3 | **Add the `/platform` entrance** (§7 option A) | You stop typing a company code; you get a bookmark | Yes |
| 4 | **Make `logAuditEvent` write `tenant_id`, and add an awaited variant** for access events | Without this there is no trustworthy record of anything below (§4.5) | Yes |
| 5 | **Do not touch the 263 routes yet.** Write them into `BACKLOG.md` as a tracked burn-down | They need a systematic fix, not a scatter of edits before a launch | n/a |

*Deliberately not this week: any change to `profiles.tenant_id`, any change to a database policy, any switcher.*

#### NEXT — before customer #2 signs (≈4–6 days, estimate)

6. **Grants table + guard.** `tenant_access_grants (id, granted_to_user_id, tenant_id, reason, granted_at, expires_at, revoked_at)`. A new
   `requireTenantAccess()` that admits you either because it is your own company or because you hold a live grant.
   Default expiry: 8 hours. Every use writes an awaited audit row.
7. **Retire `requireSuperAdmin`.** Every one of its 20 call sites becomes either `requirePlatformOwner` (platform
   business) or `requireAdmin` + explicit scope (company business). This is the single highest-leverage code
   change in the audit (§4.3).
8. **Burn down the 263.** Batch by class, mechanically: the 178 null-bypasses first (they become unconditional
   once #1 lands), then the 47 role-skips, then the 9 URL overrides. Guardian-review each batch.
9. **"Support access history" page inside Patriot** (§6 level 1).
10. **Tighten the database backstop** — one migration per clause, `= 'super_admin'` → grant-aware, then drop
    `tenant_id IS NULL` table by table as orphans are cleared.

#### AT 3–5 CUSTOMERS

11. Customer-side **email notification** on grant open (§6 level 2).
12. Per-company roles — the `tenant_users.app_role` column the June plan reserved — only if a real person needs a
    different job title in two companies. **Trigger: the first person who does.**
13. Consider the `admin.` hostname (§7 option C) once a second person does Pontifex work.

#### AT ~20 CUSTOMERS

14. **Customer approval before a grant opens** (§6 level 3, the Shopify model).
15. Staff SSO for the Pontifex org.
16. Formalise the access log into an exportable report — this is what a SOC 2 readiness exercise will ask for.
17. Only *now* revisit a true org switcher, if multi-company staff turn out to be common. It will be far cheaper
    once steps 7–10 have made scope enforcement uniform.

---

## 10. What I recommend AGAINST, and what would change my mind

| Don't do | Why | Trigger that changes my mind |
|---|---|---|
| **Clear the tenant on your Pontifex profile to "see everything"** | It doesn't grant access, it removes the boundary — and it hands that account the ability to delete any company's jobs (§4.2). This is the most dangerous quick fix available and it looks like the obvious one | **Never.** |
| **An org switcher as the answer** | 3–5 days that visibly works on 8% of the product, plus it contradicts "Patriot stays Patriot" | Multiple *staff* (not you) routinely working across companies, **and** steps 7–10 complete |
| **Making the database backstop follow an "active company" claim** | Changes every policy in a live payroll database at once | Only after (b) is chosen deliberately and the route cleanup is done. Not during a launch |
| **Moving off Supabase/Postgres for "proper multi-tenancy"** | Nothing here is a database limitation. Every problem in this document is application code | Nothing at your scale. Genuinely nothing |
| **A separate database per customer** | Multiplies backup, migration and cost by the customer count, operated by one person | A customer contractually requires data residency or physical separation. Price it as a premium tier when it happens |
| **A third-party identity provider (Auth0/WorkOS) now** | $150–$1,300/mo for a problem you can solve with a table and a guard | ~20 customers, or the first customer who demands SAML SSO. Then WorkOS is the cheaper starting point (first 1M users free; $125/connection/mo for enterprise SSO) |
| **Per-company subdomains for customers** (`patriot.pontifexindustries.com`) | No rewrites and no host handling exist today (code); it is greenfield routing work for a branding benefit | A customer asks for it in writing, or you have enough customers that the URL is a sales asset |

---

# PART 2 — ENGINEERING NOTES

## 11. Proposed shape of the grant mechanism (design only)

```sql
create table if not exists public.tenant_access_grants (
  id                uuid primary key default gen_random_uuid(),
  granted_to        uuid not null references auth.users(id) on delete cascade,
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  reason            text not null,                    -- required; shown to the customer
  scope             text not null default 'read',     -- 'read' | 'write'
  granted_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  revoked_by        uuid references auth.users(id)
);
create index if not exists idx_tag_live on public.tenant_access_grants (granted_to, tenant_id, expires_at);
```

```sql
create or replace function public.has_active_tenant_grant(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_access_grants
    where granted_to = auth.uid() and tenant_id = p_tenant
      and revoked_at is null and expires_at > now()
  )
$$;
```

Application guard, replacing the `role !== 'super_admin'` idiom:

```ts
// Admits: your own company, OR the platform owner holding a live grant.
// Never admits a bare role check.
export async function requireTenantAccess(
  request: NextRequest, auth: AuthSuccess, tenantId: string
): Promise<{ ok: true; via: 'own' | 'grant' } | { response: NextResponse }>
```

Non-negotiables for whoever builds it:
- The audit write is **awaited**, not fire-and-forget, and its failure fails the request. An access record that
  can be dropped is not a record (§4.5).
- The grant is **per company**, never global. There is no "grant all".
- Writes under a grant should be visually marked in the UI (a persistent banner) and tagged in the row's history,
  so Patriot can tell "the vendor changed this" from "our ops manager changed this".
- `reason` is required and free-text. It is what the customer reads.

## 12. Files that will be touched

| Concern | File |
|---|---|
| The fail-open tenant lookup | `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/lib/get-tenant-id.ts` |
| Guards, scope resolution, `requireSuperAdmin` retirement | `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/lib/api-auth.ts` |
| Platform tenant constant (hardcoded UUID, ships in the client bundle) | `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/lib/rbac.ts:363` |
| Audit helper — add `tenant_id`, add an awaited variant | `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/lib/audit.ts` |
| Login boundary | `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/app/api/auth/login/route.ts:113` |
| Login door with no boundary | `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/app/shop-login/page.tsx:20` |
| Hub gate (client-side only) | `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/app/dashboard/platform/layout.tsx:37` |
| Landing forks | `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/app/login/page.tsx:380` · `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/app/dashboard/page.tsx:130` |
| The 404 the founder hit | `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/app/api/job-orders/[id]/route.ts:29` (read) · `:175` (delete) |
| Database backstop | `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/supabase/migrations/20260723d_f3_tenant_isolation_restrictive.sql` |
| Superseded-in-part prior design | `/Users/afa55/Documents/Pontifex Industres/pontifex-platform/docs/plans/IDENTITY_AND_TENANT_ROUTING_PLAN.md` |

## 13. Deployment note

`vercel.json` disables branch deploys twice over — `"ignoreCommand": "[ \"$VERCEL_GIT_COMMIT_REF\" != \"main\" ]"`
plus a `git.deploymentEnabled` denylist. **There are no preview URLs.** CLAUDE.md's "feature branches get free
preview URLs" is stale. Everything in this plan must be verified on `localhost:3000` against the production
database, and shipped in **one** batched push. Budget accordingly (~$1–2 per push).

## 14. Sources

**Vendor access across an ownership boundary (the pattern this document recommends)**
- Microsoft, Granular Delegated Admin Privileges — https://learn.microsoft.com/en-us/partner-center/customers/gdap-introduction
- AWS Organizations, accessing member accounts — https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts_access.html
- Salesforce, Grant Login Access — https://help.salesforce.com/s/articleView?language=en_US&id=xcloud.granting_login_access.htm&type=5
- Shopify, collaborator accounts — https://help.shopify.com/en/manual/your-account/staff-accounts/collaborator-accounts
- Shopify Partners, requesting store access — https://help.shopify.com/en/partners/dashboard/managing-stores/request-access
- Stripe, connected account types — https://docs.stripe.com/connect/accounts
- Stripe, Standard accounts (platform locked out of KYC) — https://docs.stripe.com/connect/standard-accounts
- Stripe Connect, authentication (`Stripe-Account` header) — https://docs.stripe.com/connect/authentication

**Parent/child and multi-org identity**
- GitHub, roles in an enterprise ("no access… by default") — https://docs.github.com/en/enterprise-cloud@latest/admin/managing-accounts-and-repositories/managing-users-in-your-enterprise/roles-in-an-enterprise
- GitHub, managing your role in an org owned by your enterprise — https://docs.github.com/admin/user-management/managing-organizations-in-your-enterprise/managing-your-role-in-an-organization-owned-by-your-enterprise
- GitHub, Enterprise Managed Users — https://docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/understanding-iam-for-enterprises/about-enterprise-managed-users
- Auth0, Organizations overview — https://auth0.com/docs/manage-users/organizations/organizations-overview
- Auth0, login flows for Organizations (org picker, 20-org cap) — https://auth0.com/docs/manage-users/organizations/login-flows-for-organizations
- Auth0, pricing — https://auth0.com/pricing
- Okta, multi-tenant solutions (four configurations) — https://developer.okta.com/docs/concepts/multi-tenancy/
- WorkOS, users and organizations — https://workos.com/docs/authkit/users-organizations
- WorkOS, organization switching APIs — https://workos.com/changelog/organization-switching-apis
- WorkOS, pricing — https://workos.com/pricing
- Vercel, access roles — https://vercel.com/docs/rbac/access-roles
- Stripe Organizations — https://docs.stripe.com/get-started/account/orgs
- Slack, types of roles — https://slack.com/help/articles/360018112273-Types-of-roles-in-Slack
- Slack, channel management tools (private content not viewable) — https://slack.com/help/articles/360047512554-Use-channel-management-tools

**Mechanism**
- Supabase, custom access token hook — https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook

**Compliance (secondary sources — see the caveat in §6)**
- SOC 2 CC6.1, logical and physical access controls — https://www.compliancebase.org/controls/soc-2/cc6-1
- SOC 2 CC6 overview — https://www.hicomply.com/hub/soc-2-controls-cc6-logical-and-physical-access-controls

---

## 15. Open items — could not verify today

- Live counts of `tenant_isolation` policies, tenants, profiles, super-admins by tenant, and `tenant_users` rows.
  The database was unreachable all session. **Re-run before acting on §5.2 or §9 step 10.**
- Whether GitHub records an enterprise owner's self-join in the organisation's audit log (not stated in the docs
  fetched).
- Slack's Discovery API scope from Slack's own documentation (`api.slack.com/admins/discovery` returned HTTP 403).
- Current Stripe Connect per-account fees for Express/Custom accounts.
