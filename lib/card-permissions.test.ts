import {
  cardPermissionDecision,
  meetsCardPermission,
  PERMISSION_RANK,
  STORABLE_CARD_LEVELS,
  isStorableCardLevel,
  toStorableOverrides,
} from './card-permissions';
import type { PermissionLevel } from './rbac';
import { ROLE_PERMISSION_PRESETS } from './rbac';

/**
 * The rule this file exists to defend: a per-user grant must actually reach the
 * reader.
 *
 * `user_card_permissions` was empty on the day this was written — every call
 * site passed `null`, so Team Management could save a grant, report success, and
 * change nothing. Amanda runs Patriot's billing and payroll on the `admin` role,
 * whose preset is `timecards: 'view'`, and the approve buttons are gated on
 * 'full'. She could watch payroll happen and not act on it.
 */
describe('cardPermissionDecision', () => {
  const AMANDA = { role: 'admin', cardKey: 'timecards' as const };

  it('THE FIX: a per-user override beats the role preset', () => {
    // Preset says view. The override says full. Full wins.
    expect(ROLE_PERMISSION_PRESETS.admin.timecards).toBe('view');

    const d = cardPermissionDecision({
      role: AMANDA.role,
      userPermissions: { timecards: 'full' },
      cardKey: AMANDA.cardKey,
      required: 'full',
    });

    expect(d).toEqual({ allowed: true, effective: 'full', source: 'user_override' });
  });

  it('with no override, falls back to the role preset (and payroll stays refused)', () => {
    const d = cardPermissionDecision({
      role: 'admin',
      userPermissions: null,
      cardKey: 'timecards',
      required: 'full',
    });

    expect(d).toEqual({ allowed: false, effective: 'view', source: 'role_preset' });
  });

  it('an override can REMOVE access the preset grants, not only add it', () => {
    // customer_profiles is 'full' for admin by preset. A tenant that does not
    // want this person editing customers must be able to say so.
    expect(ROLE_PERMISSION_PRESETS.admin.customer_profiles).toBe('full');

    const d = cardPermissionDecision({
      role: 'admin',
      userPermissions: { customer_profiles: 'view' },
      cardKey: 'customer_profiles',
      required: 'full',
    });

    expect(d).toEqual({ allowed: false, effective: 'view', source: 'user_override' });
  });

  it('an override on ONE card leaves every other card on the preset', () => {
    const perms = { timecards: 'full' as const };

    // Granted card
    expect(
      cardPermissionDecision({ role: 'admin', userPermissions: perms, cardKey: 'timecards', required: 'full' })
    ).toMatchObject({ allowed: true, source: 'user_override' });

    // Untouched card — still the preset's answer, not the granted level.
    expect(
      cardPermissionDecision({ role: 'admin', userPermissions: perms, cardKey: 'team_management', required: 'full' })
    ).toMatchObject({ allowed: false, effective: 'view', source: 'role_preset' });
  });

  it('bypass roles are unaffected by overrides — including an attempt to strip them', () => {
    for (const role of ['super_admin', 'operations_manager']) {
      const d = cardPermissionDecision({
        role,
        userPermissions: { timecards: 'none' },
        cardKey: 'timecards',
        required: 'full',
      });
      expect(d).toEqual({ allowed: true, effective: 'full', source: 'bypass_role' });
    }
  });

  it('an unknown or missing role gets nothing', () => {
    expect(
      cardPermissionDecision({ role: undefined, userPermissions: null, cardKey: 'timecards', required: 'view' })
    ).toEqual({ allowed: false, effective: 'none', source: 'role_preset' });

    expect(
      cardPermissionDecision({ role: 'janitor', userPermissions: null, cardKey: 'timecards', required: 'view' })
    ).toMatchObject({ allowed: false, effective: 'none' });
  });

  it('a grant BELOW the required level is still a refusal (view ≠ approve)', () => {
    const d = cardPermissionDecision({
      role: 'admin',
      userPermissions: { timecards: 'submit' },
      cardKey: 'timecards',
      required: 'full',
    });
    expect(d).toEqual({ allowed: false, effective: 'submit', source: 'user_override' });
  });

  it('billing: the office keeps its preset view and the override raises it to full', () => {
    expect(ROLE_PERMISSION_PRESETS.admin.billing).toBe('view');
    expect(
      cardPermissionDecision({ role: 'admin', userPermissions: null, cardKey: 'billing', required: 'full' })
    ).toMatchObject({ allowed: false, effective: 'view' });
    expect(
      cardPermissionDecision({ role: 'admin', userPermissions: { billing: 'full' }, cardKey: 'billing', required: 'full' })
    ).toMatchObject({ allowed: true, effective: 'full' });
  });
});

