import { workItemDetailLine } from './work-items-format';
import {
  allPrintedWork,
  buildTicketDays,
  enrichFromLoggedWork,
  isShopCard,
  ticketWorkDetail,
  workTypeUnit,
  datesWorked,
  defaultAnchorDate,
  grandTotalHours,
  inRange,
  normalizeLoggedWork,
  resolveCrewRoles,
  resolveWorkItemDate,
  sumFootage,
  ticketRange,
  workItemCores,
  workItemLinearFeet,
  type TicketDailyLog,
  type TicketTimecardRow,
  type TicketWorkItem,
} from './work-ticket';

const ZACK = '11111111-1111-1111-1111-111111111111';
const LUCAS = '22222222-2222-2222-2222-222222222222';
const NEW_GUY = '33333333-3333-3333-3333-333333333333';

const names = new Map<string, string | null>([
  [ZACK, 'Zack'],
  [LUCAS, 'Lucas'],
  [NEW_GUY, 'Trey'],
]);

const roles = resolveCrewRoles({ assigned_to: ZACK, helper_assigned_to: LUCAS });

describe('ticketRange', () => {
  it('day mode covers just the anchor date', () => {
    expect(ticketRange('day', '2026-07-30')).toEqual({ from: '2026-07-30', to: '2026-07-30' });
  });

  it('week mode covers Mon–Sun around the anchor', () => {
    // 2026-07-30 is a Thursday → Mon Jul 27 … Sun Aug 2.
    expect(ticketRange('week', '2026-07-30')).toEqual({ from: '2026-07-27', to: '2026-08-02' });
  });

  it('week mode treats Sunday as the END of the week, not the start', () => {
    expect(ticketRange('week', '2026-08-02')).toEqual({ from: '2026-07-27', to: '2026-08-02' });
  });

  it('inRange is inclusive on both ends', () => {
    const r = ticketRange('week', '2026-07-30');
    expect(inRange('2026-07-27', r)).toBe(true);
    expect(inRange('2026-08-02', r)).toBe(true);
    expect(inRange('2026-08-03', r)).toBe(false);
    expect(inRange(null, r)).toBe(false);
  });
});

describe('defaultAnchorDate', () => {
  it('prefers today when the crew worked today', () => {
    expect(defaultAnchorDate(['2026-07-30', '2026-07-31'], '2026-07-31')).toBe('2026-07-31');
  });

  it('falls back to the LAST day worked when today is idle', () => {
    expect(defaultAnchorDate(['2026-07-30', '2026-07-31'], '2026-08-05')).toBe('2026-07-31');
  });

  it('uses the first future day when the job has not started', () => {
    expect(defaultAnchorDate(['2026-09-01'], '2026-08-05')).toBe('2026-09-01');
  });

  it('falls back to today when nothing has been worked', () => {
    expect(defaultAnchorDate([], '2026-08-05')).toBe('2026-08-05');
  });
});

describe('resolveCrewRoles', () => {
  it('labels the lead, the helper and job_crew members', () => {
    const m = resolveCrewRoles({
      assigned_to: ZACK,
      helper_assigned_to: LUCAS,
      crew: [{ user_id: NEW_GUY, role: 'operator' }],
    });
    expect(m.get(ZACK)).toBe('lead');
    expect(m.get(LUCAS)).toBe('helper');
    expect(m.get(NEW_GUY)).toBe('operator');
  });

  it('never lets a stale job_crew row demote the lead', () => {
    const m = resolveCrewRoles({
      assigned_to: ZACK,
      crew: [{ user_id: ZACK, role: 'helper' }],
    });
    expect(m.get(ZACK)).toBe('lead');
  });
});

