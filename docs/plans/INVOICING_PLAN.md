# Invoicing — the plan, and why it is PARKED

**Status: ⏸️ PARKED. Do not ship. Do not extend.**
*Founder, Aug 11: "don't start pushing invoice — we need to make sure the
schedule board and all other task areas are completed before then."*

Invoicing sits at the END of the chain. Every number on an invoice comes from
the schedule board, the schedule form and the job ticket. Shipping billing on top
of surfaces that are still moving means re-doing it, and worse, means a wrong
number reaching a customer. It waits.

---

## 1. Where the work already is

A working draft was built on **Aug 11** and then deliberately **reverted off
`main`** so a later unrelated push could not carry it live.

- **Branch:** `feat/invoice-draft` (commit `e15c30f9`)
- **Revert on main:** `f3a848cb`
- To resume: `git cherry-pick e15c30f9` (or branch from it), then re-verify.

Nothing is lost, and nothing can ship by accident.

### What it contains
| File | What it does |
|---|---|
| `components/pdf/InvoiceBillingPDF.tsx` | The PDF, laid out from the founder's photo of the real paper sheet |
| `app/api/job-orders/[id]/invoice-pdf/route.tsx` | Gathers the data, resolves the ticket family, renders |
| `app/dashboard/admin/jobs/[id]/page.tsx` | "Proceed to Invoice" button, shown once the job is completed / pending_completion |

### Verified working before it was parked
Rendered against real production job **JOB-2026-124747** (Collins Custom Builds)
and inspected as an image, not just as a 200 response:
- Customer, job number, sales rep, job name, location, work description all
  filled from the job record.
- **3 daily logs across 2 distinct days** (two operators both logged Aug 6)
  correctly collapsed to `Wed, Aug 5 · Thu, Aug 6`.
- INVOICE TOTAL printed blank, as intended.

Three layout defects were found by LOOKING at the render and fixed: the Sales Rep
label wrapped ("Adam In-galls" across three lines), the dates ran together
because each formatted date already contains a comma, and the whole work summary
crammed into the first ruled line and printed through the rule beneath it.
**Lesson: a PDF is not verified until someone has looked at it.**

---

## 2. The sheet, field by field

From the founder's photo (Aug 10). ✅ = the platform already holds it.

| Field on the paper form | Source | |
|---|---|---|
| *(company logo)* | `tenant_branding.logo_url` | ✅ white-label, never hardcoded |
| **CUSTOMER** (4 lines) | `customer_name` + contact + billing address | ⚠️ billing address not confirmed stored |
| **SUBCONTRACT** | a contract number; "most don't" have one | ⏸️ prints as a blank line |
| **CHANGE ORDER #** | `change_orders.co_number` | ✅ |
| **PO #** | `job_orders.po_number` | ✅ |
| **JOB #** | `job_orders.job_number` | ✅ |
| **SALES REP** | `job_orders.salesman_name` | ✅ |
| **JOB NAME** | `project_name`, else the address | ✅ already on the schedule form; 17 of 30 live jobs have one |
| **JOB LOCATION** | `address` / `location`, split by comma | ✅ |
| **DATE(S) WORK PERFORMED** | distinct `daily_job_logs.log_date` across the ticket family | ✅ |
| **Job Ticket #(S)** | root + every `parent_job_id` child | ✅ |
| **DESCRIPTION OF WORK** | `buildWorkPerformedSummary()` across the family, one day per ruled line | ✅ this is what kills the retyping |
| **INVOICE TOTAL** | — | ❌ not captured — see §4 |

### The two plural fields are the whole point
*Founder, Aug 10:* several operators can be on one job — some a full day, some
half a day to help someone finish — and **each gets their own ticket**, all
belonging to ONE job. So the route resolves the whole family (root + every
`parent_job_id` child) and gathers dates and work across all of them.

**Reading only the job in the URL would silently bill for one crew's work.** Any
future change here must keep the family resolution.

