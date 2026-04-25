# Codeburn — Token Usage Dashboard
# Source: https://github.com/getagentseal/codeburn
# Interactive TUI showing where Claude Code tokens/costs are going.

## Usage (run in terminal, not inside Claude)
```bash
codeburn           # launch interactive TUI
codeburn --help    # all options
```

## What it shows
- Cost breakdown by project, model, task type
- Daily burn charts
- Tool and MCP server usage stats
- Cache hit rates
- Session-level JSONL log analysis

## Install
```bash
npm install -g codeburn
# or if permissions error:
npm install -g codeburn --prefix ~/.local
```

## When to use
- End of sprint to see total token spend
- Diagnosing expensive agent runs
- Optimizing prompts that burn too many tokens
- Monitoring cost before production launch
