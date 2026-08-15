/**
 * "ALSO ALLOW THEM TO REMOVE THINGS OR ADD CARDS TO THEIR DASHBOARD."
 *
 * Two different things wear the word "card" here, and keeping them apart is the
 * whole design:
 *
 *   SECTIONS  — the blocks the dashboard is already built from (the KPI row,
 *               My Jobs, Commissions, Quick Actions...). Shown by default; the
 *               user may REMOVE them.
 *   FEATURE   — the ADMIN_CARDS entries (Schedule Board, Customer Profiles,
 *   CARDS       Contracts...). Hidden by default; the user may ADD the ones
 *               their role already lets them open.
 *
 * THE SAFETY RULE, and it is not negotiable: this is a PREFERENCE layer, never
 * an ACCESS layer. `getCardPermission` decides what a user is ALLOWED to see;
 * everything here can only subtract from that set. A stored id is a *request*,
 * and a request for something the role forbids is dropped on the floor — see
 * `visibleFeatureCards`, which filters the permitted list rather than the
 * stored one. Adding a row to `profiles.dashboard_added_cards` by hand can
 * therefore never open a door.
 *
 * Persistence lives on `profiles` (`dashboard_hidden_cards`,
 * `dashboard_added_cards`), so a PM's layout follows them to any device.
 */

import { ADMIN_CARDS, getCardPermission, type AdminCard, type PermissionLevel } from './rbac';

// ============================================================
// Sections (built-in dashboard blocks — removable)
// ============================================================

export interface DashboardSection {
  id: string;
  label: string;
  /** One line telling the user what they lose by removing it. */
  description: string;
  /**
   * ADMIN_CARDS key this section is a window onto. When set, the section only
   * renders for a user whose role permits that key — the same gate the
   * underlying page uses. Omit for sections that show only the user's OWN data
   * (their jobs, their commission), which no card key governs.
   */
  requiresCardKey?: string;
}

/** The Project Manager (internal role `salesman`) dashboard, in render order. */
export const PM_DASHBOARD_SECTIONS: DashboardSection[] = [
  {
    id: 'kpis',
    label: 'Key numbers',
    description: 'Active jobs, quoted this month, expected commission',
  },
  {
    id: 'my_jobs',
    label: 'My Jobs',
    description: 'Your upcoming, active and completed jobs',
  },
  {
    id: 'commissions',
    label: 'Commissions',
    description: 'Your commission ledger, job by job',
  },
  {
    id: 'quick_actions',
    label: 'Quick Actions',
    description: 'Shortcut buttons to the pages you use most',
  },
  {
    id: 'command_center',
    label: 'Command Center',
    description: 'The live operations HUD launcher',
  },
];

// ============================================================
// Feature cards (ADMIN_CARDS shortcuts — addable)
// ============================================================

/**
 * Feature-card ids are namespaced so a section id and a card key can never
 * collide in the same stored array.
 */
export const FEATURE_CARD_PREFIX = 'card:';

export function featureCardId(cardKey: string): string {
  return `${FEATURE_CARD_PREFIX}${cardKey}`;
}

export function featureCardKey(id: string): string | null {
  return id.startsWith(FEATURE_CARD_PREFIX) ? id.slice(FEATURE_CARD_PREFIX.length) : null;
}

// ============================================================
// Visibility — permission FIRST, preference second
// ============================================================

export interface CardPrefsContext {
  role: string;
  permissions: Record<string, PermissionLevel> | null;
  /** Section ids the user removed. */
  hidden?: string[] | null;
  /** Feature-card ids the user added. */
  added?: string[] | null;
}

/** Does this user's role permit the section at all? */
export function isSectionAllowed(
  section: DashboardSection,
  role: string,
  permissions: Record<string, PermissionLevel> | null
): boolean {
  if (!section.requiresCardKey) return true;
  return getCardPermission(permissions, section.requiresCardKey, role) !== 'none';
}

/** Sections to render: allowed by role AND not removed by the user. */
export function visibleSections(
  sections: DashboardSection[],
  ctx: CardPrefsContext
): DashboardSection[] {
  const hidden = new Set(ctx.hidden ?? []);
  return sections.filter(
    (s) => isSectionAllowed(s, ctx.role, ctx.permissions) && !hidden.has(s.id)
  );
}

/**
 * Sections the user removed but could bring back. Never includes a section the
 * role forbids — restoring must not be a back door either.
 */
export function restorableSections(
  sections: DashboardSection[],
  ctx: CardPrefsContext
): DashboardSection[] {
  const hidden = new Set(ctx.hidden ?? []);
  return sections.filter(
    (s) => isSectionAllowed(s, ctx.role, ctx.permissions) && hidden.has(s.id)
  );
}

/** Every ADMIN_CARDS entry this user's role lets them open. The permitted set. */
export function availableFeatureCards(
  role: string,
  permissions: Record<string, PermissionLevel> | null
): AdminCard[] {
  return ADMIN_CARDS.filter((c) => getCardPermission(permissions, c.key, role) !== 'none');
}

/**
 * Feature cards to render. Note the direction: we filter the PERMITTED list by
 * what the user asked for, never the requested list by what is permitted. A
 * stored id for a forbidden card simply never matches anything.
 */
export function visibleFeatureCards(ctx: CardPrefsContext): AdminCard[] {
  const wanted = new Set(ctx.added ?? []);
  return availableFeatureCards(ctx.role, ctx.permissions).filter((c) =>
    wanted.has(featureCardId(c.key))
  );
}

/** Permitted feature cards the user has NOT added yet — the "Add a card" menu. */
export function addableFeatureCards(ctx: CardPrefsContext): AdminCard[] {
  const wanted = new Set(ctx.added ?? []);
  return availableFeatureCards(ctx.role, ctx.permissions).filter(
    (c) => !wanted.has(featureCardId(c.key))
  );
}

// ============================================================
// Mutation helpers (pure — the caller persists the result)
// ============================================================

export function withId(list: string[] | null | undefined, id: string): string[] {
  const set = new Set(list ?? []);
  set.add(id);
  return [...set];
}

export function withoutId(list: string[] | null | undefined, id: string): string[] {
  return (list ?? []).filter((x) => x !== id);
}

/**
 * Server-side scrub for anything arriving from a client: strings only, known
 * ids only, de-duplicated, bounded. Unknown ids are dropped rather than stored
 * so the column can never accumulate junk that a later refactor mistakes for
 * meaning.
 */
export function sanitizeCardIds(input: unknown, allowedIds: string[]): string[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set(allowedIds);
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    if (!allowed.has(raw)) continue;
    if (out.includes(raw)) continue;
    out.push(raw);
    if (out.length >= 100) break;
  }
  return out;
}

/** Every id the PM dashboard recognises — sections plus every known card key. */
export function allKnownPmCardIds(): string[] {
  return [
    ...PM_DASHBOARD_SECTIONS.map((s) => s.id),
    ...ADMIN_CARDS.map((c) => featureCardId(c.key)),
  ];
}
