# Backup, Duplication & Cloud Strategy — Jun 2026
**Why:** as the platform grows and hosts real customer data (Patriot, soon others), we must **never lose information** and must keep **duplicates in the cloud**. This doc defines what to back up, where, how often, and how to restore. **Status:** PLAN — set up next session (some steps need founder action / possible Supabase plan upgrade).

> Three things to protect: **(1) Code, (2) Database, (3) Stored files** (photos, signatures, voice notes, PDFs). Each needs its own cloud backup.

---

## 1. Code — GitHub (already cloud, make it disciplined)
- **Primary:** GitHub `AFA55/PontifexIndustriesSoftware` (cloud, versioned). ✅ already in place.
- **Add discipline:**
  - **Tag every shipped milestone:** `git tag -a v1.0.2 -m "..." && git push --tags` (we ship versions but don't tag — start now: v1.0.1, v1.0.2).
  - **Protect `main`** (GitHub branch protection): no force-push, require the build to pass.
  - **Monthly full archive:** `git bundle create pontifex-YYYYMM.bundle --all` → store in cloud drive (offsite duplicate independent of GitHub).
  - **Optional private mirror** to a second remote (e.g., GitLab/Bitbucket) for provider redundancy: `git remote add mirror <url>; git push mirror --all`.
- **Native iOS:** archives/IPAs + `ExportOptions.plist` — keep the signing assets backed up (provisioning profile expires 2027/05/24); document in `APP_CHANGES.md`.

## 2. Database — Supabase (the critical, irreplaceable data)
Project `klatddoyncxidgqtcjnu`. This is the highest-risk asset (timecards = legal payroll, jobs, customers).
- **Enable Supabase managed backups / PITR** — *requires Pro plan*. Pro = daily automated backups + Point-In-Time-Recovery (restore to any moment). **🔴 Founder action: confirm/upgrade plan.** Without it, free-tier backups are limited.
- **Independent offsite dumps (do regardless of plan):**
  - Weekly `pg_dump` (or Supabase CLI `supabase db dump`) → encrypted file → cloud storage (Google Drive / S3 / Backblaze B2).
  - Could be a scheduled GitHub Action or a `/api/cron/db-backup` (Vercel cron) that dumps + uploads. (Mind secrets: use service-role key server-side only.)
  - Keep ≥ 8 weekly + 6 monthly snapshots (GFS rotation).
- **Before any risky migration:** create a Supabase **Database Branch** first (already the convention in `CLAUDE.md`) — that's a built-in pre-change duplicate.
- **Restore drill:** once, restore a dump into a Supabase branch and verify row counts — an untested backup isn't a backup.

## 3. Stored files — Supabase Storage buckets
Photos (clock-in/out selfies), customer signatures, `voice-checkouts`, generated PDFs.
- Confirm bucket privacy (non-public) ✅ and **back up bucket contents**: periodic sync to cloud storage (`supabase storage` CLI or a rclone/S3 sync job) on the same weekly cadence.
- Note retention/legal needs (signatures + timecards may be legally required to retain).

## 4. Cloud platforms summary (the "save in some cloud" answer)
| Asset | Primary cloud | Duplicate (offsite) |
|---|---|---|
| Code | GitHub | Monthly `git bundle` → Drive/B2 + optional GitLab mirror |
| Database | Supabase (Pro PITR) | Weekly `pg_dump` → S3/Drive/B2 (encrypted) |
| Stored files | Supabase Storage | Weekly bucket sync → S3/Drive/B2 |
| Native build assets | Local + `APP_CHANGES.md` | Cloud drive copy of IPA + profiles |

## 5. Cadence (proposed)
- **Each session:** commit; push once; tag if a version shipped.
- **Weekly (automated):** DB dump + storage sync → cloud bucket.
- **Monthly:** full repo bundle + verify a restore.
- **Before risky migration:** Supabase DB branch.

## 6. Action items
- [ ] 🔴 Founder: confirm/upgrade Supabase plan for daily backups + PITR.
- [ ] Pick the offsite cloud target (S3 / Backblaze B2 / Google Drive) + create a bucket.
- [ ] Build the weekly DB-dump + storage-sync job (GitHub Action or Vercel cron) with secrets.
- [ ] Start tagging releases; add branch protection on `main`.
- [ ] Do one restore drill; document the exact restore steps here.
- [ ] (Stretch) second git remote mirror.