---

## 3. What must land BEFORE this ships

The founder's own sequencing. Invoicing is downstream of all of it:

1. **Schedule board** — solid.
2. **Schedule form** — solid; it is where `project_name` and PO are captured.
3. **Job ticket / work-performed (batch 1d)** — the description of work comes
   straight from here. If operators are still fighting the entry form, the
   description on the bill is whatever survived that fight.
4. **M8 — the per-person roll-up** on a job (who worked it, which days, hours).
   Same family resolution this uses; build it once, correctly, and the invoice
   inherits it.

---

## 4. Pricing — a separate, later piece

*Founder, Aug 10:* "eventually we have to add quoted total — we have something
similar to that already that we input — but we will need a way to add change
order totals and other totals. That is later on, we can save that for later down
the road."

So it is **three numbers, not one**:
- the **quoted** total,
- **change order** totals (`change_orders.price_amount` already exists),
- **other/extra** totals.

⚠️ Before adding a fourth number to the schema, **find the "something similar"
already being entered** and reuse it. `job_orders.estimated_cost` exists — check
whether that is what the office fills in today.

Until then the money lines print blank and Amanda writes them, exactly as she
does now. A guessed number on a customer's bill is far worse than a blank line.

---

## 5. ⚠️ THERE IS ALREADY AN INVOICING MODULE — read this before building anything

Found **after** the draft above was built, while confirming main was clean. I did
not check for one first. That is the miss to learn from: grep the repo for the
noun before building a second one.

**What already exists on `main`, fully built:**

| | |
|---|---|
| `invoices` table | **0 rows** — built, never used in production |
| `components/pdf/InvoicePDF.tsx` | A customer-facing invoice with LINE ITEMS (description, quantity, rate, amount) |
| `app/dashboard/admin/billing/_components/CreateInvoiceForm.tsx` | Customer search, **"Or Select Completed Job"**, customer name, contact email, **billing address** |
| `app/api/admin/invoices/*` | create, preview, send, send-confirmed, confirm, remind, payment, mark-paid, pdf |
| `app/api/cron/invoice-30d-reminders` | chases unpaid invoices |
| `emails/InvoiceEmail.tsx` | the outbound email |

`InvoicePDF` already carries `invoice_number, invoice_date, due_date, po_number,
job_number, job_name, job_location, work_completed_date, sales_person` — nearly
the same fields as the paper sheet, plus priced line items.

**This answers an open question:** the **billing address IS captured**, on the
create-invoice form.

### So which is M2f actually asking for?

The founder's words: *"the office manually pulls the completion ticket and the
work ticket and retypes them into a separate invoicing ticket."* That "separate
invoicing ticket" is the PAPER sheet — an internal worksheet, not the customer's
invoice. So the two documents may both be legitimate and different:

- **A — draft the paper worksheet** (what was built on `feat/invoice-draft`).
  Matches what he asked for literally and fits the office's current filing habit.
- **B — pre-fill the existing invoice flow** from a completed job. That module
  already has "Or Select Completed Job", so it was designed for exactly this —
  and it inherits pricing, sending, reminders and paid-tracking, which A has none
  of. But it has never been used once, so it is unproven.

**Decide with the founder before writing more code.** Doing both means two
documents drifting apart, which is how the utility waiver ended up with two
different wordings in circulation.

Worth asking directly: *does the office want the paper worksheet drafted, or do
they want to stop using it and invoice from the platform?* The answer changes
which of these is dead code.

---

## 6. Still to decide

- ~~**Billing address**~~ — ✅ answered by §5: it is captured on the existing
  create-invoice form.
- **Where the draft belongs** — currently a button on the job page. The founder
  originally described it on **completed jobs** (M2f). Confirm which surface.
- **Does it need saving?** Right now it renders on demand. If the office needs a
  record of what was invoiced and when, that is a stored document, not a
  generated one — and that is a different build.