describe('resolveWorkItemDate', () => {
  const logs: TicketDailyLog[] = [
    { id: 'log-a', operator_id: ZACK, log_date: '2026-07-31', day_number: 1 },
    { id: 'log-b', operator_id: LUCAS, log_date: '2026-07-30', day_number: 1 },
  ];

  it('1. uses daily_log_id when present', () => {
    expect(
      resolveWorkItemDate({ id: 'w', daily_log_id: 'log-b', operator_id: ZACK, day_number: 1 }, logs)
    ).toBe('2026-07-30');
  });

  it('2. matches the same operator + day_number', () => {
    expect(resolveWorkItemDate({ id: 'w', operator_id: ZACK, day_number: 1 }, logs)).toBe('2026-07-31');
    expect(resolveWorkItemDate({ id: 'w', operator_id: LUCAS, day_number: 1 }, logs)).toBe('2026-07-30');
  });

  it('3. falls back to any log with that day_number ONLY when unattributed', () => {
    expect(resolveWorkItemDate({ id: 'w', operator_id: null, day_number: 1 }, logs)).toBe('2026-07-31');
  });

  it('3. REFUSES another operator\'s log date for an attributed item', () => {
    // day_number is job-level on the log but client-supplied on the item, so on
    // a crew day this would date NEW_GUY's work off Zack's log. Blank > wrong.
    expect(resolveWorkItemDate({ id: 'w', operator_id: NEW_GUY, day_number: 1 }, logs)).toBeNull();
  });

  it('3. an attributed item still falls through to its own created_at', () => {
    const d = new Date(2026, 6, 20, 9, 0);
    expect(
      resolveWorkItemDate({ id: 'w', operator_id: NEW_GUY, day_number: 1, created_at: d.toISOString() }, logs)
    ).toBe('2026-07-20');
  });

  it('4. falls back to the LOCAL date of created_at (never the UTC date)', () => {
    const d = new Date(2026, 6, 15, 22, 30); // Jul 15 2026, 10:30pm LOCAL
    expect(resolveWorkItemDate({ id: 'w', created_at: d.toISOString() }, [])).toBe('2026-07-15');
  });

  it('returns null when nothing resolves', () => {
    expect(resolveWorkItemDate({ id: 'w' }, [])).toBeNull();
  });
});

describe('normalizeLoggedWork', () => {
  it('maps the daily-log work_performed shape onto WorkItemLike', () => {
    const out = normalizeLoggedWork([{ type: 'WALL SAW', depth: 6, quantity: 54, notes: null }]);
    expect(out).toHaveLength(1);
    expect(out[0].work_type).toBe('WALL SAW');
    expect(out[0].quantity).toBe(54);
    expect(out[0].cut_depth_inches).toBe(6);
  });

  it('reads the offline `details` alias into details_json', () => {
    const out = normalizeLoggedWork([{ type: 'Core Drilling', details: { holes: [{ quantity: 2, bitSize: '4' }] } }]);
    expect((out[0].details_json as { holes: unknown[] }).holes).toHaveLength(1);
  });

  it('tolerates a non-array payload', () => {
    expect(normalizeLoggedWork(null)).toEqual([]);
    expect(normalizeLoggedWork({ nope: true })).toEqual([]);
  });
});

