import {
  timedCheck,
  overallStatus,
  httpStatusFor,
  CHECK_TIMEOUT_MS,
  DEGRADED_LATENCY_MS,
  type CheckResult,
} from './health-check';

const ok = (): CheckResult => ({ status: 'ok', latency_ms: 10 });

describe('timedCheck', () => {
  it('reports ok for a fast, clean check', async () => {
    const r = await timedCheck(async () => ({ error: null }));
    expect(r.status).toBe('ok');
  });

  it('reports down when the dependency returns an error', async () => {
    const r = await timedCheck(async () => ({ error: { message: 'connection refused' } }));
    expect(r.status).toBe('down');
    expect(r.error).toContain('connection refused');
  });

  it('GIVES UP rather than hanging — the whole point', async () => {
    // The endpoint ran three checks in series with no timeout. During the
    // Aug 16 Supabase degradation each hung ~25s, so all 46 requests in fifteen
    // minutes died at the gateway with a 504 and it never once reported
    // "degraded" — the one thing it exists to say.
    const start = Date.now();
    const r = await timedCheck(() => new Promise(() => {}), 50);
    expect(r.status).toBe('down');
    expect(r.error).toMatch(/timed out/);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('never rejects, so one sick dependency cannot take the endpoint down', async () => {
    await expect(timedCheck(async () => { throw new Error('boom'); })).resolves.toMatchObject({
      status: 'down',
    });
  });

  it('calls a slow-but-answering dependency degraded, not ok', async () => {
    let t = 1000;
    const clock = () => t;
    const r = await timedCheck(
      async () => { t += DEGRADED_LATENCY_MS + 1; return { error: null }; },
      CHECK_TIMEOUT_MS,
      clock
    );
    expect(r.status).toBe('degraded');
  });

  it('records how long it actually took', async () => {
    let t = 500;
    const r = await timedCheck(async () => { t += 42; return { error: null }; }, 3000, () => t);
    expect(r.latency_ms).toBe(42);
  });

  it('defaults to a deadline well under any gateway limit', () => {
    expect(CHECK_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });
});

describe('overallStatus', () => {
  it('is healthy only when everything genuinely is', () => {
    expect(overallStatus({ db: ok(), auth: ok() })).toBe('healthy');
  });

  it('reports down if ANY dependency is down', () => {
    expect(
      overallStatus({ db: ok(), auth: { status: 'down', latency_ms: 3000 } })
    ).toBe('down');
  });

  it('reports degraded if anything is slow — an amber that reads green is worse than no light', () => {
    expect(
      overallStatus({ db: ok(), auth: { status: 'degraded', latency_ms: 2500 } })
    ).toBe('degraded');
  });

  it('prefers down over degraded when both are present', () => {
    expect(
      overallStatus({
        a: { status: 'degraded', latency_ms: 2500 },
        b: { status: 'down', latency_ms: 3000 },
      })
    ).toBe('down');
  });

  it('treats "no checks ran" as down, not healthy', () => {
    expect(overallStatus({})).toBe('down');
  });
});

describe('httpStatusFor', () => {
  it('503s only for down, so a slow platform does not page anyone at 3am', () => {
    expect(httpStatusFor('down')).toBe(503);
    expect(httpStatusFor('degraded')).toBe(200);
    expect(httpStatusFor('healthy')).toBe(200);
  });
});
