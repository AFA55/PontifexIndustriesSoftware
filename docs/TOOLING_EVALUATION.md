# Tooling Evaluation — third-party repo/tool adoption decisions

> Every external tool we considered, the verdict, and why. Add a row before installing anything new.
> Rule of thumb: **we adopt tools that reduce tokens, add visibility, or encode quality — we reject
> anything that adds a second way to do something we already do.**
>
> Evaluated: Jun 9, 2026 (source: "Top 10 Trending AI GitHub Repositories" roundup, each repo
> independently verified on GitHub before the verdict)

## ✅ Adopted

| Tool | What it is | Why adopted | How we use it |
|---|---|---|---|
| **anthropics/skills** (pattern) | Official Agent Skills format (`SKILL.md`) | Our playbooks (iOS release, deploy gate, guardian review) were prose buried in CLAUDE.md — as skills they're executable, versioned procedures | Project skills in `.claude/skills/` |
| **taste-skill** (Leonxlnx, 40.6k★) | Design-quality instructions for AI UI generation — brief-inference, design-system mapping, anti-"generic slop", pre-flight checks | Zero infrastructure (pure instructions); installed verbatim from the repo | `.claude/skills/design-taste/` — scoped by the skill itself to **landing/marketing pages & redesigns** (not dashboards). Use for the SEO homepage rewrite (BACKLOG P2) and public pages |
| **knowledge-work-plugins** (Anthropic) | Official business-domain plugins | Already installed in our Claude environment (sales/legal/small-business packs) | Available on demand; no action |
| **frontend-design** (anthropics/skills, official) | Design-lead instructions for distinctive, non-templated UI — deliberate palette/typography/layout, anti-default calibration, two-pass plan→critique→build process | Official, 55 lines, zero infra; applies to ALL UI incl. product/dashboard screens (complements design-taste, which is marketing-pages-only) | `.claude/skills/frontend-design/` — invoke when building or restyling any screen (Jun 9, 2026; flagged by founder from an Instagram skills roundup, verified in anthropics/skills) |

## 🟡 Staged (adopt when trigger hits)

| Tool | What it is | Trigger to adopt | Notes |
|---|---|---|---|
| **Understand-Anything** (56.6k★) | Local plugin → JSON knowledge graph + **interactive visual dashboard** of the codebase | Founder runs `/plugin install understand-anything` then `/understand` (P2 in backlog) | Directly answers "I have no visual of my software." Graph is committable JSON — team-shareable. Founder-installed because plugin installs are interactive. |
| **codegraph** (46.7k★) | Local MCP code index (tree-sitter + SQLite) — ~47% fewer tokens, ~58% fewer tool calls for agents | When agent token costs hurt OR after Understand-Anything proves the indexing habit | Don't run two indexers at once; this one is the *agent-efficiency* play, UA is the *human-visibility* play |

## ❌ Rejected (and why — so we don't re-litigate)

| Tool | Verdict |
|---|---|
| **ECC** | Agent-enhancement framework — overlaps the ruflo/claude-flow stack already installed (`.claude-flow/`, `agentdb.rvf`). A second agent framework = two sources of truth for workflows. If anything, we should *trim* the current one, not add another. |
| **Anthropic-Cybersecurity-Skills** | Third-party despite the name (author: mukul975). 754 skills is context bloat; our security posture = guardian checklist + `rls-policy-auditor` + Supabase advisors + periodic audits, which are targeted at OUR stack. |
| **MoneyPrinterTurbo** | AI short-form video generator. Not a dev tool. Revisit *only* as a marketing experiment (TikTok/Reels for Pontifex) — and that's a founder/marketing decision, not engineering. |
| **academic-research-skills** | Academic paper workflows — irrelevant to a SaaS operations platform. |
| **pi** (earendil-works) | Toolkit for building agent *products*. We build construction software, not agents. Our agent needs are met by Claude Code itself. |

## House rules for future tool adoption

1. **Verify before trusting** — fetch the actual repo; star counts and "official-sounding" names lie
   (see Cybersecurity-Skills above, and the fake `anthropic-claude-fable-5` desktop-client repo that
   appeared the day Fable 5 launched — typosquatting is same-day fast).
2. **No second framework for a solved problem.** One orchestrator, one indexer, one date lib.
3. **Prefer instructions over infrastructure.** A SKILL.md beats a daemon; a daemon beats a SaaS.
4. **Local-only for anything touching the code or DB.** This repo holds a production service key.
5. Document the verdict here BEFORE installing.
