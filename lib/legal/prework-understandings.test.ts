import { preWorkUnderstandings, ticketChecklist } from './prework-understandings';
import { STANDBY_HOURLY_RATE, STANDBY_MINIMUM_HOURS, calculateStandbyCharge } from './standby-policy';

const clauses = (opts: Parameters<typeof preWorkUnderstandings>[0]) =>
  preWorkUnderstandings(opts).join('\n');

describe('preWorkUnderstandings — standby terms', () => {
  it('bills PER HOUR, never per man hour (calculateStandbyCharge has no headcount multiplier)', () => {
    const text = clauses({ companyName: 'Patriot Concrete Cutting', standbyRate: 189 });
    expect(text).toContain('$189 per hour');
    expect(text).not.toMatch(/man hour/i);
    // Two men, one hour on standby → one hour billed, not two.
    expect(calculateStandbyCharge(1)).toBe(STANDBY_HOURLY_RATE);
  });

  it('falls back to the rate the API actually bills — never a ticket-only number', () => {
    const text = clauses({ companyName: 'Acme Cutting' });
    expect(text).toContain(`$${STANDBY_HOURLY_RATE.toFixed(0)} per hour`);
  });

  it('states the same minimum charge the calculator applies', () => {
    const text = clauses({ companyName: 'Acme Cutting' });
    expect(text).toContain(`${STANDBY_MINIMUM_HOURS} hour minimum`);
    // The minimum is real: half an hour still bills the full minimum.
    expect(calculateStandbyCharge(0.5)).toBe(calculateStandbyCharge(STANDBY_MINIMUM_HOURS));
  });

  it('uses a tenant policy rate and minimum when supplied', () => {
    const text = clauses({ companyName: 'Acme', standbyRate: 60.5, standbyMinimumHours: 2 });
    expect(text).toContain('$60.50 per hour (2 hours minimum)');
  });

  it('ignores a zero/garbage policy rate rather than printing $0', () => {
    expect(clauses({ companyName: 'Acme', standbyRate: 0 })).toContain(
      `$${STANDBY_HOURLY_RATE.toFixed(0)} per hour`
    );
  });
});

describe('preWorkUnderstandings — white label', () => {
  it('never hardcodes a tenant name', () => {
    const text = clauses({ companyName: 'Acme Cutting' });
    expect(text).not.toMatch(/patriot/i);
    expect(text).toContain('Acme Cutting is not responsible');
    expect(text).toContain('ACME CUTTING SHALL NOT BE RESPONSIBLE FOR LAYOUT OR ENGINEERING');
  });
});

describe('ticketChecklist', () => {
  it('omits the slurry price when the tenant has none configured', () => {
    const item = ticketChecklist().find((i) => i.n === 9)!;
    expect(item.text).toBe('Did you remove slurry & from site?  Yes / No');
    expect(item.text).not.toContain('$');
  });

  it('prints a configured slurry price', () => {
    const item = ticketChecklist({ slurryBarrelPrice: 45 }).find((i) => i.n === 9)!;
    expect(item.text).toContain('Yes $45 per barrel / No');
  });

  it('carries no price literal on any other line', () => {
    for (const item of ticketChecklist()) expect(item.text).not.toContain('$');
  });

  it('keeps all ten paper items with their answer style', () => {
    const list = ticketChecklist();
    expect(list.map((i) => i.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Item 9's Yes/No is inside its verbatim text — no second pair appended.
    expect(list.find((i) => i.n === 9)!.answer).toBe('none');
  });
});
