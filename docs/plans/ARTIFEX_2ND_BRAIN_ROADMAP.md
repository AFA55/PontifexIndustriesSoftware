# Artifex 2nd-Brain — Research Findings & Upgrade Roadmap

> Deep-research run, Jul 3–4 2026 (multi-agent: 5 search angles → 15 sources fetched →
> 25 falsifiable claims extracted → adversarial 3-vote verification). The Sirio-Berati
> claims below survived full 3-0/2-1 adversarial verification; the architecture/retrieval/
> voice claims come from primary sources (arXiv, Supabase docs, ElevenLabs docs) whose
> verification panels were cut short by session limits — each is marked [primary-source]
> and was sanity-checked against the source domain before inclusion.

## 1. The big finding: the viral "second brain" is simpler than Artifex already is

Sirio Berati's viral system (the founder's original inspiration) is, verified 3-0 from his
own GitHub/X/LinkedIn: **a folder of markdown files** (PARA + Zettelkasten taxonomy) that
Cursor operates on. No embeddings, no vector store, no database, no memory engine.
What made it resonate was pure UX:

1. **Frictionless capture** — you just TALK; the agent files everything in the right place
   (chat prefixes like `[Thought]`, `[Project: X]` auto-route content).
2. **Instant recall through chat** — ask, get the answer with context; no manual filing/search.
3. **A human-readable taxonomy** — Knowledge/Projects/Journal/People/Notes with cross-links,
   so the memory is browsable, not a black box.

**Implication:** Artifex already has the hard parts (real DB, tenant isolation, LIVE
operational data — things a markdown folder can never do). What it lacks is the *feel*:
automatic capture, reliable recall, browsable memory. Those are the upgrades.

## 2. What production memory systems do (vs papers)

- **Automatic extraction wins.** Mem0's pipeline [primary-source, arXiv 2504.19413]
  extracts/consolidates salient facts from conversation automatically — +26% over OpenAI's
  memory on LOCOMO. Artifex's "user must say save this" is the biggest gap vs. state of art.
- **Knowledge graphs are NOT the priority.** Mem0's graph variant beat flat
  extraction+vectors by only ~2% [same paper]. Zep/Graphiti's temporal graph is powerful
  [arXiv 2501.13956: 94.8% DMR, −90% latency vs full-context] but heavy. For a few
  thousand notes/tenant: **well-done extraction + hybrid retrieval ≈ graph performance at a
  fraction of the complexity.** Skip the graph for now; add typed notes instead (see 4.2).
- **Structured retrieval beats context-stuffing** on both quality and latency [Zep paper].

## 3. Retrieval: the concrete Supabase pattern

[primary-source: supabase.com/docs/guides/ai/hybrid-search]
- `artifex_memory_notes` gains: `embedding vector(...)` + generated
  `fts tsvector` column; HNSW index (vector) + GIN index (fts).
- One SQL function does **hybrid search**: keyword + semantic lists merged with
  Reciprocal Rank Fusion (`1/(k+rank)`, k=50, tunable full_text/semantic weights).
- Embeddings: small/cheap model via the existing AI Gateway at note-save and query time.
  A few thousand notes per tenant = trivially fast with HNSW.

## 4. The roadmap

### Phase A — quick wins (days; no new vendors)
1. **Hybrid semantic recall** (kills the known ilike weakness): pgvector + tsvector +
   RRF function; `recall_memory_notes` calls it. Backfill embeddings for existing notes.
2. **Automatic memory extraction**: after each Artifex reply, a cheap async Claude pass
   over the exchange extracts candidate durable facts ("shop forklift needs hydraulic hose
   by Friday") → saved with `source: 'auto'`, deduped against near-identical notes
   (embedding similarity). The user never has to say "remember this" again — the Sirio
   capture-feel on top of a real database.
3. **Typed notes taxonomy** (the browsable-brain feel, Sirio's Knowledge/People/Projects):
   `note_type` (fact | person | procedure | project | reminder) + optional `entity_name` +
   `remind_at`. The extractor classifies; the sidebar groups by type.
4. **Memory browser UI**: a "Brain" tab in the Command Center listing notes by type/entity
   with edit/delete (trust requires visibility — every competitor hides memory; we shouldn't).

### Phase B — Jarvis behaviors (1–2 sessions)
5. **Morning briefing** (proactivity done right): daily per-tenant digest Artifex composes
   from operational tools + due reminders ("3 crews clocked in, Job X has no operator,
   you asked to follow up on the Harper invoice today") — bell + optional email; a
   "Briefing" button in the Command Center for demos.
6. **Reminders that fire**: `remind_at` notes surface via the existing cron + bell
   pipeline ("you asked me to remind you...").

### Phase C — voice (the showcase)
7. [primary-source: ElevenLabs docs] ElevenLabs Agents = fastest path to talking to
   Artifex: it handles STT/TTS/turn-taking/interruptions (~80ms STT claim), is LLM-agnostic
   — **but custom LLMs must speak an OpenAI-compatible Chat Completions API**, so we'd add
   a thin Next.js shim route in front of the Artifex agent. Keeps Claude as the brain,
   ElevenLabs as the mouth/ears. OpenAI's guidance agrees with the chained
   STT→LLM→TTS shape when extending an existing text agent. Needs: founder provisions an
   ElevenLabs key (aligns with the existing Jarvis Phase 3 backlog item).
8. Fallback/demo-cheap option: browser WebSpeech for input + ElevenLabs TTS streaming out.

### Our moat (from the competitive scan angle)
Rewind/Limitless/Personal.ai are all PERSONAL memories. Artifex is a **team brain fused
with live operations data** — the whole company shares one memory that also knows who's
clocked in and what revenue did this week. No competitor in the scan combines both. That's
the demo story: "your company's second brain," not "your notes app."

## 5. Suggested build order
A1 (hybrid recall) → A2 (auto-extraction) → A3+A4 (types + browser) → B5 (briefing) →
B6 (reminders) → C7 (voice, once the ElevenLabs key exists).
A1+A2 alone make the LinkedIn demo dramatically better: save nothing manually, recall
anything semantically.
