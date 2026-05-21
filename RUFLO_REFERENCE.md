# Ruflo (RuFlow) — Reference Guide for Pontifex Development
**Source:** https://github.com/ruvnet/ruflo | **Current version:** 3.7.0-alpha.8  
**What it is:** Multi-agent AI orchestration layer that sits on top of Claude Code. One init command gives Claude Code coordinated swarms, persistent vector memory, self-learning routing, and 100+ specialized agents.

---

## TL;DR — Why This Helps Us

Right now we spin agents manually via the Claude Code `Agent` tool with worktrees. Ruflo adds:
- **Automatic task routing** — Claude dispatches to the right specialist agent without us specifying it
- **Persistent memory across sessions** — agents remember what worked last time (patterns, solutions, prior decisions)
- **Parallel swarms** — instead of manually wiring 2–3 agents, Ruflo coordinates 10+ automatically
- **Token savings** — self-learning means repeated patterns (e.g. our migration pattern, RLS pattern) are cached and retrieved fast without re-explaining every session

---

## Two Install Paths — Pick One

### Path A: Plugin Only (Lite — no MCP server, just slash commands)
Best for: trying it without committing to full install. **Does NOT give memory, swarm_init, agent_spawn.**

```bash
# In Claude Code terminal
/plugin marketplace add ruvnet/ruflo
/plugin install ruflo-core@ruflo
/plugin install ruflo-swarm@ruflo
/plugin install ruflo-rag-memory@ruflo
```

### Path B: Full CLI Install (Recommended — full loop with MCP server)
Best for: production use. Gives 98 agents, 60+ commands, 30 skills, MCP server, hooks, daemon.

**macOS / Linux:**
```bash
curl -fsSL https://cdn.jsdelivr.net/gh/ruvnet/ruflo@main/scripts/install.sh | bash
```

**Or cross-platform (works on Windows too):**
```bash
npx ruflo@latest init wizard    # interactive
# or
npx ruflo@latest init           # non-interactive
# or
npm install -g ruflo@latest
```

**Then register as MCP server in Claude Code:**
```bash
claude mcp add ruflo -- npx ruflo@latest mcp start
claude mcp list   # verify it shows up
```

**Prerequisites:** Node.js 18+ (LTS), npm 9+, Claude Code already installed.

---

## Install Claude Code First (if not done)

```bash
npm install -g @anthropic-ai/claude-code
claude --dangerously-skip-permissions   # activate
```

---

## What You Get (Full Install)

| Capability | Detail |
|---|---|
| **100+ Agents** | coder, tester, reviewer, architect, security, docs, devops, and more |
| **Swarm Coordination** | Hierarchical (queen/workers), mesh (peer-to-peer), ring, star topologies |
| **Self-Learning** | SONA neural patterns — routes tasks to best-performing agents, gets smarter per session |
| **Vector Memory (AgentDB)** | HNSW-indexed, sub-millisecond retrieval, persists across sessions |
| **Background Workers** | 12 auto-triggered workers: audit, optimize, testgaps, ultralearn, etc. |
| **Plugin Marketplace** | 33 native Claude Code plugins |
| **MCP Tools** | 170–314 tools across coordination, memory, GitHub, security, monitoring |
| **Multi-Provider** | Claude, GPT, Gemini, Cohere, Ollama — smart cost-adjusted routing |
| **Security** | AIDefence input validation, CVE scanning, prompt injection blocking |

---

## Core Commands After Install

```bash
# Health check
ruflo hive status

# Initialize a swarm for a task
ruflo hive init --topology hierarchical --agents 5

# Run a task with parallel coordination
ruflo orchestrate "build the maintenance request API" --parallel

# List available MCP tools
ruflo mcp tools list

# Check memory
ruflo memory status

# View agent registry
ruflo sparc modes
```

---

## 33 Available Plugins — Most Relevant for Pontifex

### Core & Orchestration
| Plugin | Use for |
|---|---|
| `ruflo-core` | Foundation — always install this first |
| `ruflo-swarm` | Coordinate agents as a team on complex features |
| `ruflo-autopilot` | Let agents run a feature autonomously end-to-end |
| `ruflo-workflows` | Reusable multi-step templates (e.g. "build API + migration + UI") |

### Memory & Knowledge
| Plugin | Use for |
|---|---|
| `ruflo-agentdb` | Fast vector DB — agents remember our RLS patterns, migration conventions |
| `ruflo-rag-memory` | Hybrid search + graph hops — retrieve prior solutions by semantic similarity |
| `ruflo-rvf` | Save/restore agent state across sessions |

### Code Quality
| Plugin | Use for |
|---|---|
| `ruflo-testgen` | Find missing tests, generate them automatically |
| `ruflo-browser` | Playwright browser testing (replaces manual preview checks) |
| `ruflo-docs` | Auto-generate and maintain documentation |
| `ruflo-jujutsu` | Analyze git diffs, score risk, suggest reviewers |

