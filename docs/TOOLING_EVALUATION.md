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
| **ECC** | Agent-enhancement framework — overlaps the ruflo/claude-flow stack already installed (`.claude-flow/`, `agentdb.rvf`). A second agent framework = two sources of truth for workflows. If anything, we should *trim* the current one, not add another. |
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

## House rules for future tool adoption

1. **Verify before trusting** — fetch the actual repo; star counts and "official-sounding" names lie
   (see Cybersecurity-Skills above, and the fake `anthropic-claude-fable-5` desktop-client repo that
   appeared the day Fable 5 launched — typosquatting is same-day fast).
2. **No second framework for a solved problem.** One orchestrator, one indexer, one date lib.
3. **Prefer instructions over infrastructure.** A SKILL.md beats a daemon; a daemon beats a SaaS.
4. **Local-only for anything touching the code or DB.** This repo holds a production service key.
5. Document the verdict here BEFORE installing.
