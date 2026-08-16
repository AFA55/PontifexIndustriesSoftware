/**
 * The wording of a cross-company refusal. See lib/tenant-scope.ts for why this
 * stays a 404 rather than becoming an explicit "that belongs to Patriot".
 */

import { notFoundInCompanyMessage } from './tenant-scope';

describe('notFoundInCompanyMessage', () => {
  it('names the company the user IS in, so the cause is obvious', () => {
    const msg = notFoundInCompanyMessage('Pontifex Industries');
    expect(msg).toContain('Pontifex Industries');
    expect(msg).toMatch(/signed in to/i);
    expect(msg).toMatch(/company's code/i);
  });

  it('never names the company that DOES own the record', () => {
    // The whole point: a 404 that confirmed "it's over at Patriot" would let
    // anyone walk ids to enumerate another tenant's data.
    const msg = notFoundInCompanyMessage('Pontifex Industries');
    expect(msg).not.toMatch(/patriot/i);
  });

  it('only ever speculates that the record might live elsewhere', () => {
    // "IF it belongs to a different company" is a conditional and gives nothing
    // away. A bare assertion — "it belongs to another company", "this exists on
    // another account" — would confirm the record is real, which is exactly the
    // leak the 404 exists to prevent.
    const msg = notFoundInCompanyMessage('Pontifex Industries');
    expect(msg).toMatch(/if it belongs to a different company/i);
    expect(msg).not.toMatch(/(?<!if )it belongs to (a|another) (different )?compan/i);
    expect(msg).not.toMatch(/exists (on|in) another/i);
  });

  it('degrades to a plain sentence when the company name is unknown', () => {
    // A failed tenant lookup must never break the error path itself.
    expect(notFoundInCompanyMessage(null)).toBe('This job was not found.');
  });

  it('adapts the noun for records that are not jobs', () => {
    expect(notFoundInCompanyMessage(null, 'customer')).toBe('This customer was not found.');
    expect(notFoundInCompanyMessage('Acme', 'invoice')).toContain('This invoice was not found in Acme');
  });

  it('reads as one sentence a non-technical user can act on', () => {
    const msg = notFoundInCompanyMessage('Patriot Concrete Cutting');
    expect(msg).not.toMatch(/tenant|404|scope|RLS/i);
  });
});
