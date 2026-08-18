# UI principles

Every rule here was paid for. Each one names the real defect that produced it, so
a reviewer can check work against evidence rather than taste.

**Who this is for:** anyone — human or agent — building or reviewing a screen in
this platform. A reviewer should be able to read a diff with this file open and
say "this violates §3" and be right.

**The users.** Concrete-cutting crews on phones, outdoors, in sunlight, often
with gloves on, sometimes on bad signal. Office staff on desktops under time
pressure. A founder who is not an engineer, on a phone, making money decisions.
None of them will read documentation, retry a failed action, or report a bug they
can work around.

---

## 1. A screen must never offer what the server will refuse

**The defect:** supervisors saw a Print Ticket button that returned 403.
Salesmen saw a Mark Complete button the API refused. Both pages loaded fine,
because the page's read permission is wider than the action's write permission.

**The rule:** the role list for an action lives in ONE place that both the screen
and the API import. If a page decides who sees a button by hand, it will drift
from the route, and the user gets a control that lies.

**Reviewing:** for every button that calls an API, find the server's permission
check. If they are two separate lists, that is a finding.

---

## 2. Ask "is this empty, or was I refused?"

**The defect, three times this month:** a completed-jobs screen returned "job not
found" for every job because the query named a column that does not exist — and
rendered as an empty page. A crew's change-order list never rendered because the
operator page called an admin-only endpoint and `catch {}` swallowed the 403. A
labor panel said "no time entries" on jobs the crew had worked.

**The rule:** an empty state must distinguish *nothing here* from *something went
wrong* from *you are not allowed*. A dead query must be loud. Never `catch {}`.

**Reviewing:** for every empty state, ask what a failed request renders. If the
answer is "the same as no data", that is a finding.

---

## 3. A field may only be editable once the load can re-populate it

**The defect:** six separate silent failures. Work conditions were sent on save
but never loaded on edit, so opening a job and saving it wiped them. Photos were
attached to a field with no column behind it and vanished on write.

**The rule:** sent-but-not-loaded is a **wipe**. Loaded-but-not-sent is a silent
**discard**. Both are worse than an honestly absent control. If the round trip is
not complete, show the value as read-only text and say where it is edited.

**Reviewing:** for every editable field, trace load → render → change → save →
reload. All five, or it is a finding.

---

## 4. Say what happens, on the control

**The defect:** two buttons — "Done for Today" and "Job Complete" — sat as
identical siblings. Crews pressed the wrong one believing it meant finished. Five
of six closeouts in four days left the job un-invoiceable, and one tap silently
converted a one-day job into a multi-day job that rescheduled itself forever.

**The rule:** the control states its consequence in the user's terms, not the
system's. Not "Done for Today" alone but "Leaves the job OPEN and back on your
list tomorrow. Not finished, not billed." The common outcome is the primary,
solid control; the exception is secondary and visually distinct. Two choices with
different consequences must never look the same.

**Reviewing:** read the screen as a tired person at 6pm. If two buttons look
alike and do opposite things, that is a finding.

---

## 5. Friction goes where the mistake is, not everywhere

**The application:** confirming "coming back tomorrow" is right on a job booked
for one day — that is the mistake case. On a job the office genuinely booked
multi-day, the same confirmation is noise, so it stays one tap.

**The rule:** every confirmation must earn itself. A dialog people always click
through trains them to click through the one that matters. If a warning fires on
the normal path, it is miscalibrated.

**Reviewing:** what fraction of users hitting this dialog are making a mistake?
If it is most of them, keep it. If it is few, move the check.

---

## 6. Recorded "no" is not the same as never asked

**The defect:** the dispatch ticket drew a checkbox list, so `water_available:
false` printed as an unticked box — the crew loaded a water buggy. A redesign
rendered only ticked conditions as chips, and "no water" became invisible,
identical to never-recorded. 22 production jobs record water as absent.

**The rule:** absent, false and unknown are three states. Where the difference
changes what someone loads on a truck or does on site, print all three.

**Reviewing:** for every boolean, ask what `false` renders and what `null`
renders. If they render the same, that is a finding.

---

## 7. Labels are instructions, not column names

**The defect:** the operator's compliance panel printed
`Orientation Datetime  2026-08-16T08:00` to a man holding a phone on a jobsite.