describe('buildTicketDays', () => {
  // Mirrors prod job QA-2026-718910: Zack (lead) + Lucas (helper), 7/30 + 7/31,
  // Zack has TWO cards on 7/30 (a bad clock-out then a re-clock).
  const timecards: TicketTimecardRow[] = [
    { id: 't1', user_id: LUCAS, date: '2026-07-30', clock_in_time: '2026-07-30T11:05:12Z', clock_out_time: '2026-07-30T21:19:16Z', lunch_duration_minutes: 30, net_hours: 9.73, total_hours: 9.73 },
    { id: 't2', user_id: ZACK, date: '2026-07-30', clock_in_time: '2026-07-30T11:11:51Z', clock_out_time: '2026-07-30T22:30:00Z', lunch_duration_minutes: 30, net_hours: 10.8, total_hours: 10.8 },
    { id: 't3', user_id: ZACK, date: '2026-07-30', clock_in_time: '2026-07-30T22:33:01Z', clock_out_time: '2026-07-30T22:33:41Z', lunch_duration_minutes: 0, net_hours: 0.01, total_hours: 0.01 },
    { id: 't4', user_id: LUCAS, date: '2026-07-31', clock_in_time: '2026-07-31T10:57:15Z', clock_out_time: '2026-07-31T20:46:10Z', lunch_duration_minutes: 30, net_hours: 9.32, total_hours: 9.32 },
    { id: 't5', user_id: ZACK, date: '2026-07-31', clock_in_time: '2026-07-31T11:02:00Z', clock_out_time: '2026-07-31T19:23:54Z', lunch_duration_minutes: 30, net_hours: 7.87, total_hours: 7.87 },
  ];
  const logs: TicketDailyLog[] = [
    {
      id: 'log-1',
      operator_id: ZACK,
      log_date: '2026-07-31',
      day_number: 1,
      hours_worked: 7.87,
      work_performed: [{ type: 'WALL SAW', depth: 6, quantity: 54 }],
      notes: 'Job complete.',
    },
  ];
  const workItems: TicketWorkItem[] = [
    { id: 'wi-1', operator_id: ZACK, day_number: 1, work_type: 'WALL SAW', quantity: 54, linear_feet_cut: 54, cut_depth_inches: 6 },
  ];

  const build = (mode: 'day' | 'week', anchor: string) =>
    buildTicketDays({
      range: ticketRange(mode, anchor),
      timecards,
      logs,
      workItems,
      roles,
      names,
      fallbackOperatorId: ZACK,
    });

  it('DAY mode returns only the chosen date', () => {
    const days = build('day', '2026-07-30');
    expect(days.map((d) => d.date)).toEqual(['2026-07-30']);
  });

  it('WEEK mode returns every worked day in the Mon–Sun window', () => {
    const days = build('week', '2026-07-30');
    expect(days.map((d) => d.date)).toEqual(['2026-07-30', '2026-07-31']);
  });

  it('separates a day BY OPERATOR, lead first then helper', () => {
    const [day] = build('day', '2026-07-31');
    expect(day.people.map((p) => [p.name, p.role])).toEqual([
      ['Zack', 'lead'],
      ['Lucas', 'helper'],
    ]);
  });

  it('collapses multiple cards for one person into one row (earliest in, latest out, summed)', () => {
    const [day] = build('day', '2026-07-30');
    const zack = day.people.find((p) => p.user_id === ZACK)!;
    expect(zack.clock_in).toBe('2026-07-30T11:11:51Z');
    expect(zack.clock_out).toBe('2026-07-30T22:33:41Z');
    expect(zack.hours).toBe(10.81);
    expect(zack.lunch_minutes).toBe(30);
  });

  it('totals the day across everyone on it', () => {
    const [d30, d31] = build('week', '2026-07-30');
    expect(d30.total_hours).toBe(20.54); // 10.81 + 9.73
    expect(d31.total_hours).toBe(17.19); // 7.87 + 9.32
  });

  it('grand TOTAL TIME rolls the week up', () => {
    expect(grandTotalHours(build('week', '2026-07-30'))).toBe(37.73);
  });

  it('attributes work items to the operator who filed them, on the resolved date', () => {
    const [day] = build('day', '2026-07-31');
    const zack = day.people.find((p) => p.user_id === ZACK)!;
    const lucas = day.people.find((p) => p.user_id === LUCAS)!;
    expect(zack.work_items.map((w) => w.work_type)).toEqual(['WALL SAW']);
    expect(lucas.work_items).toHaveLength(0);
  });

  it('does NOT double-print work_performed when the operator filed work_items', () => {
    const [day] = build('day', '2026-07-31');
    const zack = day.people.find((p) => p.user_id === ZACK)!;
    expect(zack.work_items).toHaveLength(1);
    expect(zack.logged_work).toHaveLength(0);
  });

  it('DOES use work_performed when there are no work_items for that person/day', () => {
    const days = buildTicketDays({
      range: ticketRange('day', '2026-07-31'),
      timecards,
      logs,
      workItems: [],
      roles,
      names,
      fallbackOperatorId: ZACK,
    });
    const zack = days[0].people.find((p) => p.user_id === ZACK)!;
    expect(zack.logged_work.map((w) => w.work_type)).toEqual(['WALL SAW']);
  });

  it('keeps the day note off the work list (office-only text)', () => {
    const [day] = build('day', '2026-07-31');
    expect(day.people.find((p) => p.user_id === ZACK)!.log_note).toBe('Job complete.');
  });

  it('shows a person with clock time but no submissions (blank write-in on paper)', () => {
    const [day] = build('day', '2026-07-30');
    const lucas = day.people.find((p) => p.user_id === LUCAS)!;
    expect(lucas.work_items).toHaveLength(0);
    expect(lucas.logged_work).toHaveLength(0);
    expect(lucas.hours).toBe(9.73);
  });

  it('returns no days for a range the crew was never on the job', () => {
    expect(build('week', '2026-06-01')).toEqual([]);
    expect(grandTotalHours([])).toBe(0);
  });

  it('falls back to the daily-log hours when no card was clocked to the job', () => {
    const days = buildTicketDays({
      range: ticketRange('day', '2026-07-31'),
      timecards: [],
      logs,
      workItems,
      roles,
      names,
      fallbackOperatorId: ZACK,
    });
    expect(days[0].people[0].hours).toBe(7.87);
  });

  it('buckets an unattributed work item under the lead', () => {
    const days = buildTicketDays({
      range: ticketRange('day', '2026-07-31'),
      timecards: [],
      logs,
      workItems: [{ id: 'wi-x', operator_id: null, day_number: 1, work_type: 'Core Drilling' }],
      roles,
      names,
      fallbackOperatorId: ZACK,
    });
    expect(days[0].people[0].user_id).toBe(ZACK);
    expect(days[0].people[0].work_items).toHaveLength(1);
  });

  it('datesWorked lists every day the crew touched the job, ascending', () => {
    expect(datesWorked(timecards, logs, workItems)).toEqual(['2026-07-30', '2026-07-31']);
  });
});

