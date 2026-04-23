/**
 * lib/skill-match.ts
 *
 * Maps concrete-cutting service type codes used by the schedule form to the
 * canonical skill tokens stored on each operator (profiles.tasks_qualified_for).
 *
 * The schedule form stores one or more codes (comma-joined) on job_orders.job_type.
 * Operators store a JSONB array of qualification tokens (lowercase).
 *
 * Because tasks_qualified_for has historically been free-form, we match any
 * token that matches ANY alias for the service type.
 */

export interface ServiceSkillMeta {
  /** Schedule-form service code (as used in SERVICE_TYPES on the form) */
  code: string;
  /** Short label shown in UI */
  label: string;
  /** Lower-case tokens that indicate an operator is qualified for this code */
  aliases: string[];
  /** Parent skill family (used for roster rollups, e.g. "Wall Sawers") */
  family: string;
  /** Plural family label for roster rollup */
  familyLabel: string;
}

export const SERVICE_SKILL_MAP: Record<string, ServiceSkillMeta> = {
  ECD: {
    code: 'ECD',
    label: 'Electric Core Drilling',
    aliases: ['ecd', 'core_drill', 'core drilling', 'core', 'coring', 'electric core'],
    family: 'core_drill',
    familyLabel: 'Core Drillers',
  },
  HFCD: {
    code: 'HFCD',
    label: 'High Frequency Core Drilling',
    aliases: ['hfcd', 'core_drill', 'core drilling', 'high frequency'],
    family: 'core_drill',
    familyLabel: 'Core Drillers',
  },
  HCD: {
    code: 'HCD',
    label: 'Hydraulic Core Drilling',
    aliases: ['hcd', 'core_drill', 'hydraulic core'],
    family: 'core_drill',
    familyLabel: 'Core Drillers',
  },
  DFS: {
    code: 'DFS',
    label: 'Diesel Floor Sawing',
    aliases: ['dfs', 'slab_saw', 'floor saw', 'floor sawing', 'slab saw', 'diesel floor'],
    family: 'slab_saw',
    familyLabel: 'Slab Sawers',
  },
  EFS: {
    code: 'EFS',
    label: 'Electric Floor Sawing',
    aliases: ['efs', 'slab_saw', 'floor saw', 'floor sawing', 'electric floor'],
    family: 'slab_saw',
    familyLabel: 'Slab Sawers',
  },
  'WS/TS': {
    code: 'WS/TS',
    label: 'Wall / Track Sawing',
    aliases: ['ws', 'ts', 'ws/ts', 'wall_saw', 'wall saw', 'wall sawing', 'track saw', 'track sawing'],
    family: 'wall_saw',
    familyLabel: 'Wall Sawers',
  },
  CS: {
    code: 'CS',
    label: 'Chain Sawing',
    aliases: ['cs', 'chain_saw', 'chain saw', 'chain sawing'],
    family: 'chain_saw',
    familyLabel: 'Chain Sawers',
  },
  'HHS/PS': {
    code: 'HHS/PS',
    label: 'Handheld / Push Sawing',
    aliases: ['hhs', 'ps', 'hhs/ps', 'hand_saw', 'hand saw', 'push saw', 'handheld'],
    family: 'hand_saw',
    familyLabel: 'Hand Sawers',
  },
  WireSaw: {
    code: 'WireSaw',
    label: 'Wire Sawing',
    aliases: ['wiresaw', 'wire_saw', 'wire saw', 'wire sawing'],
    family: 'wire_saw',
    familyLabel: 'Wire Sawers',
  },
  GPR: {
    code: 'GPR',
    label: 'GPR Scanning',
    aliases: ['gpr', 'scanning', 'gpr scanning', 'scan'],
    family: 'gpr',
    familyLabel: 'GPR Scanners',
  },
  Demo: {
    code: 'Demo',
    label: 'Selective Demo',
    aliases: ['demo', 'breaking', 'selective demo', 'demolition'],
    family: 'demo',
    familyLabel: 'Demo Crew',
  },
  Brokk: {
    code: 'Brokk',
    label: 'Brokk',
    aliases: ['brokk', 'robotic demo'],
    family: 'brokk',
    familyLabel: 'Brokk Operators',
  },
  Other: {
    code: 'Other',
    label: 'Other',
    aliases: ['other', 'general'],
    family: 'other',
    familyLabel: 'General Crew',
  },
};

/**
 * Normalize a raw token (from tasks_qualified_for or a free-text service label)
 * into a lowercase trimmed string.
 */
