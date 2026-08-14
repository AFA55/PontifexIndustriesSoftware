import { findMissedTickets, missedTicketMessage, type MissedDayInputs } from './missing-ticket';

const jobs = new Map([
  ['job-am-king', { job_number: 'JOB-2026-914932', customer_name: 'AM King' }],
  ['job-parkk', { job_number: 'JOB-2026-402357', customer_name: 'Parkk Concrete' }],
]);

function inputs(over: Partial<MissedDayInputs> = {}): MissedDayInputs {
  return {
    placements: [],
    clockedIn: new Set(),
    filed: new Set(),
    jobs,
    ...over,
  };
}

describe('findMissedTickets', () => {
  it("catches Dante's Wednesday: placed, clocked in, never filed", () => {
    const missed = findMissedTickets(
      inputs({
        placements: [
          { job_order_id: 'job-am-king', operator_id: 'dante', assignment_date: '2026-08-12' },
        ],
        clockedIn: new Set(['dante|2026-08-12']),
        filed: new Set(['job-am-king|dante|2026-08-13']), // Thursday was filed
      })
    );
    expect(missed).toHaveLength(1);
    expect(missed[0]).toMatchObject({
      userId: 'dante',
      jobOrderId: 'job-am-king',
      date: '2026-08-12',
      customerName: 'AM King',
    });
  });

  it('stays silent once the ticket is filed', () => {
    expect(
      findMissedTickets(
        inputs({
          placements: [
            { job_order_id: 'job-am-king', operator_id: 'dante', assignment_date: '2026-08-13' },
          ],
          clockedIn: new Set(['dante|2026-08-13']),
          filed: new Set(['job-am-king|dante|2026-08-13']),
        })
      )
    ).toEqual([]);
  });

  it('does NOT chase a day nobody showed up for — a placement is a plan', () => {
    // Aiden is on the board for Saturday Aug 8 and has no timecard for it.
    expect(
      findMissedTickets(
        inputs({
          placements: [
            { job_order_id: 'job-parkk', operator_id: 'aiden', assignment_date: '2026-08-08' },
          ],
          clockedIn: new Set(['aiden|2026-08-07']),
        })
      )
    ).toEqual([]);
  });

  it('ignores placements with no named lead (empty board skeletons)', () => {
    expect(
      findMissedTickets(
        inputs({
          placements: [
            { job_order_id: 'job-am-king', operator_id: null, assignment_date: '2026-08-14' },
          ],
          clockedIn: new Set(['dante|2026-08-14']),
        })
      )
    ).toEqual([]);
  });

  it('asks once when a person is re-placed on the same job the same day', () => {
    const missed = findMissedTickets(
      inputs({
        placements: [
          { job_order_id: 'job-parkk', operator_id: 'aiden', assignment_date: '2026-08-04' },
          { job_order_id: 'job-parkk', operator_id: 'aiden', assignment_date: '2026-08-04' },
        ],
        clockedIn: new Set(['aiden|2026-08-04']),
      })
    );
    expect(missed).toHaveLength(1);
  });

  it('reports two jobs on one day separately — each needs its own ticket', () => {
    const missed = findMissedTickets(
      inputs({
        placements: [
          { job_order_id: 'job-parkk', operator_id: 'aiden', assignment_date: '2026-08-04' },
          { job_order_id: 'job-am-king', operator_id: 'aiden', assignment_date: '2026-08-04' },
        ],
        clockedIn: new Set(['aiden|2026-08-04']),
      })
    );
    expect(missed).toHaveLength(2);
  });

  it('returns oldest first, so the longest-open ticket is chased first', () => {
    const missed = findMissedTickets(
      inputs({
        placements: [
          { job_order_id: 'job-am-king', operator_id: 'dante', assignment_date: '2026-08-12' },
          { job_order_id: 'job-parkk', operator_id: 'dante', assignment_date: '2026-08-04' },
        ],
        clockedIn: new Set(['dante|2026-08-12', 'dante|2026-08-04']),
      })
    );
    expect(missed.map((m) => m.date)).toEqual(['2026-08-04', '2026-08-12']);
  });
});

describe('missedTicketMessage', () => {
  it('names the day and the customer, not "your previous ticket"', () => {
    const { title, message } = missedTicketMessage(
      {
        userId: 'dante',
        jobOrderId: 'job-am-king',
        date: '2026-08-12',
        jobNumber: 'JOB-2026-914932',
        customerName: 'AM King',
      },
      'Wednesday'
    );
    expect(title).toBe("Wednesday's ticket is still open");
    expect(message).toContain('AM King');
    expect(message).toContain('Wednesday');
  });

  it('falls back to the job number when the customer is blank', () => {
    const { message } = missedTicketMessage(
      {
        userId: 'x',
        jobOrderId: 'j',
        date: '2026-08-12',
        jobNumber: 'JOB-2026-914932',
        customerName: null,
      },
      'Wednesday'
    );
    expect(message).toContain('JOB-2026-914932');
  });
});
