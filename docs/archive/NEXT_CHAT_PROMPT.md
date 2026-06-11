# 🚀 Next Chat — Paste This to Resume

Copy everything in the code block below into a fresh Claude Code chat to pick up exactly where we left off (this keeps the new chat fast — the previous one got long).

```
Resume work on the Pontifex Industries platform (concrete-cutting SaaS, Next.js 15 + Supabase + Vercel + Capacitor). Working branch: main.

FIRST: read CLAUDE_HANDOFF.md and CLAUDE.md, then run `git log --oneline -10` and the TaskList tool to see the 23-task roadmap (22 done).

🚨 #1 THING TO CHECK: Is the Vercel deployment promoted and the site fully live?
- Last session pushed 8 commits (origin/main = a57f7678), build READY, but the project showed `live: false` (not promoted) which caused LOGIN to hang on "Signing in…" and /sms-opt-in to 404. The user was promoting the latest deployment + turning OFF Vercel "Pause Projects".
- Verify: curl https://www.pontifexindustries.com/sms-opt-in (should be 200, not 404) and confirm login works. If still broken, the deployment still isn't promoted / functions are degraded — guide the user to Vercel → Deployments → Promote to Production.

💰 BUDGET RULE (critical): ~$13 Vercel build credit left. Each push to main = ~$1–2 build. COMMIT LOCALLY per feature, PUSH ONCE per session, and CONFIRM with the user before pushing. Never push docs-only changes alone. See DEPLOYMENT_COST.md.

WAY OF WORKING (the user wants this rhythm):
- Build + test changes LOCALLY (npm run dev = free, doesn't touch the live site). Production only changes when we push.
- Use PARALLEL sub-agents (Task/Agent tool with subagent_type coder/backend-dev/tester) for independent features — "Rufus"/Ruflo style. Dispatch multiple in ONE message to run concurrently.
- Write Jest tests for risky pure logic (pattern: lib/reminder-timing.test.ts). The user is adamant features must not break.
- Run `npm run build` + `npx tsc --noEmit` to verify before committing. Apply DB migrations via the Supabase MCP (free).
- Update CLAUDE_HANDOFF.md at the end of the session.

REMAINING WORK (priority order):
1. #22 Peer ratings — ops manager creates rating forms; operators↔helpers rate each other in-app (for raises/reviews). Net-new feature.
2. #19 Invoice confirm-flow UI — notification half is done (creator notified on job completion); build the interactive "confirm invoice details → mark ready → admin finalizes/sends" flow.
3. Gated on Apple Developer approval: #2 verify iOS permission usage strings in ios/App/App/Info.plist (location/mic/camera/notifications), #5 TestFlight build + submission. When the user says Apple approved, walk them through generating the APNs key → add 4 env vars (APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_PRIVATE_KEY) to Vercel → native push activates (code already built in lib/send-push.ts).

THIRD-PARTY STATUS:
- Apple Developer: paid, pending approval.
- Twilio toll-free SMS: number +18336954288, creds in Vercel; user submitting toll-free verification with opt-in URL https://www.pontifexindustries.com/sms-opt-in. SMS reminders activate once approved. (Reminders already fall back to in-app + SMS; native push activates after APNs.)
- Reminder: user should rotate the Twilio Auth Token (was shown in a screenshot).

ARCHITECTURE NOTES:
- App = same codebase as website, wrapped in Capacitor. Web updates deploy instantly via Vercel; native/permission changes need an App Store resubmission.
- One Supabase DB shared by local + prod. Additive migrations are safe to apply directly; risky ones use a Supabase database branch first.
- RLS: never use auth.jwt() user_metadata; use SECURITY DEFINER helpers (current_user_has_role, current_user_tenant_id). API auth via lib/api-auth.ts (requireAdmin/requireSalesStaff/etc).

Start by verifying the deployment is live + login works, then ask me whether to start #22 (peer ratings) or #19 (invoice confirm flow).
```

---

## Quick reference (for the human)
- **Live site:** https://www.pontifexindustries.com — login: company code `PATRIOT`
- **If login hangs / site 503s:** Vercel → Deployments → Promote latest to Production; Settings → Billing → Spend Management → "Pause Projects" OFF.
- **Tester accounts:** zack@demopontifex.com / aiden@demopontifex.com (operators), password `Patriot2026!`
- **Budget:** keep pushes to once-per-session.