describe('enrichFromLoggedWork', () => {
  it('back-fills a measurement the work_items row lost (real prod case)', () => {
    // Prod QA-2026-718910: the row kept only quantity; the log copy had depth 6.
    const [out] = enrichFromLoggedWork(
      [{ id: 'w', work_type: 'WALL SAW', quantity: 54, cut_depth_inches: null }],
      normalizeLoggedWork([{ type: 'WALL SAW', quantity: 54, depth: 6 }])
    );
    expect(out.cut_depth_inches).toBe(6);
    expect(out.quantity).toBe(54);
  });

  it('never overwrites a value the row already has', () => {
    const [out] = enrichFromLoggedWork(
      [{ id: 'w', work_type: 'WALL SAW', cut_depth_inches: 8 }],
      normalizeLoggedWork([{ type: 'WALL SAW', depth: 6 }])
    );
    expect(out.cut_depth_inches).toBe(8);
  });

  it('never adds or removes lines', () => {
    const items = [{ id: 'a', work_type: 'Coring' }, { id: 'b', work_type: 'Sawing' }];
    expect(enrichFromLoggedWork(items, normalizeLoggedWork([{ type: 'Sawing', depth: 4 }]))).toHaveLength(2);
    expect(enrichFromLoggedWork(items, [])).toHaveLength(2);
  });

  it('matches work_type case-insensitively', () => {
    const [out] = enrichFromLoggedWork(
      [{ id: 'w', work_type: 'wall saw', cut_depth_inches: null as number | null }],
      normalizeLoggedWork([{ type: 'WALL SAW', depth: 6 }])
    );
    expect(out.cut_depth_inches).toBe(6);
  });

  it('SKIPS enrichment when the person filed two items of the same type', () => {
    // Otherwise both "Core Drilling" rows inherit the FIRST log entry's depth —
    // a measurement nobody recorded, on a customer-signed sheet.
    const out = enrichFromLoggedWork(
      [
        { id: 'a', work_type: 'Core Drilling', core_depth_inches: null as number | null },
        { id: 'b', work_type: 'Core Drilling', core_depth_inches: null as number | null },
      ],
      normalizeLoggedWork([{ type: 'Core Drilling', core_depth_inches: 10 }])
    );
    expect(out.map((o) => o.core_depth_inches)).toEqual([null, null]);
  });

  it('SKIPS enrichment when the log holds two entries of the same type', () => {
    const [out] = enrichFromLoggedWork(
      [{ id: 'a', work_type: 'Core Drilling', core_depth_inches: null as number | null }],
      normalizeLoggedWork([
        { type: 'Core Drilling', core_depth_inches: 10 },
        { type: 'Core Drilling', core_depth_inches: 18 },
      ])
    );
    expect(out.core_depth_inches).toBeNull();
  });

  it('still enriches an unambiguous type alongside an ambiguous one', () => {
    const out = enrichFromLoggedWork(
      [
        { id: 'a', work_type: 'Core Drilling', core_depth_inches: null as number | null },
        { id: 'b', work_type: 'Core Drilling', core_depth_inches: null as number | null },
        { id: 'c', work_type: 'WALL SAW', cut_depth_inches: null as number | null },
      ],
      normalizeLoggedWork([
        { type: 'Core Drilling', core_depth_inches: 10 },
        { type: 'WALL SAW', depth: 6 },
      ])
    );
    expect(out[0].core_depth_inches).toBeNull();
    expect(out[2].cut_depth_inches).toBe(6);
  });
});

describe('isShopCard (shop time is never job labor)', () => {
  const base = { id: 't', user_id: ZACK, date: '2026-07-30', clock_in_time: null, clock_out_time: null };

  it('flags every shop marker boundedJobHours zeroes', () => {
    expect(isShopCard({ ...base, is_shop_hours: true })).toBe(true);
    expect(isShopCard({ ...base, is_shop_time: true })).toBe(true);
    expect(isShopCard({ ...base, work_location: 'Shop' })).toBe(true);
  });

  it('leaves field cards alone', () => {
    expect(isShopCard({ ...base, work_location: 'field' })).toBe(false);
    expect(isShopCard(base)).toBe(false);
  });

  it('keeps a shop card off the ticket even when it carries this job_order_id', () => {
    const days = buildTicketDays({
      range: ticketRange('day', '2026-07-30'),
      timecards: [
        { ...base, id: 's1', is_shop_time: true, net_hours: 3, total_hours: 3 },
        { ...base, id: 'f1', work_location: 'field', net_hours: 8, total_hours: 8 },
      ],
      logs: [],
      workItems: [],
      roles,
      names,
    });
    expect(days[0].total_hours).toBe(8);
  });
});