### Security & Compliance
| Plugin | Use for |
|---|---|
| `ruflo-security-audit` | CVE scanning — useful before prod deploys |
| `ruflo-aidefence` | Block prompt injection (relevant for our user-facing input paths) |

### DevOps
| Plugin | Use for |
|---|---|
| `ruflo-migrations` | Manage DB schema changes (integrates with our Supabase migration pattern) |
| `ruflo-observability` | Structured logs, traces, metrics |
| `ruflo-cost-tracker` | Track token usage + budget alerts (directly useful for our Vercel cost discipline) |

### Architecture
| Plugin | Use for |
|---|---|
| `ruflo-sparc` | Guided 5-phase dev methodology with quality gates |
| `ruflo-adr` | Track architecture decisions (we have many undocumented decisions) |
| `ruflo-ddd` | Domain-driven design scaffolding |

---

## MCP Server Setup (Recommended for Pontifex)

After full install, wire Ruflo as an MCP server so it's always available in Claude Code sessions:

```bash
claude mcp add ruflo -- npx ruflo@latest mcp start
```

This gives Claude Code access to `memory_store`, `swarm_init`, `agent_spawn`, and 170+ tools **without** any manual Agent tool calls from us.

---

## Memory System — Key for Reducing Token Usage

This is the main token-saving mechanism. After init, agents store successful patterns:

```bash
# Initialize memory
ruflo memory init
ruflo config set memory.retention 30d
ruflo config set memory.maxSize 1GB
```

**What gets remembered automatically:**
- Which agent type solved which task fastest
- Code patterns that passed build + tests
- Solutions to past errors (e.g. our Supabase TCP hang issue gets cached so future agents don't re-investigate)
- Our conventions (RLS patterns, API response format, role hierarchy)

---

## Hooks System — Automate Our Workflow

Ruflo hooks fire on Claude Code events. Directly maps to our CLAUDE.md workflow:

```bash
# Auto-run build after every edit
ruflo hooks set post-edit "npm run build"

# Auto-collect metrics after task
ruflo hooks set post-task "ruflo metrics collect"

# Enable all hooks
ruflo hooks enable --all
```

---

## Web UI (Optional, No Install)

Try the hosted demo — no account needed:
- **Multi-model chat with MCP tools:** https://flo.ruv.io/
- **Goal planner (plain English → agent plan):** https://goal.ruv.io/
- **Live agent dashboard:** https://goal.ruv.io/agents

---

## Architecture Diagram

```
User → Ruflo (CLI/MCP) → Router → Swarm → Agents → Memory → LLM Providers
                       ↑                          ↓
                       └──── Learning Loop ←──────┘

Router uses:
  - Q-Learning (self-optimizing task routing)
  - MoE — 8 experts
  - 130+ skills
  - 27 hooks

Swarm topologies:
  - Hierarchical (queen assigns work to workers)
  - Mesh (peer-to-peer, all agents equal)
  - Ring / Star

Memory layer:
  - AgentDB — HNSW vector search (150x–12,500x faster than brute force)
  - SONA — self-optimizing neural patterns
  - ReasoningBank — RETRIEVE → JUDGE → DISTILL → CONSOLIDATE → ROUTE
```

---

## Quick Verification After Install

```bash
claude --version         # Claude Code installed
ruflo --version          # Ruflo installed (expect 3.7.x)
node --version           # Must be 18+

ruflo hive init --topology mesh --agents 3
ruflo sparc run dev "test installation"
ruflo mcp tools list | head -10
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Permission errors | `sudo chown -R $(whoami) ~/.npm` |
| Claude Code not found | `npm uninstall -g @anthropic-ai/claude-code && npm install -g @anthropic-ai/claude-code` |
| Memory DB errors | `ruflo memory reset --force && ruflo memory init` |
| MCP server issues | `ruflo mcp restart` |
| Slow cold-start on npx | Set `CLI_CORE=1` env var for plugin scripts (22.9× faster, memory commands only) |

---

## Pontifex-Specific Setup Plan

Once installed, these are the highest-value configs for our workflow:

1. **Install plugins:** `ruflo-core`, `ruflo-swarm`, `ruflo-rag-memory`, `ruflo-migrations`, `ruflo-cost-tracker`, `ruflo-security-audit`
2. **Seed memory with our conventions** — run once after init:
   - Feed CLAUDE.md + CLAUDE_SESSION_CONTEXT.md into `ruflo memory store`
   - This means future agents already know our RLS pattern, API format, role hierarchy
3. **Wire post-edit hook:** `ruflo hooks set post-edit "npm run build"` — catches TypeScript errors immediately
4. **Cost tracking:** `ruflo-cost-tracker` tracks token spend per task — directly supports our Vercel cost discipline goal

---

## Sources
- GitHub: https://github.com/ruvnet/ruflo
- Installation Wiki: https://github.com/ruvnet/ruflo/wiki/Installation-Guide
- User Guide: https://github.com/ruvnet/ruflo/blob/main/docs/USERGUIDE.md
- npm: https://www.npmjs.com/package/ruflo
- Web UI: https://flo.ruv.io/
- Goal Planner: https://goal.ruv.io/
