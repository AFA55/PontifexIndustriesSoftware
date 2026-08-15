# Demo accounts + test tickets — role-by-role walkthrough

Set up Aug 15 2026 for the founder's own click-through of every screen and button.
Everything below is live on **pontifexindustries.com**, tenant **Patriot** (company code `PATRIOT`).

---

## The four accounts

All four share one password: **`PontifexDemo2026!`**
Company code at login: **`PATRIOT`**

| Role on screen | Login email | Internal role | What it's for |
|---|---|---|---|
| Operator | `demo.operator@pontifexqa.com` | `operator` | The crew side. Clock in, in route, waiver, work performed, day complete. |
| Team Member | `demo.helper@pontifexqa.com` | `apprentice` | The helper. Proves a helper can log their own work but does **not** close the ticket. |
| Supervisor | `demo.supervisor@pontifexqa.com` | `supervisor` | David's seat. Site visit reports, the read-only timecard view, Open Operator View. |
| Project Manager | `demo.pm@pontifexqa.com` | `salesman` | Writes jobs. This is the seat where "works for me, not for them" usually shows up. |

The operator and supervisor accounts carry the founder's phone (470-658-6313) with SMS
enabled, so reminders and dispatch texts land on his handset during testing.

### Opening them all at once

Four logged-in sessions cannot share one browser — the session is per browser profile.
Use whichever is easier:

- **Chrome profiles** (best): People → Add, one profile per role. Four windows, each
  permanently logged in as a different person, all visible at once.
- **One normal window + three Incognito windows** (fast, but each incognito window shares
  one session — so this only gives you two identities at a time).
- **Different browsers** — Chrome, Safari, Firefox, Edge — one role each.

---

## The four test tickets

| Job | Day(s) | Crew | Dispatched | What it is for |
|---|---|---|---|---|
| `TEST-2026-000101` — Alpha Builders | Sat Aug 15 | Operator only | ✅ yes | The simple one. Straight through: clock in → in route → waiver → work performed → complete. |
| `TEST-2026-000102` — Bravo Construction | Sat Aug 15 | Operator **+ Helper** | ✅ yes | The helper flow. Both log work; only the lead closes the ticket. |
| `TEST-2026-000103` — Charlie Contractors | Sun Aug 16 → Mon Aug 17 | Operator only | ❌ not yet | **Deliberately skip day one's ticket.** Tests the missed-ticket chase the next morning and the calendar day numbering. |
| `TEST-2026-000104` — Delta Group | Sun Aug 16 → Mon Aug 17 | Operator **+ Helper** | ❌ not yet | Both log measurements across two days. Tests that the printed ticket shows the **lead's** numbers only. |

Today's two are dispatched and already in the operator's My Jobs. Tomorrow's two are
left undispatched on purpose — they should arrive by themselves at **7:05am** via
auto-dispatch, which is itself worth watching.

All four have the founder as site contact (470-658-6313) and require the utility waiver,
so the customer-signature flow can be tested end to end on his own phone.

### Cleaning up afterwards

Every row is prefixed `TEST-2026-0001`. To clear them:

```sql
delete from job_daily_assignments where job_order_id in (select id from job_orders where job_number like 'TEST-2026-0001%');
delete from work_items            where job_order_id in (select id from job_orders where job_number like 'TEST-2026-0001%');
delete from daily_job_logs        where job_order_id in (select id from job_orders where job_number like 'TEST-2026-0001%');
delete from job_orders            where job_number like 'TEST-2026-0001%';
```

---

## What to watch for — the one pattern that has produced every bug this week

Seven separate production faults in five days have had the **same shape**:

> A page offers something, and the backend behind it quietly refuses.

Dispatch, day numbering, ticket hours, the dashboard's Team/Personal scope, Active Jobs,
the timecards page, and RLS for the supervisor. In every case the screen did not show an
error — it showed *nothing*, or it showed something plausible and wrong.

So while clicking, the question on any empty screen is never just "is there no data?"
It is:

> **Is this empty, or was I refused?**

Note every blank list, every button that appears to do nothing, and every number that
looks too round. Which of the two it is can be answered from the code in a minute — but
only if it gets written down.

### The three seats where this hides
1. **Project Manager** — jobs are scoped to what they *created*, so their lists look
   different from an ops manager's for reasons that are invisible on screen.
2. **Supervisor** — has cards for things the API historically refused. Three were fixed
   Aug 14–15; there may be more.
3. **Helper** — is blocked from closing a ticket by design. That is correct behaviour and
   should read as a clear message, not a dead button.

---

## Related documents
- `docs/plans/SYSTEM_MAP.md` — every screen, what it calls, and the Monday checklist
- `docs/plans/PLATFORM_WALKTHROUGH_DECK.md` — the same platform told as a narrative
- `BACKLOG.md` — where anything found during testing should land
