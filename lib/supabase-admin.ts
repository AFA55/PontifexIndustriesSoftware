/**
 * Supabase Admin Client
 * Uses service_role key for admin operations (bypasses RLS)
 * ONLY use this server-side (API routes, server components)
 *
 * ── BACKUP & RESILIENCE STRATEGY ────────────────────────────────────────────
 *
 * Automated Backups (Supabase Pro):
 *   - Daily automated backups with 7-day retention (Supabase managed)
 *   - Point-in-Time Recovery (PITR) available on Pro plan — contact Supabase
 *     support to enable; allows restore to any second within the retention window
 *   - Manual snapshot: Supabase Dashboard → Project Settings → Backups
 *   - pg_dump export: available via Supabase Dashboard → Database → Backups
 *
 * Connection Pooling:
 *   - Supabase's built-in PgBouncer pooler is used automatically
 *   - Transaction mode pooling for serverless/edge environments (Vercel)
 *   - Session mode pooling for long-lived server processes if needed
 *   - Connection URL format: postgres://[user]:[pass]@[host]:6543/[db]?pgbouncer=true
 *
 * Disaster Recovery:
 *   - RTO (Recovery Time Objective): ~15 min with PITR or latest daily backup
 *   - RPO (Recovery Point Objective): ~24h without PITR; ~seconds with PITR
 *   - Failover: Supabase Pro includes read replicas; contact support to configure
 *
 * Monitoring:
 *   - GET /api/health — public health check (DB + auth + storage latency)
 *   - GET /api/cron/health-check — daily cron writes to system_health_log table
 * ────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';

// Environment variables required — placeholder URL keeps build & static generation working
// Real env vars are set on Vercel and in .env.local for local dev
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || 'placeholder-key';

/**
 * Admin client with full privileges
 * - Bypasses Row Level Security (RLS)
 * - Can create/delete users
 * - Can perform any database operation
 *
 * NEVER expose this client to the frontend!
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