**The rule:** write from the user's side of the screen. That row is now "Attend
site orientation / Sat, Aug 16 · 8:00 AM / Be there before you start work."
Never print a raw database key, a raw enum, or an ISO timestamp. Never make
someone decode `linear_ft` when `LF` is the word they use.

**Reviewing:** would a crew member read this aloud to another crew member using
these words? If not, it is a finding.

---

## 8. Built is not shipped — reachable is shipped

**The defect:** in a single day the founder asked for three things that already
existed. The office-close button had shipped in early August, rendered in exactly
one place he had never opened; the code comment at that render site even recorded
that the API had sat unused with no button attached.

**The rule:** a capability is not delivered until it is reachable from where the
work happens. If the person who commissioned it cannot find it, nobody can. When
building an action for a class of records, put it wherever those records are
listed — not only on their detail page.

**Reviewing:** name the screen a user is on when they need this. Is the control
there?

---

## 9. Phone rules are not negotiable

Crews work outdoors in gloves. These are floors, not targets:

- Tap targets ≥ 44×44 px. Full-row targets ≥ 56 px where the row is the action.
- No text under 14 px in operator content. 12 px only for a label that is
  duplicated at full size elsewhere.
- No horizontal page scroll at 375 px. Wide content (tables, diagrams) scrolls
  inside its own container.
- Both light and dark themes. Sunlight is the real test.
- Never assume the network. A tap with no visible response gets tapped again.

---

## 10. Numbers that reach an invoice must say where they came from

**The defect:** hours attributed from the office's crew placement were shown
identically to hours a crew member clocked against the job. The founder types
these into invoices by hand. On one job the screen was about to bill 18.27
crew-hours against a 4.87-hour day.

**The rule:** where a figure is inferred rather than recorded, label it at every
surface it appears — tile, table, modal, printed sheet. Where two legitimate
figures exist (billable vs paid; on-site vs portal-to-portal), show both and name
them. A screen that quietly picks one is how a wrong invoice gets written.

**Reviewing:** could a reader tell whether this number was measured or inferred?

---

## 11. Notifications compete with each other

**The defect:** unread counts per operator of 16, 13, 9, 7, 5, 4, 3, 3, 2. A new
dispatch inserts another unread row daily and nobody clears them, so "banner
unread" is the resting state. It had a functional cost: a job list gated behind
that banner hid an overrun job from the crew standing on it. Separately, five
managers were told a supervisor had not clocked out — at 1:30 in the afternoon,
while he was working.

**The rule:** every notification spends attention that the next one needs. One
that is routinely wrong destroys the value of the ones that are right. Before
adding a notification, say what the recipient should DO about it, and what
happens if they ignore it. If neither answer is compelling, do not send it.

---

## 12. Design for the second company, not just this one

**The rule:** no screen, rule or threshold may be keyed to a person's name or a
single tenant's arrangement. Roles and configuration, never `if (user === 'David')`.
A supervisor's shift end, a lunch threshold, who receives which alert — these are
a tenant's settings, not our constants. The founder's standing requirement: *"so
when other companies start using it, no errors would occur."*

**Reviewing:** would this behave correctly for a company with different roles,
hours, and pay arrangements? If it needs a code change to do so, that is a
finding.

---

## Reviewing checklist

Run against any UI diff:

1. Does any control appear that the server would refuse? (§1)
2. Does any empty state hide a failure or a refusal? (§2)
3. Does every editable field survive a full round trip? (§3)
4. Do any two adjacent controls look alike and do different things? (§4)
5. Does any confirmation fire on the normal path? (§5)
6. Does a recorded `false` render differently from absent? (§6)
7. Does any raw key, enum or ISO timestamp reach a user? (§7)
8. Is the new capability reachable from where the work happens? (§8)
9. 44 px targets, 14 px text, no 375 px overflow, both themes? (§9)
10. Is any inferred number shown as if it were measured? (§10)
11. Does a new notification earn the attention it spends? (§11)
12. Would this work for a different company without a code change? (§12)

---

## Related

- `docs/reference/WHAT_WE_ARE_BUILDING.md` — the goal these serve
- `docs/reference/UI_CATALOG.md` — reusable component patterns
- `.claude/skills/guardian-review` — the review procedure that applies these
