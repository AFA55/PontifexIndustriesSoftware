import { getCardPermission } from '@/lib/rbac';
describe('operator_view card visibility', () => {
  it('is available to the roles who run their own jobs', () => {
    expect(getCardPermission(null, 'operator_view', 'operations_manager')).not.toBe('none');
    expect(getCardPermission(null, 'operator_view', 'supervisor')).not.toBe('none');
    expect(getCardPermission(null, 'operator_view', 'super_admin')).not.toBe('none');
  });
  it('is NOT shown to the crew — they are already there', () => {
    expect(getCardPermission(null, 'operator_view', 'operator')).toBe('none');
    expect(getCardPermission(null, 'operator_view', 'apprentice')).toBe('none');
  });
  it('is not shown to office-only roles', () => {
    expect(getCardPermission(null, 'operator_view', 'admin')).toBe('none');
    expect(getCardPermission(null, 'operator_view', 'salesman')).toBe('none');
  });
});