describe('meetsCardPermission', () => {
  it('orders the four levels none < view < submit < full', () => {
    expect(PERMISSION_RANK).toEqual({ none: 0, view: 1, submit: 2, full: 3 });
  });

  it('is a MINIMUM, not an equality test', () => {
    expect(meetsCardPermission('full', 'view')).toBe(true);
    expect(meetsCardPermission('submit', 'view')).toBe(true);
    expect(meetsCardPermission('view', 'view')).toBe(true);
    expect(meetsCardPermission('none', 'view')).toBe(false);
    expect(meetsCardPermission('view', 'full')).toBe(false);
  });
});

/**
 * THE LEVEL THE TABLE REFUSES.
 *
 * `user_card_permissions` has a CHECK: `permission_level = ANY
 * (ARRAY['none','view','full'])`. The pickers offered a fourth, `submit` — and
 * worse, they SEED from the role preset, and several presets carry it
 * (`admin.schedule_form`, `supervisor.site_visits`, `salesman.contracts`). So
 * editing any admin, supervisor or salesman put a rejected value into the
 * payload with nobody clicking it.
 *
 * The upsert is ONE batch. Postgres rejects the whole array, the route answers
 * "Failed to update card permissions", and NOTHING lands — including the
 * `timecards: 'full'` grant the office came to make. A grant typed in,
 * confirmed, and silently absent: the same defect as the one that started all
 * this, arriving through the screen built to fix it.
 */
describe('STORABLE_CARD_LEVELS', () => {
  it('is exactly what the production CHECK accepts', () => {
    expect(STORABLE_CARD_LEVELS).toEqual(['none', 'view', 'full']);
  });

  it('excludes submit — a role-preset level, never a per-user override', () => {
    expect(isStorableCardLevel('submit')).toBe(false);
    expect(isStorableCardLevel('full')).toBe(true);
    expect(isStorableCardLevel('nonsense')).toBe(false);
  });
});

describe('toStorableOverrides', () => {
  it('keeps the grant and drops the preset-sourced submit that would sink it', () => {
    // Exactly the payload the editor builds for Amanda: her admin preset
    // (schedule_form: submit) plus the one thing the office changed.
    expect(
      toStorableOverrides({
        timecards: 'full',
        schedule_form: 'submit',
        billing: 'full',
        analytics: 'view',
      })
    ).toEqual({ timecards: 'full', billing: 'full', analytics: 'view' });
  });

  it('DROPS submit rather than rounding it to view', () => {
    // Rounding would write an explicit override, and an override BEATS the
    // preset — quietly demoting every supervisor whose row anyone ever saved.
    // Dropping leaves no row, so the preset keeps supplying `submit` unchanged.
    const out = toStorableOverrides({ site_visits: 'submit' });
    expect(out).toEqual({});
    expect(out).not.toHaveProperty('site_visits');
  });

  it('passes an all-valid map through untouched', () => {
    const input = { timecards: 'full' as PermissionLevel, billing: 'none' as PermissionLevel };
    expect(toStorableOverrides(input)).toEqual(input);
  });

  it('a dropped submit leaves the user exactly where the preset put them', () => {
    // The point of dropping: the effective answer does not change.
    const before = cardPermissionDecision({
      role: 'supervisor',
      userPermissions: null,
      cardKey: 'site_visits',
      required: 'submit',
    });
    const after = cardPermissionDecision({
      role: 'supervisor',
      userPermissions: null, // no row was written for site_visits
      cardKey: 'site_visits',
      required: 'submit',
    });
    expect(after).toEqual(before);
    expect(after.allowed).toBe(true);
  });
});
