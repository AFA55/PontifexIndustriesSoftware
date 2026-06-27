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
| **@simplewebauthn/server + /browser** (v13, MasterKale) | The de-facto WebAuthn/passkey library for Node + browser — generates & verifies the registration/authentication ceremonies, handles COSE keys, signature counters, attestation | We need biometric **fingerprint / Touch ID / Windows Hello** sign-in on the *website* (the web analogue of the app's native Face ID). Rolling our own WebAuthn crypto would be reckless; SimpleWebAuthn is audited, maintained, lightweight | Server helpers `lib/webauthn.ts`, browser glue `lib/webauthn-client.ts`, ceremonies under `app/api/auth/webauthn/*`, credentials in the `webauthn_credentials` table. Passwordless: passkey verify → server mints a Supabase session via `admin.generateLink`+`verifyOtp` (Jun 14, 2026) |

## 🟡 Staged (adopt when trigger hits)

| Tool | What it is | Trigger to adopt | Notes |
|---|---|---|---|
| **Understand-Anything** (56.6k★) | Local plugin → JSON knowledge graph + **interactive visual dashboard** of the codebase | Founder runs `/plugin install understand-anything` then `/understand` (P2 in backlog) | Directly answers "I have no visual of my software." Graph is committable JSON — team-shareable. Founder-installed because plugin installs are interactive. |
| **codegraph** (46.7k★) | Local MCP code index (tree-sitter + SQLite) — ~47% fewer tokens, ~58% fewer tool calls for agents | When agent token costs hurt OR after Understand-Anything proves the indexing habit | Don't run two indexers at once; this one is the *agent-efficiency* play, UA is the *human-visibility* play |

## ❌ Rejected (and why — so we don't re-litigate)

| Tool | Verdict |
|---|---|
| **ECC** | Agent-enhancement framework — a second agent framework = two sources of truth for workflows. We use Claude Code's native orchestration (Workflow + worktree subagents + skills); no second framework. (Note: we *did* trim — the dormant ruflo/claude-flow stack was removed Jun 27, see Batch 3.) |
| **Anthropic-Cybersecurity-Skills** | Third-party despite the name (author: mukul975). 754 skills is context bloat; our security posture = guardian checklist + `rls-policy-auditor` + Supabase advisors + periodic audits, which are targeted at OUR stack. |
| **MoneyPrinterTurbo** | AI short-form video generator. Not a dev tool. Revisit *only* as a marketing experiment (TikTok/Reels for Pontifex) — and that's a founder/marketing decision, not engineering. |
| **academic-research-skills** | Academic paper workflows — irrelevant to a SaaS operations platform. |
| **pi** (earendil-works) | Toolkit for building agent *products*. We build construction software, not agents. Our agent needs are met by Claude Code itself. |

## Batch 2 — "THE SKILLS" roundup (Instagram/article list, evaluated Jun 9, 2026)

Headline: **more than half this list was already installed** in our environment. Verdicts:

| Item | Verdict | Reason |
|---|---|---|
| PDF / DOCX / PPTX / XLSX (official) | ✅ **Already installed** (`anthropic-skills` plugin) | Live now — say "make me a deck/spreadsheet/contract review" and they fire |
| skill-creator (official) | ✅ Already installed | Use it when we notice repeated instructions worth skill-ifying |
| frontend-design (official) | ✅ Adopted earlier today | `.claude/skills/frontend-design/` |
| brand-guidelines (official) | ✅ **Adapted, not installed** | It's a template carrying ANTHROPIC's brand — we cloned the pattern as **`pontifex-brand`** (bridge-P, journey gradient, indigo surfaces, white-label DO-NOT-APPLY rule for tenant UI) |
| Context7 (Upstash MCP) | ✅ **Adopted** — added to project `.mcp.json` | Version-accurate docs for Next.js 15/React 19/Supabase at code time; kills hallucinated-API bugs. Loads next session |
| canvas-design (official) | 🟡 Staged | Adopt when the marketing/social push starts (SEO homepage, GBP, social assets) |
| doc-coauthoring (official) | 🟡 Staged | Useful for proposals/strategy docs with the founder; install on first need |
| Claude SEO (AgriciDaniel) | ❌ Redundant | `searchfit-seo` plugin already installed: 12+ skills incl. full audit, technical SEO, schema, AI visibility |
| Marketing Skills (Corey Haines) | ❌ Redundant | `marketing` + `small-business` plugins already cover campaigns, email sequences, CRO-adjacent content, briefs |
| Deep Research Skill | ❌ Redundant | Built-in `deep-research` harness already present (multi-phase, source-verified) |
| Tavily MCP | ❌ Redundant | Built-in WebSearch/WebFetch cover it; no second search stack |
| Superpowers (obra) | ❌ Rejected | A 20-skill dev-process framework — we already HAVE the process (DEVELOPMENT_PLAYBOOK + guardian-review + prod-deploy + SPARC/claude-flow stack). Rule 2: no second framework. Worth mining for single ideas later, not installing wholesale |
| Planning with Files | ❌ Rejected | Solves "agent loses track on long tasks" — our harness already has plan mode + task tracking, and BACKLOG.md is the cross-session plan file |
| Context Optimization | ❌ Rejected | Aimed at people building API agents; Claude Code manages its own context. We already cut per-session context 61% by trimming CLAUDE.md — that's the real lever |
| Task Master AI MCP | ❌ Rejected | "PRD → ordered tasks" is exactly BACKLOG.md + the session ritual; a parallel task DB would split the single source of truth |
| Obsidian Skills | ❌ Rejected | We don't use Obsidian |
| NotebookLM Integration | ❌ Rejected | No NotebookLM workflow; PDF skill + deep-research cover dense-document analysis |

## Batch 3 — Vercel Plugin for AI Coding Agents (Jun 11, 2026)

| Tool | Verdict | Notes |
|---|---|---|
| **vercel/vercel-plugin** (official Vercel) | ✅ **Adopted** — installed user-scope via `npx plugins add vercel/vercel-plugin` (→ `vercel@claude-plugins-official`) | Verified against vercel.com/docs/agent-resources/vercel-plugin before install. 25+ skills (the ones we care about: `deployments-cicd`, `env-vars`, `vercel-cli`, `nextjs`, `react-best-practices`, `vercel-functions`), 3 specialist agents (`deployment-expert`, `performance-optimizer`, `ai-architect`), slash commands incl. `/vercel-plugin:deploy`, `/vercel-plugin:env`, `/vercel-plugin:status`. Hooks are lightweight (session-start context only in Next.js/Vercel projects — ours qualifies). Telemetry = one daily ping; disable with `VERCEL_PLUGIN_TELEMETRY=off` if desired. **Why adopted:** directly targets our two recurring Vercel pain points — env-var management (the RESEND_API_KEY fiasco) and deploy troubleshooting (the Jun 11 git-integration no-fire). CLI is already authed as the founder, so `/vercel-plugin:env` + `vercel env` workflows work. Requires session restart to load. |

## UI component libraries — "build a website 10x faster" post (bestapps.ai IG, evaluated Jun 14, 2026)

Founder flagged a post pushing 5 tools. **Context that drives every verdict:** we hand-roll Tailwind (no shadcn/Radix — confirmed: 0 component-lib deps, 322 files with bespoke `rounded-2xl` cards), we have a strong brand (`pontifex-brand`) and an explicit ANTI-templated-slop rule (`design-taste`/`frontend-design`). So these are **inspiration / copy-paste-and-rebrand sources, NOT wholesale adoptions** — pulling a shadcn-styled kit in raw would both clash with our system and read as generic slop. None installed.

| Tool | What it is | Verdict |
|---|---|---|
| **21st.dev** | Open-source UI marketplace + a "Magic" **MCP** that lets the AI pull/scaffold components | 🟡 **Staged (inspiration; MCP maybe)** — the most useful of the five because of the MCP. Trigger to adopt the MCP: the **SEO/marketing homepage rewrite** (BACKLOG P2) where we build net-new public sections fast. Gate it to **marketing/landing only**, never product/dashboard UI, and rebrand every output through `pontifex-brand`. Verify the MCP's data-retention before connecting (it's a 3rd-party server). |
| **Cult UI** | shadcn-"expanded", 78+ animated components, MIT, free | 🟡 **Staged (copy-paste individual pieces)** — good *animation* reference for marketing polish (hover/hero effects). Copy a specific component → port to our Tailwind + brand. Do NOT add as a dep. |
| **Watermelon UI** | 260+ free Tailwind blocks (forms/dashboards/charts) | 🟡 **Staged (layout reference)** — same posture: mine for layout ideas, rebuild in our patterns ([UI_CATALOG.md](reference/UI_CATALOG.md)). |
| **Skiper UI** | Fancy animated components, $129 one-time | ❌ **Rejected for now** — paid, and we already have free options + the design skills. Revisit only if a specific high-end animation need appears and free sources don't cover it. |
| **Manus** | Autonomous "type it, it builds the whole app" agent | ❌ **Not applicable** — we already build with Claude Code; a second autonomous builder is exactly the "no second framework for a solved problem" rule. |

