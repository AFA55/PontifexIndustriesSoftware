import {
  clampLimit,
  deriveScheduleActionUrl,
  feedItemKey,
  mergeFeed,
  normalizePersonalRow,
  normalizeScheduleRow,
  parseFocusParam,
  type FeedItem,
} from './notifications-feed';

function item(overrides: Partial<FeedItem>): FeedItem {
  return {
    id: 'id',
    source: 'notifications',
    type: 'info',
    title: 't',
    message: null,
    action_url: null,
    is_read: false,
    created_at: '2026-08-01T00:00:00.000Z',
    metadata: null,
    related_entity_type: null,
    related_entity_id: null,
    ...overrides,
  };
}

describe('normalizePersonalRow', () => {
  it('prefers notification_type over the visual-tone type', () => {
    const n = normalizePersonalRow({
      id: 'a',
      type: 'info',
      notification_type: 'timecard_review',
      title: 'T',
      created_at: '2026-07-01T00:00:00Z',
    });
    expect(n.type).toBe('timecard_review');
    expect(n.source).toBe('notifications');
  });

  it('falls back to type, then info', () => {
    expect(
      normalizePersonalRow({ id: 'a', type: 'reminder', created_at: 'x' }).type
    ).toBe('reminder');
    expect(normalizePersonalRow({ id: 'a', created_at: 'x' }).type).toBe('info');
  });

  it('treats EITHER is_read or legacy read as read', () => {
    const base = { id: 'a', title: 'T', created_at: 'x' };
    expect(normalizePersonalRow({ ...base, is_read: true, read: false }).is_read).toBe(true);
    expect(normalizePersonalRow({ ...base, is_read: false, read: true }).is_read).toBe(true);
    expect(normalizePersonalRow({ ...base, is_read: null, read: null }).is_read).toBe(false);
    expect(normalizePersonalRow({ ...base, is_read: false, read: false }).is_read).toBe(false);
  });

  it('passes through action_url and related entity fields', () => {
    const n = normalizePersonalRow({
      id: 'a',
      title: 'T',
      created_at: 'x',
      action_url: '/dashboard/timecard',
      related_entity_type: 'feedback_submission',
      related_entity_id: 'fb1',
    });
    expect(n.action_url).toBe('/dashboard/timecard');
    expect(n.related_entity_type).toBe('feedback_submission');
    expect(n.related_entity_id).toBe('fb1');
  });
});

describe('normalizeScheduleRow', () => {
  it('normalizes read flag and derives action_url from type', () => {
    const n = normalizeScheduleRow({
      id: 's1',
      type: 'auto_clock_out',
      title: 'Auto clocked out',
      message: 'You were automatically clocked out at 6pm because ...',
      read: false,
      created_at: '2026-07-30T01:00:00Z',
      job_order_id: 'jo1',
    });
    expect(n.source).toBe('schedule');
    expect(n.is_read).toBe(false);
    expect(n.action_url).toBe('/dashboard/timecard');
    expect(n.related_entity_type).toBe('job_order');
    expect(n.related_entity_id).toBe('jo1');
  });

  it('read=true maps to is_read', () => {
    expect(
      normalizeScheduleRow({ id: 's', read: true, created_at: 'x' }).is_read
    ).toBe(true);
  });
});

describe('deriveScheduleActionUrl', () => {
  it('maps clock types to timecard pages', () => {
    expect(deriveScheduleActionUrl('auto_clock_out')).toBe('/dashboard/timecard');
    expect(deriveScheduleActionUrl('late_arrival')).toBe('/dashboard/timecard');
    expect(deriveScheduleActionUrl('auto_clock_out_admin')).toBe('/dashboard/admin/timecards');
  });

  it('maps job types to my-jobs', () => {
    expect(deriveScheduleActionUrl('job_assigned')).toBe('/dashboard/my-jobs');
    expect(deriveScheduleActionUrl('assigned')).toBe('/dashboard/my-jobs');
    expect(deriveScheduleActionUrl('dispatched')).toBe('/dashboard/my-jobs');
  });

  it('returns null for unknown types', () => {
    expect(deriveScheduleActionUrl('missing_info')).toBeNull();
    expect(deriveScheduleActionUrl(null)).toBeNull();
    expect(deriveScheduleActionUrl(undefined)).toBeNull();
  });
});

