# Parent Org & Hub Access — how Andres reaches Pontifex and Patriot

> **Status: DECISION DOCUMENT. Research and design only — no code, no migrations, nothing applied.**
> Date: 2026-08-16. Supersedes nothing; **reconciles with** `docs/plans/IDENTITY_AND_TENANT_ROUTING_PLAN.md`
> (Jun 8, 2026 — designed, never built; see §8).
> Written to be approved by a non-technical reader. Engineering detail is in the indented/§9+ sections.

---

## The one-paragraph version

You are one person wearing two hats, and the software currently only lets you wear one at a time. That
is not a bug in your thinking — it is a real modelling question that every B2B platform hits, and the
industry has settled on a clear answer. The answer is **not** "give the parent company a permanent seat
inside the customer's company." It is "the parent has its own front door, and when it needs to go inside
a customer, it *asks, is logged, and the access expires*." That happens to be exactly what you asked for
when you said Patriot's data should stay Patriot's — you just asked for the two halves on different days
and haven't noticed they pull against each other. This document says how to hold both.

---

## PLACEHOLDER — filled in below

