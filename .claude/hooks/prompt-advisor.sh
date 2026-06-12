#!/bin/bash
# prompt-advisor — UserPromptSubmit hook (Pontifex).
# Reads the founder's prompt, pattern-matches intent, and injects SHORT
# project-specific command/skill pointers as additionalContext so Claude
# reaches for the right procedure without the founder knowing magic words.
# Silent (no output) when nothing matches. Keep suggestions to one line each —
# this text costs context tokens on every matching prompt.

PROMPT=$(jq -r '.prompt // empty' 2>/dev/null | tr '[:upper:]' '[:lower:]')
[ -z "$PROMPT" ] && exit 0

S=""
add() { S="${S}${S:+ | }$1"; }

case "$PROMPT" in *"bug"*|*"broken"*|*"not work"*|*"doesnt work"*|*"doesn't work"*|*"error"*|*"crash"*|*"fail"*|*"issue"*)
  add "Bugs → triage into BACKLOG.md (P0-P3), fix top-down with builders+guardian-review, batch into ONE push";; esac
case "$PROMPT" in *"push"*|*"deploy"*|*"go live"*|*"ship it"*|*"production"*)
  add "Deploy → prod-deploy skill gate (clean build+tsc+jest) first; /vercel-plugin:deploy + /vercel-plugin:status available; one push per session";; esac
case "$PROMPT" in *"env var"*|*"environment variable"*|*"api key"*|*"secret"*|*" dsn"*)
  add "Env vars → /vercel-plugin:env or 'vercel env' (CLI authed); Claude never types secret VALUES — founder pastes";; esac
case "$PROMPT" in *"design"*|*"restyle"*|*"aesthetic"*|*"landing"*|*"homepage"*|*"make it look"*|*"ui "*|*" ui"*)
  add "UI work → frontend-design skill (any screen); design-taste (marketing/landing only); pontifex-brand (Pontifex-branded assets)";; esac
case "$PROMPT" in *"app store"*|*"testflight"*|*"ios build"*|*"xcode"*|*"submit"*)
  add "iOS release → ios-release skill (manual signing, NEW version number rule, Transporter/ASC steps)";; esac
case "$PROMPT" in *"invite"*|*"email"*|*"resend"*)
  add "Email → lib/email.ts ONLY (getResendApiKey/DEFAULT_EMAIL_FROM/generateInviteEmail); verified domain = admin.pontifexindustries.com";; esac
case "$PROMPT" in *"where are we"*|*"status"*|*"progress"*|*"catch me up"*)
  add "Status → read BACKLOG.md STATUS table + CLAUDE_HANDOFF.md top; report shipped/in-flight/blocked-on-founder";; esac
case "$PROMPT" in *"migration"*|*"table"*|*"column"*|*"database"*|*" rls"*)
  add "DB → additive+idempotent migration, tenant_id + RLS via SECURITY DEFINER helpers (NEVER user_metadata), apply via Supabase MCP";; esac
case "$PROMPT" in *"review"*|*"verify"*|*"audit"*|*"check the"*|*"make sure"*)
  add "Verification → guardian-review skill / reviewer agent behind every builder; BLOCKING findings get fixed + re-reviewed";; esac
case "$PROMPT" in *"new feature"*|*"i want to build"*|*"can we add"*|*"create a"*)
  add "New feature → outcomes-first brief; plan doc in docs/plans/ if multi-session; log in BACKLOG.md; builders+guardian";; esac

[ -z "$S" ] && exit 0

jq -cn --arg ctx "[PONTIFEX ADVISOR] $S" \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$ctx}}'
