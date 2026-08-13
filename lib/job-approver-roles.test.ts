import { JOB_APPROVER_ROLES, ADMIN_ROLES } from './api-auth';

/**
 * Founder, Aug 13: "Give permission to Adam Ingalls and David Schadt, the
 * supervisors — add this to their permissions so they could push jobs if I'm
 * not here."
 *
 * Adam is a `salesman`, David a `supervisor`. Approval sat behind
 * `requireAdmin`, so neither could release a job and the schedule stalled
 * whenever the founder was away.
 */
describe('JOB_APPROVER_ROLES', () => {
  it('lets the supervisor and the salesman push a job', () => {
    expect(JOB_APPROVER_ROLES).toContain('supervisor'); // David Schadt
    expect(JOB_APPROVER_ROLES).toContain('salesman'); // Adam Ingalls
  });

  it('keeps the office roles that could already approve', () => {
    for (const r of ADMIN_ROLES) expect(JOB_APPROVER_ROLES).toContain(r);
  });

  it('does NOT let the crew approve their own work', () => {
    for (const r of ['operator', 'apprentice', 'shop_help', 'inventory_manager', 'shop_manager']) {
      expect(JOB_APPROVER_ROLES).not.toContain(r);
    }
  });

  // The whole point of a separate constant: widening ADMIN_ROLES to fix one
  // button would have handed a salesman every admin route on the platform —
  // timecard edits, team permissions, deletions.
  it('is a SEPARATE grant, so approving does not imply full admin', () => {
    expect(ADMIN_ROLES).not.toContain('salesman');
    expect(ADMIN_ROLES).not.toContain('supervisor');
  });
});
