# Change orders — what exists, what doesn't, and what to build

**Status:** parked deliberately. The founder (Aug 17): *"there are higher priority
things to focus on, just wanted to get the ball rolling and create a file for
that to work on implementing later — right now still have lots to do with what
we currently have."*

This file exists so that work starts from facts instead of a fresh survey.
Everything below was verified against production (`klatddoyncxidgqtcjnu`) and the
repo on Aug 17 2026.

---

## Correcting the first read

I initially told the founder change orders were "already built — table, API and a
UI component." That was too generous. The accurate position:

| Piece | State |
|---|---|
| `change_orders` table (migration `20260423_change_orders.sql`) | **Exists** |
| `GET`/`POST /api/admin/jobs/[id]/change-orders` | **Exists, and agrees with the table** |
| `components/jobs/ChangeOrdersSection.tsx` | **Exists, speaks a DIFFERENT shape, imported by nothing** |
| Rows ever written | **0** |

So it is not a working feature with gaps. It is a coherent back end, a UI that
was never connected and could not work if it were, and a feature that has never
been used once.

### The shapes do not match

The table and the API both speak:

```
co_number · description · work_type · unit · target_quantity
cost_amount · price_amount · status · notes
customer_signature · customer_signed_at
created_by · approved_by/approved_at · rejected_by/rejected_at/rejection_reason
```

`ChangeOrdersSection.tsx` speaks:

```
version · scope_description · additional_work_items[] · additional_cost
additional_hours · requested_by_name
```

Not one field name in common beyond `id`, `job_order_id` and `status`. Wiring
that component to the live API would fail immediately. **Decide which shape is
right before writing any UI** — the table's is richer (it carries cost AND price
separately, plus customer signature) and it is the one the API already serves,
so the component is the piece to rewrite or delete.

---

## The one live bug — fix this independently, it is not a workflow decision

`app/dashboard/my-jobs/[id]/page.tsx:193` calls
`GET /api/admin/jobs/[id]/change-orders` on every mount of the **operator's own
job page**. That route is `requireAdmin`, so every operator gets a 403, and the
surrounding `catch {}` swallows it.

Result: "Recent change orders" has never rendered for the crew since April, and
nobody has ever seen an error. Those are the 403s in the production logs — **not**
office staff being blocked, which is what I first assumed.

It is a read-only GET. Splitting the guard (GET readable by the job's crew, POST
staying office-only) is a small fix that does not depend on any of the design
decisions below. **Do it first, separately.**

---

## What the founder asked for

Verbatim, Aug 16:

> *"When they click view job, have a button next to Original Scope that says Edit
> Original Scope, and a button that says Add Additional Scope. If they click Add
> Additional Scope, ask 'is this a change order?' — then it can separate the work
> that was change order / additional work. They go to fields similar to the
> schedule form, but we have to have a way where it asks for additional cost for
> that change order. When we print out the work performed ticket it can separate
> and show original scope of work and change order scope, and then what the
> operator did next to that, just like the regular ticket. This is a new
> integration but required, so project managers can identify what was original
> work and what was change order work, and we can track it and not forget to
> charge, and see what we quoted for change order work."*

And separately:

> *"Make it easier — the edit button we have should allow editing scope, so we
> don't have two ways to edit the ticket but one clean way instead."*

### Translated into work

1. **Two buttons beside Original Scope** on the job view: `Edit Original Scope`
   and `Add Additional Scope`.
2. **"Is this a change order?"** on the Add path. A *no* means extra scope on the
   original job; a *yes* creates a `change_orders` row. That distinction is the
   entire point — it is what lets a PM tell quoted work from billable extra work.
3. **Scope fields like the schedule form** for the added work, plus a **required
   cost**. The table already has `cost_amount` and `price_amount` — decide
   whether the office enters both (what it costs us / what we charge) or just the
   price.
4. **The printed work-performed ticket separates them**: original scope, then
   each change order, with what the operator actually did against each.
   `lib/job-ticket-format.ts` already owns ticket formatting and is shared by the
   HTML print page, the react-pdf ticket and the crew's digital ticket — extend
   it there so all three stay consistent, do not format change orders separately
   per surface.
5. **One edit path.** Today the job view has an Edit button and the schedule form
   has its own edit mode. The founder wants one.

---

## Decisions still open

These are the ones that change the schema or the workflow, so answer before
building:

- **Cost model.** The table has both `cost_amount` and `price_amount`. Does the
  office enter both, or only what the customer is charged?
- **Approval.** `status`, `approved_by/at`, `rejected_by/at/rejection_reason` all
  exist. Should a change order be usable immediately, or sit pending until a PM
  approves it? The columns imply approval was intended.
- **Customer signature.** `customer_signature` and `customer_signed_at` exist. Is
  a signature required before it is chargeable, or optional evidence?
- **Who creates one.** The API is `requireAdmin` today, which excludes the
  salesman/supervisor project managers who would actually raise one (see
  `lib/api-auth.ts` — `SALES_STAFF_ROLES` is the set that can already see a job).
  Should the crew be able to *flag* extra work from the field for the office to
  price?

---

## The rule that must hold

From the Aug 16/17 work, learned the hard way across six silent failures:

> A field may only be editable once the LOAD can re-populate it.
> **Sent-but-not-loaded is a WIPE. Loaded-but-not-sent is a silent DISCARD.**
> Both are worse than an honestly absent control.

A change-order form that accepts a cost and drops it is the same bug as the
jobsite-conditions one, except the thing being lost is money.

Related: `docs/plans/MONITORING_FEEDBACK_AND_AGENT_LOOP.md`,
`docs/plans/STAGING_ENVIRONMENT.md`.