describe('mergeFeed', () => {
  const a1 = item({ id: 'a1', created_at: '2026-08-01T10:00:00Z' });
  const a2 = item({ id: 'a2', created_at: '2026-08-01T08:00:00Z' });
  const s1 = item({ id: 's1', source: 'schedule', created_at: '2026-08-01T09:00:00Z' });
  const s2 = item({ id: 's2', source: 'schedule', created_at: '2026-08-01T07:00:00Z' });

  it('merge-sorts desc by created_at across sources', () => {
    const { items } = mergeFeed([[a1, a2], [s1, s2]], 10);
    expect(items.map(i => i.id)).toEqual(['a1', 's1', 'a2', 's2']);
  });

  it('truncates to limit and reports has_more + next_cursor', () => {
    const { items, has_more, next_cursor } = mergeFeed([[a1, a2], [s1, s2]], 3);
    expect(items.map(i => i.id)).toEqual(['a1', 's1', 'a2']);
    expect(has_more).toBe(true);
    expect(next_cursor).toBe('2026-08-01T08:00:00Z');
  });

  it('has_more=false and null cursor when everything fits', () => {
    const { has_more, next_cursor } = mergeFeed([[a1], [s1]], 5);
    expect(has_more).toBe(false);
    expect(next_cursor).toBeNull();
  });

  it('handles empty inputs', () => {
    const { items, has_more, next_cursor } = mergeFeed([[], []], 5);
    expect(items).toEqual([]);
    expect(has_more).toBe(false);
    expect(next_cursor).toBeNull();
  });

  it('is stable on identical timestamps (tie-broken by id)', () => {
    const x = item({ id: 'x', created_at: '2026-08-01T10:00:00Z' });
    const y = item({ id: 'y', created_at: '2026-08-01T10:00:00Z' });
    const one = mergeFeed([[x], [y]], 5).items.map(i => i.id);
    const two = mergeFeed([[y], [x]], 5).items.map(i => i.id);
    expect(one).toEqual(two);
  });
});

describe('clampLimit', () => {
  it('defaults to 20 on missing/garbage', () => {
    expect(clampLimit(null)).toBe(20);
    expect(clampLimit('abc')).toBe(20);
    expect(clampLimit('0')).toBe(20);
    expect(clampLimit('-5')).toBe(20);
  });
  it('caps at 50 and passes valid values', () => {
    expect(clampLimit('15')).toBe(15);
    expect(clampLimit('500')).toBe(50);
  });
});

describe('parseFocusParam', () => {
  it('parses source:id pairs', () => {
    expect(parseFocusParam('schedule:abc-123')).toEqual({ source: 'schedule', id: 'abc-123' });
    expect(parseFocusParam('notifications:n1')).toEqual({ source: 'notifications', id: 'n1' });
  });
  it('bare id defaults to notifications', () => {
    expect(parseFocusParam('n1')).toEqual({ source: 'notifications', id: 'n1' });
  });
  it('rejects unknown sources and empties', () => {
    expect(parseFocusParam('bogus:n1')).toBeNull();
    expect(parseFocusParam('schedule:')).toBeNull();
    expect(parseFocusParam('')).toBeNull();
    expect(parseFocusParam(null)).toBeNull();
  });
});

describe('feedItemKey', () => {
  it('namespaces by source', () => {
    expect(feedItemKey({ source: 'schedule', id: 'x' })).toBe('schedule:x');
    expect(feedItemKey({ source: 'notifications', id: 'x' })).toBe('notifications:x');
  });
});
