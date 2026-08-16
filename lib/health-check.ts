/**
 * The timing rules behind /api/health, kept pure so they can be tested without
 * a network.
 *
 * WHY THIS EXISTS. The health endpoint ran three Supabase checks IN SERIES with
 * no timeout on any of them. During the Aug 16 Supabase degradation each call
 * hung for roughly 25 seconds, so the endpoint took over a minute and died at
 * the gateway: 46 of 46 requests returned 504 in fifteen minutes. It never
 * once managed to report "degraded" — the one thing it exists to say.
 *
 * A health check that goes down with the thing it is checking is not a health
 * check. It has to answer FAST and HONESTLY, especially when the answer is bad,
 * because that is precisely when someone is looking at it.
 *
 * Three rules:
 *   1. Every check gets a hard deadline. A check that has not answered in
 *      CHECK_TIMEOUT_MS has told us what we needed to know.
 *   2. Checks run in PARALLEL, so the endpoint costs one timeout, not three.
 *   3. The endpoint always returns. A timed-out check is a REPORTED failure,
 *      never a hung request.
 */

/** A single check may not exceed this. Well under any gateway limit. */
export const CHECK_TIMEOUT_MS = 3000;
/** Slower than this while still answering is "degraded", not "ok". */
export const DEGRADED_LATENCY_MS = 2000;

export type CheckStatus = 'ok' | 'degraded' | 'down';

export interface CheckResult {
  status: CheckStatus;
  latency_ms: number;
  error?: string;
}

/**
 * Run one check under a deadline. Resolves — never rejects and never hangs —
 * so one sick dependency cannot take the endpoint with it.
 */
export async function timedCheck(
  fn: () => Promise<{ error?: { message: string } | null }>,
  timeoutMs: number = CHECK_TIMEOUT_MS,
  now: () => number = Date.now
): Promise<CheckResult> {
  const start = now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    const latency = now() - start;
    if (result?.error) {
      return { status: 'down', latency_ms: latency, error: result.error.message };
    }
    return {
      status: latency > DEGRADED_LATENCY_MS ? 'degraded' : 'ok',
      latency_ms: latency,
    };
  } catch (e) {
    return { status: 'down', latency_ms: now() - start, error: (e as Error).message };
  }
}

/**
 * The overall verdict. `down` if anything is down, `degraded` if anything is
 * slow, `healthy` only when everything is genuinely fine — an amber that reads
 * green is worse than no light at all.
 */
export function overallStatus(checks: Record<string, CheckResult>): 'healthy' | 'degraded' | 'down' {
  const values = Object.values(checks);
  if (values.length === 0) return 'down';
  if (values.some((c) => c.status === 'down')) return 'down';
  if (values.some((c) => c.status === 'degraded')) return 'degraded';
  return 'healthy';
}

/**
 * The HTTP status an uptime monitor will act on. 503 for down, 200 for degraded
 * — a slow-but-serving platform should not page anyone at 3am, and the body
 * still carries the detail for anyone looking.
 */
export function httpStatusFor(status: 'healthy' | 'degraded' | 'down'): number {
  return status === 'down' ? 503 : 200;
}
