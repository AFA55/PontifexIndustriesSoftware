import {
  ADMIN_ROLES,
  SALES_STAFF_ROLES,
  PRINT_VIEWER_ROLES,
  DISPATCH_TICKET_ROLES,
} from './api-auth';

/**
 * Founder, Aug 17: "fix permissions… check for project managers as well — we
 * need to have them able to print out tickets and other things."
 *
 * The people he calls project managers hold `salesman` (Adam Ingalls, Jeter
 * Yates, Demo Project Manager) or `supervisor` (David Schadt, Demo Supervisor)
 * — verified against production. All five roles can OPEN a job, because the job
 * page admits them and `/api/admin/jobs/[id]/summary` is requireSalesStaff. The
 * printing routes were narrower, each in its own way:
 *
 *   work-ticket  → requireAdmin        (salesman + supervisor 403)
 *   waiver-pdf   → requireAdmin        (salesman + supervisor 403, while the
 *                                       documents list that links it did not)
 *   dispatch-pdf → hand-rolled array   (omitted supervisor only)
 *
 * These tests pin the one rule those three now share, so the next person to
 * touch a print route cannot re-open the gap by hand-rolling another list.
 */
describe('print permissions', () => {
  it('lets the project managers print — salesman AND supervisor', () => {
    expect(PRINT_VIEWER_ROLES).toContain('salesman'); // Adam Ingalls, Jeter Yates
    expect(PRINT_VIEWER_ROLES).toContain('supervisor'); // David Schadt
  });

  it('keeps every office role that could already print', () => {
    for (const r of ADMIN_ROLES) expect(PRINT_VIEWER_ROLES).toContain(r);
  });

  /**
   * The whole point of the change: printing is allowed for exactly the set that
   * may already SEE the job. If these ever diverge, some surface is again
   * showing a button whose API refuses the click.
   */
  it('is exactly the set that may already see the job', () => {
    expect([...PRINT_VIEWER_ROLES].sort()).toEqual([...SALES_STAFF_ROLES].sort());
  });

  it('does not admit the crew to office paperwork', () => {
    for (const r of ['operator', 'apprentice', 'shop_help', 'inventory_manager', 'shop_manager']) {
      expect(PRINT_VIEWER_ROLES).not.toContain(r);
    }
  });

  /**
   * Widening the print surfaces must not widen admin. `requireAdmin` still
   * guards everything that mutates a job — timecard edits, deletions, change
   * orders — and a salesman must not have inherited any of it.
   */
  it('does NOT make a project manager an admin', () => {
    expect(ADMIN_ROLES).not.toContain('salesman');
    expect(ADMIN_ROLES).not.toContain('supervisor');
  });

  describe('dispatch ticket', () => {
    it('still lets the crew print their own ticket', () => {
      // /dashboard/my-jobs/[id] prints this. Removing `operator` would take the
      // ticket away from the people the ticket is FOR.
      expect(DISPATCH_TICKET_ROLES).toContain('operator');
    });

    it('adds the supervisor the hand-rolled list had dropped', () => {
      expect(DISPATCH_TICKET_ROLES).toContain('supervisor');
    });

    it('is the print set plus the operator, and nothing else', () => {
      expect([...DISPATCH_TICKET_ROLES].sort()).toEqual(
        [...PRINT_VIEWER_ROLES, 'operator'].sort()
      );
    });

    it('does not admit the apprentice', () => {
      // Helpers work off the lead's ticket; this was never granted and stays so.
      expect(DISPATCH_TICKET_ROLES).not.toContain('apprentice');
    });
  });
});
