import { workItemDetailLine } from './work-items-format';
import {
  aggregateWorkPerformed,
  allPrintedWork,
  closeoutFilingDates,
  spanOf,
  totalsByWorkType,
  workItemDepths,
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

describe('resolveWorkItemDate — work_date is the row\'s own fact', () => {
  const logs = [
    { id: 'log-a', log_date: '2026-08-05', day_number: 1, operator_id: 'dante' },
    { id: 'log-b', log_date: '2026-08-06', day_number: 2, operator_id: 'dante' },
  ] as any;

  it('uses work_date over every inference below it', () => {
    expect(
      resolveWorkItemDate(
        // daily_log_id, day_number and created_at all point at OTHER days.
        {
          id: 'w1', work_date: '2026-08-12', daily_log_id: 'log-a',
          day_number: 1, operator_id: 'dante', created_at: '2026-08-06T18:00:00Z',
        } as any,
        logs
      )
    ).toBe('2026-08-12');
  });

  it('still falls back to the linked log for rows written before the column existed', () => {
    expect(
      resolveWorkItemDate(
        { id: 'w2', daily_log_id: 'log-b', operator_id: 'dante' } as any,
        logs
      )
    ).toBe('2026-08-06');
  });

  it('ignores an empty work_date rather than dating the row to nothing', () => {
    expect(
      resolveWorkItemDate(
        { id: 'w3', work_date: null, daily_log_id: 'log-a', operator_id: 'dante' } as any,
        logs
      )
    ).toBe('2026-08-05');
  });
});

describe('buildTicketDays — the printed sheet carries the LEAD\'s measurements', () => {
  const range = { from: '2026-08-10', to: '2026-08-16' } as any;
  const roles = new Map<string, any>([['conrade', 'lead'], ['devin', 'operator']]);
  const names = new Map<string, string | null>([
    ['conrade', 'Conrade Richardson'],
    ['devin', 'Devin scroggs'],
  ]);
  const item = (id: string, op: string, date: string, qty: number) =>
    ({ id, operator_id: op, work_date: date, work_type: 'SLAB SAW', quantity: qty } as any);

  const base = { range, timecards: [], logs: [], helperLogs: [], roles, names } as any;

  it('drops the co-operator\'s footage — Westminster printed 3,200 LF for 1,100', () => {
    const days = buildTicketDays({
      ...base,
      workItems: [
        item('a', 'conrade', '2026-08-12', 700),
        item('b', 'devin', '2026-08-12', 300),
        item('c', 'conrade', '2026-08-13', 400),
        item('d', 'devin', '2026-08-13', 400),
      ],
    });
    const printed = days.flatMap((d) => d.people).flatMap((p) => p.work_items);
    expect(printed.map((i: any) => i.id).sort()).toEqual(['a', 'c']);
    expect(printed.reduce((s, i: any) => s + Number(i.quantity), 0)).toBe(1100);
  });

  it('still lists the co-operator by name — you need to know who was there', () => {
    const days = buildTicketDays({
      ...base,
      workItems: [item('a', 'conrade', '2026-08-12', 700), item('b', 'devin', '2026-08-12', 300)],
    });
    const people = days[0].people.map((p) => p.name).sort();
    expect(people).toEqual(['Conrade Richardson', 'Devin scroggs']);
  });

  it('KEEPS the crew\'s work on a day the lead filed nothing — 11 Aug, only Devin', () => {
    const days = buildTicketDays({ ...base, workItems: [item('x', 'devin', '2026-08-11', 200)] });
    const printed = days.flatMap((d) => d.people).flatMap((p) => p.work_items);
    expect(printed.map((i: any) => i.id)).toEqual(['x']);
  });

  it('honours a per-day lead change over the job-level lead', () => {
    const days = buildTicketDays({
      ...base,
      leadByDate: new Map([['2026-08-12', 'devin']]),
      workItems: [
        item('a', 'conrade', '2026-08-12', 700),
        item('b', 'devin', '2026-08-12', 300),
      ],
    });
    const printed = days.flatMap((d) => d.people).flatMap((p) => p.work_items);
    expect(printed.map((i: any) => i.id)).toEqual(['b']);
  });

  it('quantitiesFrom "everyone" keeps both — the on-screen view is unchanged', () => {
    const days = buildTicketDays({
      ...base,
      quantitiesFrom: 'everyone',
      workItems: [
        item('a', 'conrade', '2026-08-12', 700),
        item('b', 'devin', '2026-08-12', 300),
      ],
    });
    const printed = days.flatMap((d) => d.people).flatMap((p) => p.work_items);
    expect(printed.map((i: any) => i.id).sort()).toEqual(['a', 'b']);
  });
});

describe('buildTicketDays — a suppressed crew member is not "filed nothing"', () => {
  const range = { from: '2026-08-10', to: '2026-08-16' } as any;
  const roles = new Map<string, any>([['conrade', 'lead'], ['devin', 'operator']]);
  const names = new Map<string, string | null>([['conrade', 'Conrade'], ['devin', 'Devin']]);
  const item = (id: string, op: string, date: string, qty: number) =>
    ({ id, operator_id: op, work_date: date, work_type: 'SLAB SAW', quantity: qty } as any);
  const base = { range, timecards: [], logs: [], helperLogs: [], roles, names } as any;

  it('flags the co-operator whose figures were suppressed', () => {
    const days = buildTicketDays({
      ...base,
      workItems: [item('a', 'conrade', '2026-08-12', 700), item('b', 'devin', '2026-08-12', 300)],
    });
    const devin = days[0].people.find((p) => p.user_id === 'devin')!;
    expect(devin.measurements_by_lead).toBe(true);
    expect(devin.work_items).toEqual([]);
  });

  it('does NOT flag someone who genuinely submitted nothing — they get ruled lines', () => {
    const days = buildTicketDays({
      ...base,
      timecards: [
        { id: 't1', user_id: 'devin', date: '2026-08-12', clock_in_time: '2026-08-12T11:00:00Z',
          clock_out_time: '2026-08-12T21:00:00Z', net_hours: 9 } as any,
      ],
      workItems: [item('a', 'conrade', '2026-08-12', 700)],
    });
    const devin = days[0].people.find((p) => p.user_id === 'devin')!;
    expect(devin.measurements_by_lead).toBeUndefined();
  });
});

describe('totalsByWorkType — the number the office invoices from', () => {
  const item = (type: string, over: any = {}) =>
    ({ id: Math.random().toString(36), work_type: type, ...over } as any);

  it("THE CASE: a missed day entered as a running total the next day still totals right", () => {
    // Operator files nothing Monday, then on Tuesday enters 250 LF covering both.
    // Per-day blocks show one date; the TOTAL is what gets billed.
    const totals = totalsByWorkType([item('SLAB SAW', { quantity: 250 })]);
    expect(totals).toEqual([{ workType: 'SLAB SAW', quantity: 250, unit: 'LF' }]);
  });

  it('adds the same work type across different days into ONE line', () => {
    const totals = totalsByWorkType([
      item('WALL SAW', { quantity: 120 }),
      item('WALL SAW', { quantity: 38 }),
    ]);
    expect(totals).toEqual([{ workType: 'WALL SAW', quantity: 158, unit: 'LF' }]);
  });

  it('treats "Wall Saw" and "WALL SAW" as one line, not two', () => {
    const totals = totalsByWorkType([
      item('Wall Saw', { quantity: 100 }),
      item('WALL SAW', { quantity: 50 }),
    ]);
    expect(totals).toHaveLength(1);
    expect(totals[0].quantity).toBe(150);
  });

  it('counts holes for coring and labels them correctly', () => {
    const totals = totalsByWorkType([
      item('CORE DRILL', { details_json: { holes: [{ quantity: 4 }, { quantity: 3 }] } }),
    ]);
    expect(totals).toEqual([{ workType: 'CORE DRILL', quantity: 7, unit: 'holes' }]);
  });

  it('keeps saw feet and core holes as SEPARATE lines — never adds unlike units', () => {
    const totals = totalsByWorkType([
      item('SLAB SAW', { quantity: 200 }),
      item('CORE DRILL', { details_json: { holes: [{ quantity: 6 }] } }),
    ]);
    expect(totals.map((t) => [t.workType, t.quantity, t.unit])).toEqual([
      ['SLAB SAW', 200, 'LF'],
      ['CORE DRILL', 6, 'holes'],
    ]);
  });

  it('prints an unrecognised type unlabelled rather than inventing a unit', () => {
    const totals = totalsByWorkType([item('BREAK & REMOVE', { quantity: 400 })]);
    expect(totals[0].unit).toBeNull();
  });

  it('sorts biggest first', () => {
    const totals = totalsByWorkType([
      item('HAND SAW', { quantity: 10 }),
      item('SLAB SAW', { quantity: 900 }),
    ]);
    expect(totals[0].workType).toBe('SLAB SAW');
  });

  it('ignores rows with no work type or no quantity', () => {
    expect(totalsByWorkType([item(''), item('SLAB SAW', { quantity: 0 })])).toEqual([]);
  });

  it('is empty for an empty job rather than throwing', () => {
    expect(totalsByWorkType([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE PHANTOM WEDNESDAY (founder, Aug 17 2026 — found while running payroll).
//
// Dante's printed Southern Basements ticket (JOB-2026-277097, WEEK mode) read
//   10.13 + 10.64 + 0.09 = 20.86
// The 0.09 sat on WEDNESDAY 8/12 — a day his timecard says he was at AM King
// (JOB-2026-914932) from start to finish, 10.37 hours.
//
// It was NOT a window clip and NOT a rounding artefact. His Wednesday clock
// card was correctly dropped by the attribution rule (the office's ledger put
// him at AM King). What got through was `daily_job_logs.hours_worked = 0.09`:
// at 07:00 that morning, in the truck, he closed out Monday–Tuesday's job, and
// the app timed the five-minute closeout session and stored it as the day's
// hours. With no card claiming the day, the ticket's log fallback promoted that
// paperwork into a work day.
//
// Every figure below is the real production row.
// ─────────────────────────────────────────────────────────────────────────────
describe('buildTicketDays — a day spent on another job is not this job\'s day', () => {
  const DANTE = '8baa4e85-39dc-4ec8-b80e-464c041ba310';
  const danteNames = new Map<string, string | null>([[DANTE, 'Dante burgess']]);
  const danteRoles = resolveCrewRoles({ assigned_to: DANTE });

  // Mon + Tue reached the ticket (Mon attributed off the ledger, Tue linked).
  // Wednesday's card is absent because attribution already put it at AM King.
  const timecards: TicketTimecardRow[] = [
    { id: 'tc-mon', user_id: DANTE, date: '2026-08-10', clock_in_time: '2026-08-10T11:43:00Z', clock_out_time: '2026-08-10T22:31:00Z', lunch_duration_minutes: 30, net_hours: 10.13, total_hours: 10.13 },
    { id: 'tc-tue', user_id: DANTE, date: '2026-08-11', clock_in_time: '2026-08-11T11:30:00Z', clock_out_time: '2026-08-11T22:38:00Z', lunch_duration_minutes: 30, net_hours: 10.64, total_hours: 10.64 },
  ];

  // The job's ONLY daily log — filed Wednesday morning, day_number 3 on a
  // two-day job, carrying the whole scope and a 5-minute "hours_worked".
  const logs: TicketDailyLog[] = [
    {
      id: '7e5e9f13-4805-4561-899b-ab01698be059',
      operator_id: DANTE,
      log_date: '2026-08-12',
      day_number: 3,
      hours_worked: 0.09,
      work_performed: [
        { type: 'WALL SAW', depth: 15, quantity: 25.4, notes: 'Hung poly' },
        { type: 'CORE DRILL', depth: 15, quantity: 1 },
        { type: 'HAND SAW', depth: 10, quantity: 8 },
      ],
      notes: 'Job complete. Remote signature link sent to 678-897-0900.',
    },
  ];

  // All three work_items carry work_date 2026-08-12 — they were written by the
  // same Wednesday closeout.
  const workItems: TicketWorkItem[] = [
    { id: 'wi-hand', operator_id: DANTE, day_number: 3, work_date: '2026-08-12', work_type: 'HAND SAW', quantity: 8, linear_feet_cut: 8, cut_depth_inches: 10 },
    { id: 'wi-wall', operator_id: DANTE, day_number: 3, work_date: '2026-08-12', work_type: 'WALL SAW', quantity: 25.4, linear_feet_cut: 25.4, cut_depth_inches: 15 },
    { id: 'wi-core', operator_id: DANTE, day_number: 3, work_date: '2026-08-12', work_type: 'CORE DRILL', quantity: 1, core_quantity: 1 },
  ];

  // What `attributableTimecards` now returns: the ledger placed Dante on AM
  // King on 8/12 and not on this job.
  const offJobPersonDays = new Set([`${DANTE}|2026-08-12`]);

  const build = (over: Partial<Parameters<typeof buildTicketDays>[0]> = {}) =>
    buildTicketDays({
      range: ticketRange('week', '2026-08-12'),
      timecards,
      logs,
      workItems,
      roles: danteRoles,
      names: danteNames,
      fallbackOperatorId: DANTE,
      quantitiesFrom: 'lead',
      offJobPersonDays,
      ...over,
    });

  it('THE BUG: without the guard, Wednesday printed 0.09 hours', () => {
    const days = build({ offJobPersonDays: undefined });
    const wed = days.find((d) => d.date === '2026-08-12');
    expect(wed?.total_hours).toBe(0.09);
    expect(grandTotalHours(days)).toBe(20.86); // the founder's printed sheet
  });

  it('drops the phantom Wednesday from the sheet entirely', () => {
    const days = build();
    expect(days.map((d) => d.date)).toEqual(['2026-08-10', '2026-08-11']);
  });

  it('0.09 appears nowhere — not as a day, a person, or a remnant', () => {
    const days = build();
    const everyHours = days.flatMap((d) => [d.total_hours, ...d.people.map((p) => p.hours)]);
    expect(everyHours).not.toContain(0.09);
  });

  it('TOTAL TIME (WEEK) is Monday + Tuesday only', () => {
    expect(grandTotalHours(build())).toBe(20.77);
  });

  it('keeps Monday and Tuesday exactly as they were', () => {
    const days = build();
    expect(days.find((d) => d.date === '2026-08-10')?.total_hours).toBe(10.13);
    expect(days.find((d) => d.date === '2026-08-11')?.total_hours).toBe(10.64);
  });

  it('does NOT lose the job\'s only record of what was cut', () => {
    // Deleting the Wednesday block outright would blank the whole scope — this
    // log and these rows are the ONLY measurements JOB-2026-277097 has.
    const totals = totalsByWorkType(allPrintedWork(build()));
    expect(totals).toEqual(
      expect.arrayContaining([
        { workType: 'WALL SAW', quantity: 25.4, unit: 'LF' },
        { workType: 'HAND SAW', quantity: 8, unit: 'LF' },
        { workType: 'CORE DRILL', quantity: 1, unit: 'holes' },
      ])
    );
  });

  it('folds the closeout onto the last real day and says when it was filed', () => {
    const tue = build().find((d) => d.date === '2026-08-11')!;
    const dante = tue.people.find((p) => p.user_id === DANTE)!;
    expect(dante.work_items.map((w) => w.work_type).sort()).toEqual([
      'CORE DRILL',
      'HAND SAW',
      'WALL SAW',
    ]);
    // Labelled, never silently re-dated.
    expect(dante.work_filed_on).toBe('2026-08-12');
    // And the hours are still Tuesday's own, untouched by the fold.
    expect(dante.hours).toBe(10.64);
  });

  it('carries the closeout note across with the work', () => {
    const tue = build().find((d) => d.date === '2026-08-11')!;
    expect(tue.people[0].log_note).toContain('Job complete.');
  });

  it('keeps the work when there is no on-job day to fold onto, hours-less and flagged', () => {
    // Printing Wednesday on its own (day mode): nothing to fold onto, so the
    // measurements survive rather than vanishing — but the day still refuses to
    // call itself worked.
    const days = build({ range: ticketRange('day', '2026-08-12') });
    const wed = days.find((d) => d.date === '2026-08-12')!;
    const dante = wed.people.find((p) => p.user_id === DANTE)!;
    expect(dante.hours).toBeNull();
    expect(dante.filed_off_job).toBe(true);
    expect(wed.total_hours).toBe(0);
    expect(totalsByWorkType(allPrintedWork(days)).length).toBe(3);
  });

  it('a LINKED card outranks the ledger — Zack\'s real Aug 14 day survives', () => {
    // Production row `60dab8ce-7457-4e30-be26-c30a30206eb5`: Zack's Aug 14 card
    // carries JOB-2026-424813's id while the placement ledger put him on
    // JOB-2026-675188. A recorded link is not an inference, and 9.73 real hours
    // must not be deleted by a stale board.
    const ZACK_DAY = '2026-08-14';
    const days = buildTicketDays({
      range: ticketRange('day', ZACK_DAY),
      timecards: [
        { id: 'tc-zack', user_id: ZACK, date: ZACK_DAY, clock_in_time: `${ZACK_DAY}T11:00:00Z`, clock_out_time: `${ZACK_DAY}T20:44:00Z`, net_hours: 9.73, total_hours: 9.73 },
      ],
      logs: [{ id: 'l', operator_id: ZACK, log_date: ZACK_DAY, day_number: 1, hours_worked: 9.73, work_performed: [] }],
      workItems: [],
      roles,
      names,
      fallbackOperatorId: ZACK,
      offJobPersonDays: new Set([`${ZACK}|${ZACK_DAY}`]),
    });
    expect(days[0].total_hours).toBe(9.73);
    expect(days[0].people[0].filed_off_job).toBeUndefined();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE FOLD MUST NOT TRIGGER LEAD-DEDUP ON THE DAY IT LANDS ON.
  //
  // Step 6 blanks every non-lead's quantities on days the lead filed work, and
  // stands down when he filed nothing. The fold moves the lead's closeout onto
  // his last real day — on this job, 8/11, a day he filed nothing on. If that
  // counted as "the lead measured the scope", step 6 would wipe a second crew
  // member's genuine 8/11 footage and print the 8/12 closeout's scope in its
  // place. The two describe DIFFERENT work, so the footage would not be
  // double-counted away — it would be gone from the totals the office invoices
  // from. Nobody else filed on 8/11 in production, so this was one crew member
  // away from being live.
  // ───────────────────────────────────────────────────────────────────────────
  it('does not blank a second crew member\'s real measurements on the fold target day', () => {
    const DEVIN = '44444444-4444-4444-4444-444444444444';
    const crewNames = new Map<string, string | null>([
      [DANTE, 'Dante burgess'],
      [DEVIN, 'Devin'],
    ]);
    const crewRoles = resolveCrewRoles({ assigned_to: DANTE, crew: [{ user_id: DEVIN, role: 'operator' }] });

    const days = buildTicketDays({
      range: ticketRange('week', '2026-08-12'),
      timecards: [
        ...timecards,
        { id: 'tc-devin-tue', user_id: DEVIN, date: '2026-08-11', clock_in_time: '2026-08-11T11:30:00Z', clock_out_time: '2026-08-11T22:00:00Z', lunch_duration_minutes: 30, net_hours: 10.0, total_hours: 10.0 },
      ],
      logs,
      workItems: [
        ...workItems,
        // Devin's own Tuesday footage — filed on the day, on the job.
        { id: 'wi-devin', operator_id: DEVIN, day_number: 2, work_date: '2026-08-11', work_type: 'SLAB SAW', quantity: 140, linear_feet_cut: 140, cut_depth_inches: 6 },
      ],
      roles: crewRoles,
      names: crewNames,
      fallbackOperatorId: DANTE,
      quantitiesFrom: 'lead',
      offJobPersonDays,
    });

    const tue = days.find((d) => d.date === '2026-08-11')!;
    const devin = tue.people.find((p) => p.user_id === DEVIN)!;
    // His measurements stand — exactly as they did before the fold existed.
    expect(devin.work_items.map((w) => w.work_type)).toEqual(['SLAB SAW']);
    expect(devin.measurements_by_lead).toBeUndefined();

    // And the closeout's scope is still there, on Dante, alongside it.
    const dante = tue.people.find((p) => p.user_id === DANTE)!;
    expect(dante.work_items.length).toBe(3);

    // The number the office prices: all four cuts, none swallowed.
    const totals = totalsByWorkType(allPrintedWork(days));
    expect(totals).toEqual(
      expect.arrayContaining([
        { workType: 'SLAB SAW', quantity: 140, unit: 'LF' },
        { workType: 'WALL SAW', quantity: 25.4, unit: 'LF' },
        { workType: 'HAND SAW', quantity: 8, unit: 'LF' },
        { workType: 'CORE DRILL', quantity: 1, unit: 'holes' },
      ])
    );
  });

  // Lead-dedup is still ON when the lead's work is genuinely his own that day.
  it('still defers to the lead on a day he filed his own measurements', () => {
    const DEVIN = '44444444-4444-4444-4444-444444444444';
    const days = buildTicketDays({
      range: ticketRange('week', '2026-08-12'),
      timecards,
      logs,
      workItems: [
        ...workItems,
        { id: 'wi-dante-tue', operator_id: DANTE, day_number: 2, work_date: '2026-08-11', work_type: 'WALL SAW', quantity: 60, linear_feet_cut: 60 },
        { id: 'wi-devin-tue', operator_id: DEVIN, day_number: 2, work_date: '2026-08-11', work_type: 'WALL SAW', quantity: 60, linear_feet_cut: 60 },
      ],
      roles: resolveCrewRoles({ assigned_to: DANTE, crew: [{ user_id: DEVIN, role: 'operator' }] }),
      names: new Map<string, string | null>([[DANTE, 'Dante burgess'], [DEVIN, 'Devin']]),
      fallbackOperatorId: DANTE,
      quantitiesFrom: 'lead',
      offJobPersonDays,
    });

    const tue = days.find((d) => d.date === '2026-08-11')!;
    const devin = tue.people.find((p) => p.user_id === DEVIN)!;
    expect(devin.work_items).toEqual([]);
    expect(devin.measurements_by_lead).toBe(true);
  });

  // The stamp must describe the block honestly. When the target day filed rows
  // of its own, only SOME of the bullets arrived at closeout.
  it('marks the filing stamp PARTIAL when the target day had work of its own', () => {
    const days = buildTicketDays({
      range: ticketRange('week', '2026-08-12'),
      timecards,
      logs,
      workItems: [
        ...workItems,
        { id: 'wi-dante-tue', operator_id: DANTE, day_number: 2, work_date: '2026-08-11', work_type: 'WALL SAW', quantity: 60, linear_feet_cut: 60 },
      ],
      roles: danteRoles,
      names: danteNames,
      fallbackOperatorId: DANTE,
      quantitiesFrom: 'lead',
      offJobPersonDays,
    });
    const dante = days.find((d) => d.date === '2026-08-11')!.people[0];
    expect(dante.work_filed_on).toBe('2026-08-12');
    expect(dante.work_filed_on_partial).toBe(true);
  });

  it('does NOT mark it partial when the whole block arrived by fold', () => {
    const dante = build().find((d) => d.date === '2026-08-11')!.people[0];
    expect(dante.work_filed_on).toBe('2026-08-12');
    expect(dante.work_filed_on_partial).toBeUndefined();
  });

  // JOB-2026-631148's real failure: the target day already carried a closeout
  // note, so first-wins silently dropped the folded one off the sheet.
  it('JOINS the two day notes instead of keeping only the first', () => {
    const days = buildTicketDays({
      range: ticketRange('week', '2026-08-12'),
      timecards,
      logs: [
        {
          id: 'log-tue',
          operator_id: DANTE,
          log_date: '2026-08-11',
          day_number: 2,
          hours_worked: null,
          work_performed: [],
          notes: 'Job complete. Remote signature link sent to 8645353695.',
        },
        ...logs,
      ],
      workItems,
      roles: danteRoles,
      names: danteNames,
      fallbackOperatorId: DANTE,
      quantitiesFrom: 'lead',
      offJobPersonDays,
    });
    const note = days.find((d) => d.date === '2026-08-11')!.people[0].log_note!;
    // Both closeouts survive — the target's own and the folded one.
    expect(note).toContain('8645353695');
    expect(note).toContain('678-897-0900');
    expect(note.split(' · ').length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JOB-2026-793440 — "Aiden and Javi were there Monday and Tuesday and right now
// it's only showing me the time they were there Tuesday."
//
// PRODUCTION SHAPES, verified against the live database on Aug 19 2026:
//
//   Mon 2026-08-17  Aiden 06:36–17:56  10.83 h   card job_order_id = NULL
//                   Javi  06:35–19:00  11.92 h   card job_order_id = NULL
//                   job_daily_assignments places BOTH on this job
//                   daily_job_logs 7.79 h, work_performed = slab saw + hand saw
//
//   Tue 2026-08-18  Aiden 09:35–18:13   8.12 h   card job_order_id = THIS JOB
//                   Javi  07:05–18:13  10.63 h   card job_order_id = THIS JOB
//                   NO assignment row at all — they are on the job via the
//                   job-level seats
//                   daily_job_logs 0.06 h (a closeout session), work_performed
//                   = hand saw + break & remove
//
// Nothing was missing from the data. All four cards were attributable and both
// days were on the job; the sheet was simply in DAY mode anchored on the last
// worked day, so it asked for Tuesday and got Tuesday. The fix is the 'job'
// window, and these tests are what stops it regressing to one day again.
// ─────────────────────────────────────────────────────────────────────────────
describe('JOB-2026-793440 — every day the crew was here, on one sheet', () => {
  const AIDEN = '14cb2d1a-cc88-4c36-a4d5-b2957be858cb';
  const JAVI = '13777f9b-b681-40b9-985e-836b0c771624';
  const MON = '2026-08-17';
  const TUE = '2026-08-18';

  const crewNames = new Map<string, string | null>([
    [AIDEN, 'Aiden'],
    [JAVI, 'javier muniz rodriguez'],
  ]);
  const crewRoles = resolveCrewRoles({ assigned_to: AIDEN, helper_assigned_to: JAVI });

  const timecards: TicketTimecardRow[] = [
    {
      id: 'tc-mon-aiden',
      user_id: AIDEN,
      date: MON,
      clock_in_time: '2026-08-17T10:36:19.276Z',
      clock_out_time: '2026-08-17T21:56:09.326Z',
      lunch_duration_minutes: 30,
      net_hours: 10.83,
      total_hours: 10.83,
      is_shop_hours: false,
      work_location: 'field',
    },
    {
      id: 'tc-mon-javi',
      user_id: JAVI,
      date: MON,
      clock_in_time: '2026-08-17T10:35:00.000Z',
      clock_out_time: '2026-08-17T23:00:00.000Z',
      lunch_duration_minutes: 30,
      net_hours: 11.92,
      total_hours: 11.92,
      is_shop_hours: false,
      work_location: 'field',
    },
    {
      id: 'tc-tue-aiden',
      user_id: AIDEN,
      date: TUE,
      clock_in_time: '2026-08-18T13:35:53.879Z',
      clock_out_time: '2026-08-18T22:13:08.744Z',
      lunch_duration_minutes: 30,
      net_hours: 8.12,
      total_hours: 8.12,
      is_shop_hours: false,
      work_location: 'field',
    },
    {
      id: 'tc-tue-javi',
      user_id: JAVI,
      date: TUE,
      clock_in_time: '2026-08-18T11:05:38.943Z',
      clock_out_time: '2026-08-18T22:13:17.092Z',
      lunch_duration_minutes: 30,
      net_hours: 10.63,
      total_hours: 10.63,
      is_shop_hours: false,
      work_location: 'field',
    },
  ];

  // Monday's two cards carry no job tag — the board is the only thing putting
  // them here, so both must print as attributed rather than recorded.
  const attributedCardIds = new Set(['tc-mon-aiden', 'tc-mon-javi']);

  const logs: TicketDailyLog[] = [
    {
      id: 'log-mon',
      operator_id: AIDEN,
      log_date: MON,
      day_number: 1,
      hours_worked: 7.79,
      work_performed: [
        { type: 'ELECTRIC SLAB SAW', depth: 5, quantity: 162, notes: null },
        { type: 'HAND SAW', depth: 6, quantity: 45, notes: null },
      ],
    },
    {
      id: 'log-tue',
      operator_id: AIDEN,
      log_date: TUE,
      day_number: 2,
      hours_worked: 0.06,
      work_performed: [
        { type: 'HAND SAW', depth: 5, quantity: 15, notes: null },
        { type: 'BREAK & REMOVE', quantity: 4, notes: 'Removed the whole area' },
      ],
    },
  ];

  // The board wrote Monday only. Tuesday has no assignment row.
  const scheduledPersonDays = new Set([`${AIDEN}|${MON}`, `${JAVI}|${MON}`]);
  const leadByDate = new Map<string, string>([[MON, AIDEN]]);

  const worked = datesWorked(timecards, logs);
  const range = ticketRange('job', defaultAnchorDate(worked, '2026-08-19'), spanOf(worked));

  const build = (r = range) =>
    buildTicketDays({
      range: r,
      timecards,
      logs,
      workItems: [],
      roles: crewRoles,
      names: crewNames,
      fallbackOperatorId: AIDEN,
      quantitiesFrom: 'lead',
      leadByDate,
      scheduledPersonDays,
      attributedCardIds,
      todayYMD: '2026-08-19',
    });

  it('THE BUG: the old default — day mode on the last worked day — printed Tuesday only', () => {
    const anchor = defaultAnchorDate(worked, '2026-08-19');
    expect(anchor).toBe(TUE);
    const dayOnly = build(ticketRange('day', anchor));
    expect(dayOnly.map((d) => d.date)).toEqual([TUE]);
    // Monday's 22.75 hours were never wrong, never missing — never asked for.
    expect(grandTotalHours(dayOnly)).toBe(18.75);
  });

  it('the job window spans Monday to Tuesday', () => {
    expect(range).toEqual({ from: MON, to: TUE });
  });

  it('ALL FOUR person-days print, with their real clock times', () => {
    const days = build();
    expect(days.map((d) => d.date)).toEqual([MON, TUE]);

    const row = (date: string, userId: string) =>
      days.find((d) => d.date === date)!.people.find((p) => p.user_id === userId)!;

    expect(row(MON, AIDEN)).toMatchObject({
      clock_in: '2026-08-17T10:36:19.276Z',
      clock_out: '2026-08-17T21:56:09.326Z',
      hours: 10.83,
    });
    expect(row(MON, JAVI)).toMatchObject({
      clock_in: '2026-08-17T10:35:00.000Z',
      clock_out: '2026-08-17T23:00:00.000Z',
      hours: 11.92,
    });
    expect(row(TUE, AIDEN)).toMatchObject({
      clock_in: '2026-08-18T13:35:53.879Z',
      clock_out: '2026-08-18T22:13:08.744Z',
      hours: 8.12,
    });
    expect(row(TUE, JAVI)).toMatchObject({
      clock_in: '2026-08-18T11:05:38.943Z',
      clock_out: '2026-08-18T22:13:17.092Z',
      hours: 10.63,
    });
    expect(grandTotalHours(days)).toBe(41.5);
  });

  it("a day's hours do NOT depend on work being filed that day", () => {
    // Strip every log and work item. The hours are the crew's clock cards and
    // must survive a job where nobody ever typed a measurement.
    const days = buildTicketDays({
      range,
      timecards,
      logs: [],
      workItems: [],
      roles: crewRoles,
      names: crewNames,
      scheduledPersonDays,
      attributedCardIds,
      todayYMD: '2026-08-19',
    });
    expect(days.map((d) => d.date)).toEqual([MON, TUE]);
    expect(grandTotalHours(days)).toBe(41.5);
  });

  it('Tuesday survives on the job-level seats alone — no assignment row exists', () => {
    const days = build();
    const tue = days.find((d) => d.date === TUE)!;
    expect(tue.people.map((p) => p.user_id).sort()).toEqual([AIDEN, JAVI].sort());
    expect(tue.total_hours).toBe(18.75);
  });

  it("Monday's untagged hours print as ATTRIBUTED; Tuesday's tagged ones do not", () => {
    const days = build();
    const mon = days.find((d) => d.date === MON)!;
    const tue = days.find((d) => d.date === TUE)!;
    expect(mon.people.every((p) => p.hours_attributed === true)).toBe(true);
    expect(tue.people.some((p) => p.hours_attributed)).toBe(false);
  });

  it('the five-minute closeout never becomes a day of labour', () => {
    const days = build();
    // 0.06 is the length of the closeout SESSION on Tuesday's log. Tuesday's
    // cards claimed the day first, so it is never used — and it appears nowhere.
    expect(JSON.stringify(days)).not.toContain('0.06');
    expect(days.find((d) => d.date === TUE)!.total_hours).toBe(18.75);
  });

  it('WORK PERFORMED is stated ONCE for the ticket, not repeated per day', () => {
    const lines = aggregateWorkPerformed(allPrintedWork(build()));
    // Hand saw was filed on BOTH days — one line, 45 + 15.
    expect(lines).toEqual([
      { workType: 'ELECTRIC SLAB SAW', quantity: 162, unit: 'LF', depths: [5] },
      { workType: 'HAND SAW', quantity: 60, unit: 'LF', depths: [5, 6] },
      { workType: 'BREAK & REMOVE', quantity: 4, unit: null, depths: [] },
    ]);
    // One row per work type, whatever the day count.
    expect(new Set(lines.map((l) => l.workType)).size).toBe(lines.length);
  });
});

describe('buildTicketDays — the board put them here and nobody clocked', () => {
  const DAY = '2026-08-17';

  it('prints the day with an empty Total rather than losing it', () => {
    const days = buildTicketDays({
      range: { from: DAY, to: DAY },
      timecards: [],
      logs: [],
      workItems: [],
      roles,
      names,
      scheduledPersonDays: new Set([`${ZACK}|${DAY}`]),
      todayYMD: '2026-08-19',
    });
    expect(days).toHaveLength(1);
    expect(days[0].people[0]).toMatchObject({
      user_id: ZACK,
      hours: null,
      scheduled_only: true,
    });
    expect(days[0].total_hours).toBe(0);
  });

  it('does NOT flag a scheduled day the crew actually clocked', () => {
    const days = buildTicketDays({
      range: { from: DAY, to: DAY },
      timecards: [
        {
          id: 'tc1',
          user_id: ZACK,
          date: DAY,
          clock_in_time: '2026-08-17T11:00:00.000Z',
          clock_out_time: '2026-08-17T20:00:00.000Z',
          net_hours: 8.5,
          total_hours: 8.5,
        },
      ],
      logs: [],
      workItems: [],
      roles,
      names,
      scheduledPersonDays: new Set([`${ZACK}|${DAY}`]),
      todayYMD: '2026-08-19',
    });
    expect(days[0].people[0].scheduled_only).toBeUndefined();
    expect(days[0].people[0].hours).toBe(8.5);
  });

  it('refuses a FUTURE placement — the board holds next week', () => {
    const days = buildTicketDays({
      range: { from: '2026-08-17', to: '2026-08-30' },
      timecards: [],
      logs: [],
      workItems: [],
      roles,
      names,
      scheduledPersonDays: new Set([`${ZACK}|2026-08-25`]),
      todayYMD: '2026-08-19',
    });
    expect(days).toHaveLength(0);
  });
});

/**
 * CONRADE, 8/06, JOB-2026-521763 — 8.58 HOURS THE SHEET CALLED ABSENT.
 *
 * The board placed him on this job AND on JOB-2026-859542 that day, his card
 * carried no job tag, and `attributableTimecards` dropped it rather than guess
 * how the day divided. Correct. But the drop left no trace, so the row printed
 * under `scheduled_only` — "no clock card was recorded" — about a man with a
 * ten-hour card in the database. The office reads that and goes looking for a
 * card that is sitting right there.
 *
 * A split day is its own fact and prints its own mark.
 */
describe('buildTicketDays — a split day is not a missing card', () => {
  const DAY = '2026-08-06';

  it('flags the split instead of asserting nothing was clocked', () => {
    const days = buildTicketDays({
      range: { from: DAY, to: DAY },
      timecards: [],
      logs: [],
      workItems: [],
      roles,
      names,
      scheduledPersonDays: new Set([`${ZACK}|${DAY}`]),
      splitPersonDays: new Set([`${ZACK}|${DAY}`]),
      todayYMD: '2026-08-19',
    });
    expect(days[0].people[0]).toMatchObject({ user_id: ZACK, hours: null, hours_split: true });
    // Mutually exclusive — one blank Total cannot carry two explanations, and
    // only the split one is true here.
    expect(days[0].people[0].scheduled_only).toBeUndefined();
  });

  it('marks only the person whose day was split, not everyone on the date', () => {
    const days = buildTicketDays({
      range: { from: DAY, to: DAY },
      timecards: [],
      logs: [],
      workItems: [],
      roles,
      names,
      scheduledPersonDays: new Set([`${ZACK}|${DAY}`, `${LUCAS}|${DAY}`]),
      // Only Conrade's day was ambiguous. A date-level set could not say that.
      splitPersonDays: new Set([`${ZACK}|${DAY}`]),
      todayYMD: '2026-08-19',
    });
    const zack = days[0].people.find((p) => p.user_id === ZACK)!;
    const lucas = days[0].people.find((p) => p.user_id === LUCAS)!;
    expect(zack.hours_split).toBe(true);
    expect(lucas.hours_split).toBeUndefined();
    expect(lucas.scheduled_only).toBe(true);
  });

  it('never flags a day whose hours DID land — a linked card outranks the ledger', () => {
    const days = buildTicketDays({
      range: { from: DAY, to: DAY },
      timecards: [
        {
          id: 'tc-linked',
          user_id: ZACK,
          date: DAY,
          clock_in_time: '2026-08-06T11:00:00.000Z',
          clock_out_time: '2026-08-06T20:00:00.000Z',
          net_hours: 8.58,
          total_hours: 8.58,
        },
      ],
      logs: [],
      workItems: [],
      roles,
      names,
      scheduledPersonDays: new Set([`${ZACK}|${DAY}`]),
      splitPersonDays: new Set([`${ZACK}|${DAY}`]),
      todayYMD: '2026-08-19',
    });
    expect(days[0].people[0].hours).toBe(8.58);
    expect(days[0].people[0].hours_split).toBeUndefined();
    expect(days[0].people[0].scheduled_only).toBeUndefined();
  });
});

/**
 * THE FOLD MUST NOT LAND ON A DAY NOBODY CLOCKED.
 *
 * Seeding the board's placements into `byDate` made every scheduled person-day
 * an eligible target for the closeout fold. A closeout's measurements could
 * then be re-dated onto a day whose only evidence is a line on the schedule —
 * and the arrival of that work cleared the row's own `‡`, so the sheet ended up
 * asserting the crew was here and cut this, with nothing behind it.
 */
describe('buildTicketDays — the closeout fold skips board-seeded blanks', () => {
  const SEEDED = '2026-08-10';
  const WORKED = '2026-08-11';
  const FILED = '2026-08-12';

  const build = () =>
    buildTicketDays({
      range: { from: SEEDED, to: FILED },
      timecards: [
        {
          id: 'tc-worked',
          user_id: ZACK,
          date: WORKED,
          clock_in_time: '2026-08-11T11:00:00.000Z',
          clock_out_time: '2026-08-11T21:00:00.000Z',
          net_hours: 9.5,
          total_hours: 9.5,
        },
      ],
      logs: [
        {
          id: 'log-closeout',
          operator_id: ZACK,
          log_date: FILED,
          day_number: 3,
          hours_worked: 0.09,
          work_performed: [{ type: 'WALL SAW', depth: 12, quantity: 40 }],
          notes: 'Job complete.',
        },
      ],
      workItems: [],
      roles,
      names,
      fallbackOperatorId: ZACK,
      quantitiesFrom: 'lead',
      // The board held 8/10 open for him and he never clocked or filed a thing.
      scheduledPersonDays: new Set([`${ZACK}|${SEEDED}`]),
      // 8/12 he was provably on another job; the closeout was typed from it.
      offJobPersonDays: new Set([`${ZACK}|${FILED}`]),
      todayYMD: '2026-08-19',
    });

  it('folds onto the last day he was really here, not the seeded blank', () => {
    const days = build();
    const seeded = days.find((d) => d.date === SEEDED)!;
    const worked = days.find((d) => d.date === WORKED)!;

    expect(worked.people[0].logged_work).toHaveLength(1);
    expect(worked.people[0].work_filed_on).toBe(FILED);
    // The seeded day keeps its empty hands AND its honest flag.
    expect(seeded.people[0].logged_work).toHaveLength(0);
    expect(seeded.people[0].work_items).toHaveLength(0);
    expect(seeded.people[0].scheduled_only).toBe(true);
    expect(seeded.people[0].hours).toBeNull();
  });

  it('leaves no phantom hours on the filing day', () => {
    const days = build();
    expect(days.find((d) => d.date === FILED)).toBeUndefined();
    expect(grandTotalHours(days)).toBe(9.5);
  });
});

describe('workItemDepths / aggregateWorkPerformed', () => {
  it('reads depth off the flat columns, the cuts, the areas and the holes', () => {
    expect(workItemDepths({ work_type: 'SAW', cut_depth_inches: 6 })).toEqual([6]);
    expect(
      workItemDepths({ work_type: 'SAW', details_json: { cuts: [{ cutDepth: 8 }, { cutDepth: 4 }] } })
    ).toEqual([4, 8]);
    expect(
      workItemDepths({ work_type: 'SAW', details_json: { cuts: [{ areas: [{ depth: 10 }] }] } })
    ).toEqual([10]);
    expect(
      workItemDepths({ work_type: 'CORE', details_json: { holes: [{ depthInches: 12 }] } })
    ).toEqual([12]);
    expect(
      workItemDepths({ work_type: 'BROKK', details_json: { areas: [{ thickness: 5 }] } })
    ).toEqual([5]);
  });

  it('de-duplicates one depth recorded twice and sorts ascending', () => {
    expect(
      workItemDepths({
        work_type: 'SAW',
        cut_depth_inches: 6,
        details_json: { cuts: [{ cutDepth: 6 }, { cutDepth: 4 }] },
      })
    ).toEqual([4, 6]);
  });

  it('records NO depth rather than inventing one', () => {
    expect(workItemDepths({ work_type: 'HAULING', quantity: 3 })).toEqual([]);
    expect(aggregateWorkPerformed([{ work_type: 'HAULING', quantity: 3 }])[0].depths).toEqual([]);
  });

  it('keeps the quantity rule identical to totalsByWorkType', () => {
    const items = [
      { work_type: 'WALL SAW', quantity: 40, cut_depth_inches: 6 },
      { work_type: 'WALL SAW', quantity: 20, cut_depth_inches: 8 },
    ];
    expect(aggregateWorkPerformed(items).map(({ depths, ...rest }) => rest)).toEqual(
      totalsByWorkType(items)
    );
  });
});

describe('closeoutFilingDates', () => {
  it('lifts the fold stamp off the person-days so the footnote can print it', () => {
    expect(
      closeoutFilingDates([
        {
          date: '2026-08-11',
          total_hours: 10,
          people: [{ ...blank(ZACK), work_filed_on: '2026-08-13' }],
        },
      ])
    ).toEqual(['2026-08-13']);
  });

  it('treats a block kept in place as filed on its own date', () => {
    expect(
      closeoutFilingDates([
        {
          date: '2026-08-13',
          total_hours: 0,
          people: [{ ...blank(ZACK), filed_off_job: true }],
        },
      ])
    ).toEqual(['2026-08-13']);
  });

  it('is empty on an ordinary ticket', () => {
    expect(closeoutFilingDates([{ date: '2026-08-11', total_hours: 8, people: [blank(ZACK)] }])).toEqual(
      []
    );
  });
});

function blank(userId: string) {
  return {
    user_id: userId,
    name: 'Zack',
    role: 'lead' as const,
    clock_in: null,
    clock_out: null,
    lunch_minutes: null,
    hours: null,
    work_items: [],
    logged_work: [],
    log_note: null,
    helper_note: null,
  };
}
