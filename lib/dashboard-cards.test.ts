import {
  PM_DASHBOARD_SECTIONS,
  addableFeatureCards,
  allKnownPmCardIds,
  availableFeatureCards,
  featureCardId,
  featureCardKey,
  isSectionAllowed,
  restorableSections,
  sanitizeCardIds,
  visibleFeatureCards,
  visibleSections,
  withId,
  withoutId,
  type DashboardSection,
} from '@/lib/dashboard-cards';

const PM = 'salesman';

describe('sections — removable, but role still decides', () => {
  it('shows every section by default', () => {
    const v = visibleSections(PM_DASHBOARD_SECTIONS, { role: PM, permissions: null });
    expect(v.map((s) => s.id)).toEqual(PM_DASHBOARD_SECTIONS.map((s) => s.id));
  });

  it('hides a removed section and offers it back', () => {
    const ctx = { role: PM, permissions: null, hidden: ['commissions'] };
    expect(visibleSections(PM_DASHBOARD_SECTIONS, ctx).map((s) => s.id)).not.toContain('commissions');
    expect(restorableSections(PM_DASHBOARD_SECTIONS, ctx).map((s) => s.id)).toEqual(['commissions']);
  });

  it('an unknown hidden id changes nothing', () => {
    const v = visibleSections(PM_DASHBOARD_SECTIONS, {
      role: PM,
      permissions: null,
      hidden: ['not_a_section'],
    });
    expect(v).toHaveLength(PM_DASHBOARD_SECTIONS.length);
  });

  it('a role-gated section stays hidden when the role forbids it — even unhidden', () => {
    const gated: DashboardSection[] = [
      { id: 'gated', label: 'Timecards', description: '', requiresCardKey: 'timecards' },
    ];
    // A PM (salesman) has no timecards permission.
    expect(isSectionAllowed(gated[0], PM, null)).toBe(false);
    expect(visibleSections(gated, { role: PM, permissions: null })).toHaveLength(0);
    // ...and it is not offered in the restore list either — restoring is not a back door.
    expect(restorableSections(gated, { role: PM, permissions: null, hidden: ['gated'] })).toHaveLength(0);
    // An admin, who does have it, sees it.
    expect(visibleSections(gated, { role: 'admin', permissions: null })).toHaveLength(1);
  });

  it('a per-user permission override beats the role preset', () => {
    const gated: DashboardSection[] = [
      { id: 'gated', label: 'Timecards', description: '', requiresCardKey: 'timecards' },
    ];
    expect(visibleSections(gated, { role: PM, permissions: { timecards: 'view' } })).toHaveLength(1);
    expect(visibleSections(gated, { role: 'admin', permissions: { timecards: 'none' } })).toHaveLength(0);
  });
});

describe('feature cards — addable, intersected with permission', () => {
  it('offers a PM only the cards their preset grants', () => {
    const keys = availableFeatureCards(PM, null).map((c) => c.key);
    // From ROLE_PERMISSION_PRESETS.salesman
    expect(keys).toEqual(
      expect.arrayContaining([
        'schedule_form',
        'schedule_board',
        'customer_profiles',
        'completed_jobs',
        'contracts',
        'employee_reviews',
      ])
    );
    expect(keys).not.toContain('timecards');
    expect(keys).not.toContain('billing');
    expect(keys).not.toContain('team_management');
  });

  it('renders a card the user added and their role permits', () => {
    const v = visibleFeatureCards({
      role: PM,
      permissions: null,
      added: [featureCardId('schedule_board')],
    });
    expect(v.map((c) => c.key)).toEqual(['schedule_board']);
  });

  it('NEVER renders a card the role forbids, however it got into the stored list', () => {
    const v = visibleFeatureCards({
      role: PM,
      permissions: null,
      added: [featureCardId('timecards'), featureCardId('billing'), featureCardId('team_management')],
    });
    expect(v).toHaveLength(0);
  });

  it('honours a per-user grant of an otherwise-forbidden card', () => {
    const v = visibleFeatureCards({
      role: PM,
      permissions: { timecards: 'view' },
      added: [featureCardId('timecards')],
    });
    expect(v.map((c) => c.key)).toEqual(['timecards']);
  });

  it('honours a per-user REVOCATION even when the card was already added', () => {
    const v = visibleFeatureCards({
      role: PM,
      permissions: { schedule_board: 'none' },
      added: [featureCardId('schedule_board')],
    });
    expect(v).toHaveLength(0);
  });

  it('super_admin bypass grants everything', () => {
    expect(availableFeatureCards('super_admin', null).length).toBeGreaterThan(10);
  });

  it('the add menu is the permitted set minus what is already on the dashboard', () => {
    const added = [featureCardId('schedule_board')];
    const menu = addableFeatureCards({ role: PM, permissions: null, added }).map((c) => c.key);
    expect(menu).not.toContain('schedule_board');
    expect(menu).toContain('customer_profiles');
  });
});

describe('id helpers', () => {
  it('round-trips a card key', () => {
    expect(featureCardKey(featureCardId('billing'))).toBe('billing');
    expect(featureCardKey('my_jobs')).toBeNull();
  });

  it('withId / withoutId are pure and de-duplicate', () => {
    expect(withId(['a'], 'b')).toEqual(['a', 'b']);
    expect(withId(['a'], 'a')).toEqual(['a']);
    expect(withoutId(['a', 'b'], 'a')).toEqual(['b']);
    expect(withId(null, 'a')).toEqual(['a']);
    expect(withoutId(undefined, 'a')).toEqual([]);
  });
});

describe('sanitizeCardIds — the server-side scrub', () => {
  const allowed = allKnownPmCardIds();

  it('keeps known ids, drops everything else', () => {
    expect(sanitizeCardIds(['my_jobs', 'nonsense', featureCardId('billing')], allowed)).toEqual([
      'my_jobs',
      featureCardId('billing'),
    ]);
  });

  it('drops non-strings, de-duplicates, and survives junk input', () => {
    expect(sanitizeCardIds(['my_jobs', 'my_jobs', 42, null, {}], allowed)).toEqual(['my_jobs']);
    expect(sanitizeCardIds('my_jobs', allowed)).toEqual([]);
    expect(sanitizeCardIds(null, allowed)).toEqual([]);
    expect(sanitizeCardIds(undefined, allowed)).toEqual([]);
  });

  it('caps the stored list', () => {
    const big = Array.from({ length: 500 }, (_, i) => `id_${i}`);
    expect(sanitizeCardIds(big, big).length).toBe(100);
  });

  it('recognises every section id and every admin card id', () => {
    expect(allowed).toEqual(expect.arrayContaining(PM_DASHBOARD_SECTIONS.map((s) => s.id)));
    expect(allowed).toEqual(expect.arrayContaining([featureCardId('billing')]));
  });
});