function norm(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

/**
 * Parse a job_type string (comma-joined) and return the SERVICE_SKILL_MAP
 * entries that match. Unknown codes are skipped.
 */
export function parseServiceCodes(jobType: string | string[] | null | undefined): ServiceSkillMeta[] {
  if (!jobType) return [];
  const tokens = Array.isArray(jobType)
    ? jobType
    : String(jobType).split(',').map((t) => t.trim()).filter(Boolean);

  const out: ServiceSkillMeta[] = [];
  for (const t of tokens) {
    // Try direct match on the map key first
    if (SERVICE_SKILL_MAP[t]) { out.push(SERVICE_SKILL_MAP[t]); continue; }
    const lower = norm(t);
    // Fallback: match by alias
    const hit = Object.values(SERVICE_SKILL_MAP).find((m) =>
      m.aliases.includes(lower) || norm(m.code) === lower || norm(m.label) === lower
    );
    if (hit) out.push(hit);
  }
  // Deduplicate by code
  const seen = new Set<string>();
  return out.filter((m) => (seen.has(m.code) ? false : (seen.add(m.code), true)));
}

/**
 * Does the operator's tasks_qualified_for array cover ALL of the required
 * service codes for a job?
 *
 * If requiredCodes is empty, everyone is qualified.
 */
export function operatorQualifiesFor(
  tasksQualifiedFor: unknown,
  requiredCodes: string[]
): boolean {
  if (!requiredCodes || requiredCodes.length === 0) return true;
  const qualified: string[] = Array.isArray(tasksQualifiedFor)
    ? (tasksQualifiedFor as unknown[]).map(norm).filter(Boolean)
    : [];
  if (qualified.length === 0) return false;

  return requiredCodes.every((code) => {
    const meta = SERVICE_SKILL_MAP[code];
    const aliases = meta ? [meta.code.toLowerCase(), ...meta.aliases] : [code.toLowerCase()];
    return qualified.some((q) => aliases.includes(q));
  });
}

/**
 * Primary required family label, for the warning text in the UI
 * (e.g. "Wall Sawer"). Uses the first service code.
 */
export function primarySkillLabel(codes: string[]): string | null {
  if (!codes || codes.length === 0) return null;
  const meta = SERVICE_SKILL_MAP[codes[0]];
  return meta ? meta.familyLabel.replace(/s$/, '') : codes[0];
}

/**
 * Roster roll-up: produce counts per skill family based on a list of
 * free operators' qualifications, ordered by the requested codes first.
 */
export function rollupSkillRoster(
  freeOperators: Array<{ tasks_qualified_for: unknown }>,
  priorityCodes: string[] = []
): Array<{ family: string; label: string; freeCount: number; isPriority: boolean }> {
  const buckets: Record<string, { family: string; label: string; freeCount: number; isPriority: boolean }> = {};

  // Seed with every known family so "0 free" families can still show
  for (const meta of Object.values(SERVICE_SKILL_MAP)) {
    if (!buckets[meta.family]) {
      buckets[meta.family] = {
        family: meta.family,
        label: meta.familyLabel,
        freeCount: 0,
        isPriority: false,
      };
    }
  }

  // Mark priority families from the service codes on the job being scheduled
  const priorityFamilies = new Set<string>();
  for (const code of priorityCodes) {
    const meta = SERVICE_SKILL_MAP[code];
    if (meta) priorityFamilies.add(meta.family);
  }
  for (const f of priorityFamilies) if (buckets[f]) buckets[f].isPriority = true;

  // Count free operators per family
  for (const op of freeOperators) {
    const tokens: string[] = Array.isArray(op.tasks_qualified_for)
      ? (op.tasks_qualified_for as unknown[]).map(norm).filter(Boolean)
      : [];
    if (tokens.length === 0) continue;
    const countedFamilies = new Set<string>();
    for (const meta of Object.values(SERVICE_SKILL_MAP)) {
      if (countedFamilies.has(meta.family)) continue;
      const aliases = [meta.code.toLowerCase(), ...meta.aliases];
      if (tokens.some((t) => aliases.includes(t))) {
        buckets[meta.family].freeCount += 1;
        countedFamilies.add(meta.family);
      }
    }
  }

  // Order priority first, then families with free people, then the rest
  return Object.values(buckets).sort((a, b) => {
    if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
    if ((a.freeCount > 0) !== (b.freeCount > 0)) return a.freeCount > 0 ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}