**Net for productivity + uniformity (founder's actual goal):** the highest-leverage move wasn't installing any of these — it was creating **[docs/reference/UI_CATALOG.md](reference/UI_CATALOG.md)** so every session reuses our shipped patterns. Pull from 21st.dev/Cult/Watermelon as *inspiration* for net-new **marketing** pages, rebrand, then record the result in the catalog.

## Batch 3 — "10x dev velocity" research (Jun 27, 2026)

Source: 5 Instagram posts the founder flagged (Hermes Agent, Boris Cherny on parallel sessions, the
"agentic loop", Sakana Fugu) + a 109-agent deep-research pass (17 claims confirmed, 8 refuted) + a
full local audit. Goal: stop fixing 2–3 bugs serially; run parallel agents + verify-loops. **Headline:
the #1 unlock was native to Claude Code and already ours — not anything from the videos.**

### ✅ Adopted (Jun 27)
| Tool | What it is | Why adopted | How we use it |
|---|---|---|---|
| **Playwright MCP** (microsoft, official, free) | MCP server giving agents browser automation via accessibility-tree snapshots (not screenshots — token-lean) | Closes the known "frontend is hard to loop" gap: agents can self-verify UI/flows headlessly + in CI. One-line install, official, maintained. | Registered in `.mcp.json` (project scope). Subagents/verify-loops drive it; complements `Claude_Preview` (interactive) with headless/CI checks. NOT pixel-diffing — verifies elements/flows exist & work, not that a design *looks* right. |
| **Native parallel worktrees + subagents + headless** (`claude --worktree`, `isolation: worktree`, `claude -p`) | First-party Claude Code parallelism. Boris Cherny (CC creator): 3–5 parallel worktree sessions = *"the single biggest productivity unlock."* | Free, already shipped in the tool, was underused. This is the actual 10x. | Codified as the **`parallel-burndown`** Workflow (`.claude/workflows/parallel-burndown.js`) + the [parallel-burndown playbook](playbooks/PARALLEL_BURNDOWN.md). |

### 🟡 Staged (trial when triggered)
| Tool | What it is | Trigger | Honest tradeoff |
|---|---|---|---|
| **Claude Context** (zilliztech, MIT MCP) | Semantic code-search index → claims ~40% token reduction | When agent token costs hurt on this repo | Real, but the 40% is vendor-self-reported (n=30, GPT-4o-mini, cherry-picked) and needs a Milvus/Zilliz vector store + embeddings provider. For a single repo the native subagent-summary pattern may already be enough — measure before committing. Overlaps the *staged* `codegraph`/Understand-Anything indexers: **pick ONE indexer, don't run two.** |
| **Conductor** (conductor.build, Mac app) | GUI to run many parallel Claude Code/Codex agents in worktrees | If managing 5+ concurrent agents in terminals gets unwieldy | It's a GUI wrapper over `claude --worktree` we already have natively. Mac-only. Skippable unless visual session management becomes the bottleneck. |

### ❌ Rejected (Jun 27 — don't re-litigate)
| Tool | Verdict |
|---|---|
| **Hermes Agent** (NousResearch) | REAL (MIT, self-improving personal-assistant framework, Telegram/Discord/Slack), but the Instagram "180k★ in 4 months" claim was **refuted** by the research. It's a 24/7 personal agent, NOT a Claude Code orchestrator for this Next.js codebase. No fit. |
| **Sakana Fugu / Fugu Ultra** | REAL & GA (multi-model "conductor" API), but "frontier parity with Fable 5" is **marketing** — Sakana's own numbers show Fable 5 beats it 3 of 4 (SWE-Bench 80.0 vs 73.7). It's a hosted model-router rival, not a Claude Code layer. Skip. |
| **ruflo / claude-flow V3** (was already installed) | **REMOVED Jun 27.** Audit found it fully dormant — `.claude-flow/` (hierarchical-mesh "swarm," 149 stale sessions, "neural memory graph") + ~23 swarm agent-stub dirs (`swarm/`, `flow-nexus/`, `sparc/`, `v3/`, etc.) referencing `mcp__claude-flow__*` tools that were never connected/invoked. Pure dead weight. Deleted the dirs + `.claude-flow/` + the `claude-flow-*` command stubs. (The real router is `prompt-advisor.sh` + our own hooks, which stay.) Also prune the "ruflo init" block from `~/.claude/CLAUDE.md`. **This is the literal embodiment of house-rule #2 — a second orchestrator we never used.** |
| **"Comment Jarvis" / waitlist-bait reels** | No content; engagement bait. Ignore. |

### Dead npm deps removed (Jun 27)
`use-places-autocomplete`, `@react-google-maps/api`, `@simplewebauthn/browser`, `@simplewebauthn/server`
— zero imports (confirmed by grep), removed via `npm uninstall`. (Note: the `@simplewebauthn` row in
the "Adopted" table above is now historical — web WebAuthn was removed Jun 14; the deps lingered until now.)

## House rules for future tool adoption

1. **Verify before trusting** — fetch the actual repo; star counts and "official-sounding" names lie
   (see Cybersecurity-Skills above, and the fake `anthropic-claude-fable-5` desktop-client repo that
   appeared the day Fable 5 launched — typosquatting is same-day fast).
2. **No second framework for a solved problem.** One orchestrator, one indexer, one date lib.
3. **Prefer instructions over infrastructure.** A SKILL.md beats a daemon; a daemon beats a SaaS.
4. **Local-only for anything touching the code or DB.** This repo holds a production service key.
5. Document the verdict here BEFORE installing.
