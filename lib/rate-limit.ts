/**
 * Rate limiting with an optional SHARED store (security audit F2).
 *
 * The original limiter was a module-level Map. On Vercel every serverless/edge
 * instance gets its own copy, so the real limit was "N per instance" and reset
 * on every cold start — near-useless against credential stuffing on
 * /api/auth/login.
 *
 * This uses Upstash Redis (REST API — Edge-compatible, no SDK, no TCP) when
 * configured, and transparently falls back to the in-memory Map when it isn't.
 * So it is SAFE TO DEPLOY BEFORE the store exists: behavior is identical to
 * today until the env vars are set, then it becomes a real global limit.
 *
 * To activate (founder): provision Upstash Redis (free tier) via the Vercel
 * Marketplace and add these to the Vercel project env:
 *     UPSTASH_REDIS_REST_URL
 *     UPSTASH_REDIS_REST_TOKEN
 * Nothing else changes — no redeploy of logic needed beyond picking up env.
 *
 * FAIL-OPEN by design: if Redis errors or times out we allow the request. A
 * throttle outage must never lock real users out of the app.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const REDIS_TIMEOUT_MS = 800;

// ── In-memory fallback (per-instance, same as the original behavior) ────────
const memoryMap = new Map<string, { count: number; resetAt: number }>();

function memoryLimited(key: string): boolean {
  const now = Date.now();
  const entry = memoryMap.get(key);

  if (memoryMap.size > 50) {
    for (const [k, v] of memoryMap.entries()) {
      if (now > v.resetAt) memoryMap.delete(k);
    }
  }

  if (!entry || now > entry.resetAt) {
    memoryMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_REQUESTS;
}

// ── Shared store (Upstash Redis REST) ──────────────────────────────────────
function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ''), token };
}

/** True when a shared store is configured (limit is global, not per-instance). */
export function hasSharedRateLimitStore(): boolean {
  return redisConfig() !== null;
}

async function redisLimited(key: string, cfg: { url: string; token: string }): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
  try {
    // Atomic INCR; set the TTL on the first hit so the window slides per key.
    const res = await fetch(`${cfg.url}/incr/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return false; // fail-open
    const body = (await res.json()) as { result?: number };
    const count = Number(body?.result ?? 0);

    if (count === 1) {
      // First request in this window — apply the expiry (fire and forget).
      fetch(`${cfg.url}/expire/${encodeURIComponent(key)}/${Math.ceil(WINDOW_MS / 1000)}`, {
        headers: { Authorization: `Bearer ${cfg.token}` },
        cache: 'no-store',
      }).catch(() => {});
    }
    return count > MAX_REQUESTS;
  } catch {
    return false; // network error / timeout → fail-open
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns true when the caller has exceeded the limit for this key.
 * Uses the shared store when configured, else the in-memory fallback.
 */
export async function isRateLimited(key: string): Promise<boolean> {
  const cfg = redisConfig();
  if (!cfg) return memoryLimited(key);
  return redisLimited(`rl:${key}`, cfg);
}
