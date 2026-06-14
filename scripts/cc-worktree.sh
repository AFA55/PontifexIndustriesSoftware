#!/usr/bin/env bash
#
# cc-worktree.sh — spin up an isolated Claude Code workspace so you can run
# multiple `claude` sessions at once WITHOUT them stepping on each other's files.
#
# Each session gets its own folder + git branch (a "worktree"), so two Claudes
# can edit code in parallel safely. This is how multi-session Claude Code work
# is meant to be done.
#
#   Usage:  ./scripts/cc-worktree.sh <short-name>
#   e.g.    ./scripts/cc-worktree.sh billing-fix
#
# Then open a NEW terminal tab, cd into the printed folder, and run `claude`.
#
set -euo pipefail

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "usage: ./scripts/cc-worktree.sh <short-name>   (e.g. billing-fix)"
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
PARENT_DIR="$(dirname "$REPO_ROOT")"
DEST="$PARENT_DIR/pontifex-$NAME"
BRANCH="session/$NAME"

if [ -e "$DEST" ]; then
  echo "❌ $DEST already exists — pick another name or remove it first."
  exit 1
fi

# Create the worktree on a fresh branch off the current HEAD.
git -C "$REPO_ROOT" worktree add "$DEST" -b "$BRANCH"

# Worktrees do NOT inherit .env.local — copy it or every Supabase call fails.
if [ -f "$REPO_ROOT/.env.local" ]; then
  cp "$REPO_ROOT/.env.local" "$DEST/.env.local"
  echo "✅ copied .env.local into the new worktree"
fi

cat <<EOF

────────────────────────────────────────────────────────────
✅ New Claude Code workspace ready
   Folder:  $DEST
   Branch:  $BRANCH
────────────────────────────────────────────────────────────

NEXT — open a NEW terminal tab and run:

   cd "$DEST"
   npm install            # first time only (separate node_modules)
   claude

⚠️  Only ONE session can use port 3000. In extra sessions, start the dev
    server on another port:
   npm run dev -- -p 3001        # then 3002, 3003, ...

WHEN DONE with this workspace:
   1. Commit + merge the branch back to main (or open a PR), OR discard it.
   2. Remove the worktree so it doesn't pile up on disk:
        git worktree remove "$DEST"
────────────────────────────────────────────────────────────
EOF