describe('workTypeUnit', () => {
  it('labels sawing quantities as linear feet', () => {
    expect(workTypeUnit('WALL SAW')).toBe('LF');
    expect(workTypeUnit('Slab Sawing')).toBe('LF');
    expect(workTypeUnit('Hand Cutting')).toBe('LF');
  });

  it('labels coring quantities as holes', () => {
    expect(workTypeUnit('Core Drilling')).toBe('holes');
    expect(workTypeUnit('CORE DRILL')).toBe('holes');
  });

  it('refuses to guess for demolition / removal / unknown types', () => {
    expect(workTypeUnit('Break & Remove')).toBeNull();
    expect(workTypeUnit('Brokk')).toBeNull();
    expect(workTypeUnit(null)).toBeNull();
  });
});

describe('ticketWorkDetail', () => {
  it('uses the shared formatter when it has something to say', () => {
    expect(ticketWorkDetail({ linear_feet_cut: 54, cut_depth_inches: 6 }, workItemDetailLine)).toBe('54 LF @ 6"');
  });

  it('falls back to a depth-only line the shared formatter cannot express', () => {
    expect(ticketWorkDetail({ work_type: 'WALL SAW', quantity: 54, cut_depth_inches: 6 }, workItemDetailLine)).toBe(
      '6" deep'
    );
  });

  it('returns empty when there is no measurement at all', () => {
    expect(ticketWorkDetail({ work_type: 'WALL SAW' }, workItemDetailLine)).toBe('');
  });
});

describe('footage rollups', () => {
  it('sums structured cuts before the flat column', () => {
    expect(
      workItemLinearFeet({ linear_feet_cut: 999, details_json: { cuts: [{ linearFeet: 20 }, { linearFeet: 12.5 }] } })
    ).toBe(32.5);
  });

  it('falls back to linear_feet_cut', () => {
    expect(workItemLinearFeet({ linear_feet_cut: 54 })).toBe(54);
    expect(workItemLinearFeet({})).toBe(0);
  });

  it('reads a bare quantity as LF on a sawing type — the SAME inference the work line prints', () => {
    // Real prod row (QA-2026-718910): quantity 54, no linear_feet_cut. The
    // description prints "WALL SAW — 54 LF", so total footage must agree.
    expect(workItemLinearFeet({ work_type: 'WALL SAW', quantity: 54 })).toBe(54);
  });

  it('never reads a bare quantity as LF on a type that does not imply it', () => {
    expect(workItemLinearFeet({ work_type: 'Break & Remove', quantity: 54 })).toBe(0);
    expect(workItemLinearFeet({ work_type: 'Core Drilling', quantity: 12 })).toBe(0);
  });

  it('counts holes for cores, defaulting a hole with no quantity to 1', () => {
    expect(workItemCores({ details_json: { holes: [{ quantity: 2 }, {}] } })).toBe(3);
    expect(workItemCores({ core_quantity: 4 })).toBe(4);
  });

  it('reads a bare quantity as holes on a coring type', () => {
    expect(workItemCores({ work_type: 'Core Drilling', quantity: 12 })).toBe(12);
    expect(workItemCores({ work_type: 'WALL SAW', quantity: 54 })).toBe(0);
  });

  it('a cores-only job still reports a footage answer (checklist #8 regression)', () => {
    const { linearFeet, cores } = sumFootage([{ work_type: 'Core Drilling', quantity: 12 }]);
    expect(linearFeet).toBe(0);
    expect(cores).toBe(12);
  });

  it('sumFootage totals the printed range', () => {
    expect(sumFootage([{ linear_feet_cut: 54 }, { details_json: { holes: [{ quantity: 3 }] } }])).toEqual({
      linearFeet: 54,
      cores: 3,
    });
  });

  it('allPrintedWork flattens every person on every day', () => {
    const items = allPrintedWork([
      {
        date: '2026-07-31',
        total_hours: 1,
        people: [
          {
            user_id: 'a', name: 'A', role: 'lead', clock_in: null, clock_out: null, lunch_minutes: null, hours: null,
            work_items: [{ id: 'w1', linear_feet_cut: 10 }], logged_work: [{ work_type: 'X' }], log_note: null, helper_note: null,
          },
        ],
      },
    ]);
    expect(items).toHaveLength(2);
  });
});
