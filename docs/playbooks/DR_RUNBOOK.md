# Disaster Recovery Runbook (Jul 5, 2026)

**RPO ~2 min** (Supabase Pro PITR) · **RTO target: 4h** · Trial customer = Patriot; announce via
text to their admin if downtime > 15 min.

## Is it down? Triage in order
1. https://www.pontifexindustries.com/api/health — 200 ok / 503 degraded (says WHICH check failed:
   database, auth, storage). UptimeRobot should page on this URL (founder setup pending).
2. Vercel status: https://www.vercel-status.com · Supabase status: https://status.supabase.com
   — if either is red, it's upstream: post a holding message, wait, don't thrash.
3. Vercel dashboard → deployments: did an outage start at a deploy? → ROLLBACK: promote the
   previous READY deployment (instant redeploy, no git needed) or `git revert` + push.
4. Supabase dashboard → Database → logs/health for connection exhaustion or CPU pegging.

## Database restore (data corruption / bad migration)
1. NEVER restore blind over prod. Supabase → Backups → PITR → restore to a point BEFORE the
   incident into a NEW branch/project first; verify the damaged rows there.
2. If full restore needed: PITR in place (Supabase guided flow), then re-apply any migrations
   made after the restore point (supabase/migrations is the source of truth).
3. If only specific rows: copy them from the restored branch via SQL instead of full restore.
4. ⚠️ RESTORE DRILL: never yet performed — schedule one (restore to branch, verify counts).

## Secrets compromise
Rotate in Vercel env + source: Supabase service key (Settings→API→regenerate), Stripe
(dashboard→roll keys), Resend, CRON_SECRET, Firebase SA. Redeploy after rotation. Founder
holds all consoles; Claude never sees secret values.

## Contacts / consoles
Vercel + Supabase + Stripe + Resend + Play + ASC: founder's accounts (pontifexindustries@gmail.com
/ andres.altamirano1280@gmail.com). Escalation: Supabase Pro support (dashboard ticket).
