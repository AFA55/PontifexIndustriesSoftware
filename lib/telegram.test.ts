import {
  escapeMarkdownV2,
  escapeCodeSpan,
  formatAlert,
  alertFingerprint,
  telegramConfigFromEnv,
} from './telegram';

describe('escapeCodeSpan', () => {
  it('escapes ONLY backtick and backslash', () => {
    // Telegram's MarkdownV2 allows only these two inside a `code` entity.
    // Escaping anything else there makes it reject the whole message with a
    // 400 — and the alert silently never arrives, which is the worst possible
    // failure for an alerting channel.
    expect(escapeCodeSpan('a`b\\c')).toBe('a\\`b\\\\c');
  });

  it('leaves a route path alone', () => {
    // Every source this reports on is a path full of dots, dashes, slashes and
    // brackets. Running the full escape set over these was the bug.
    expect(escapeCodeSpan('/api/admin/jobs/[id]/work-ticket')).toBe(
      '/api/admin/jobs/[id]/work-ticket'
    );
    expect(escapeCodeSpan('https://www.pontifexindustries.com/x_y.z')).toBe(
      'https://www.pontifexindustries.com/x_y.z'
    );
  });
});

describe('escapeMarkdownV2', () => {
  it('escapes every character Telegram rejects a message for', () => {
    // A single unescaped '.' or '-' makes the API return 400 and the alert
    // never arrives — the failure mode is silence, which is the one thing an
    // alerting channel must not have.
    const escaped = escapeMarkdownV2('a.b-c!d(e)f[g]h{i}j+k=l|m~n`o>p#q_r*s\\t');
    for (const ch of '.-!()[]{}+=|~`>#_*\\') {
      expect(escaped).toContain(`\\${ch}`);
    }
  });

  it('leaves ordinary words alone', () => {
    expect(escapeMarkdownV2('Clock in failing for 3 operators')).toBe(
      'Clock in failing for 3 operators'
    );
  });

  it('handles a real error string end to end', () => {
    const msg = escapeMarkdownV2('TypeError: cannot read [0] of undefined (at line 3.14)');
    expect(msg).not.toMatch(/(?<!\\)\./);
    expect(msg).not.toMatch(/(?<!\\)\[/);
  });
});

describe('formatAlert', () => {
  it('leads with what is wrong, not with a code', () => {
    const msg = formatAlert({
      level: 'critical',
      title: 'Clock-in failing',
      detail: 'Three operators could not clock in this morning.',
    });
    expect(msg.split('\n')[0]).toContain('Clock\\-in failing');
    expect(msg).toContain('🚨');
  });

  it('includes where it happened and how often', () => {
    const msg = formatAlert({
      level: 'error',
      title: 'Helper logs failing',
      detail: 'Every request returns 500.',
      source: '/api/admin/jobs/[id]/helper-logs',
      count: 64,
    });
    expect(msg).toContain('/api/admin/jobs/[id]/helper-logs');
    expect(msg).toContain('64 times');
  });

  it('omits the repeat line for a one-off', () => {
    const msg = formatAlert({ level: 'info', title: 'T', detail: 'D', count: 1 });
    expect(msg).not.toContain('times');
  });

  it('escapes the detail, so an error message cannot break the send', () => {
    const msg = formatAlert({
      level: 'error',
      title: 'Save failed',
      detail: 'Could not write work_items (job 2026-424813).',
    });
    expect(msg).toContain('work\\_items');
    expect(msg).toContain('\\(job 2026\\-424813\\)');
  });
});

describe('alertFingerprint', () => {
  it('is identical for the same fault repeating', () => {
    // 64 identical failures must arrive ONCE. Flooding the channel is the
    // fastest way to make the founder mute it, and a muted channel is the same
    // as the hub he already does not check.
    const a = alertFingerprint({ level: 'error', title: 'Helper logs failing', source: '/api/x' });
    const b = alertFingerprint({ level: 'error', title: 'Helper logs failing', source: '/api/x' });
    expect(a).toBe(b);
  });

  it('separates different faults, sources and severities', () => {
    const base = { level: 'error' as const, title: 'Failing', source: '/api/x' };
    expect(alertFingerprint(base)).not.toBe(alertFingerprint({ ...base, source: '/api/y' }));
    expect(alertFingerprint(base)).not.toBe(alertFingerprint({ ...base, title: 'Other' }));
    expect(alertFingerprint(base)).not.toBe(alertFingerprint({ ...base, level: 'critical' }));
  });

  it('does not vary on counts, ids or time', () => {
    // Otherwise every occurrence looks new and dedupe never fires.
    const a = alertFingerprint({ level: 'error', title: 'Save failed', source: '/api/x' });
    const b = alertFingerprint({ level: 'error', title: 'Save failed', source: '/api/x' });
    expect(a).toBe(b);
    expect(a).not.toMatch(/\d{10,}/);
  });

  it('stays short enough for a dedupe key column', () => {
    const long = alertFingerprint({ level: 'error', title: 'x'.repeat(500), source: 'y'.repeat(500) });
    expect(long.length).toBeLessThanOrEqual(180);
  });
});

describe('telegramConfigFromEnv', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('returns null when not configured, so alerting is simply off', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_ALERT_CHAT_ID;
    expect(telegramConfigFromEnv()).toBeNull();
  });

  it('requires BOTH the token and the chat id', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'abc';
    delete process.env.TELEGRAM_ALERT_CHAT_ID;
    expect(telegramConfigFromEnv()).toBeNull();
  });

  it('reads both when present', () => {
    process.env.TELEGRAM_BOT_TOKEN = 'abc';
    process.env.TELEGRAM_ALERT_CHAT_ID = '123';
    expect(telegramConfigFromEnv()).toEqual({ botToken: 'abc', chatId: '123' });
  });
});
