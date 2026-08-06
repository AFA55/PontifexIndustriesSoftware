/**
 * Tests for the work-item formatting helpers — the summary string that feeds
 * invoices/portal (job_orders.work_performed), the compact detail lines the
 * admin renders use, and the difficulty label ↔ rating mapping.
 */

import {
  buildWorkPerformedSummary,
  cutRebar,
  difficultyToRating,
  ratingToDifficultyLabel,
  rebarLabel,
  rebarSizeOf,
  REBAR_SIZES,
  stripInternalNotes,
  summarizeWorkItem,
  toCompletionPdfWorkItems,
  workItemDetailLine,
  workItemQuickNote,
} from './work-items-format';

describe('difficultyToRating', () => {
  it('maps the operator labels to the daily-log 1–5 scale', () => {
    expect(difficultyToRating('easy')).toBe(1);
    expect(difficultyToRating('moderate')).toBe(2);
    expect(difficultyToRating('medium')).toBe(3);
    expect(difficultyToRating('difficult')).toBe(4);
    expect(difficultyToRating('hard')).toBe(5);
  });
  it('is case/whitespace tolerant and null-safe', () => {
    expect(difficultyToRating(' Easy ')).toBe(1);
    expect(difficultyToRating('DIFFICULT')).toBe(4);
    expect(difficultyToRating('')).toBeNull();
    expect(difficultyToRating(null)).toBeNull();
    expect(difficultyToRating(undefined)).toBeNull();
    expect(difficultyToRating('nope')).toBeNull();
  });
});

describe('ratingToDifficultyLabel', () => {
  it('buckets 1–5 into Easy / Moderate / Difficult', () => {
    expect(ratingToDifficultyLabel(1)).toBe('Easy');
    // 2 = the picker's "moderate" (and legacy daily-log rows) — must NOT read as Easy
    expect(ratingToDifficultyLabel(2)).toBe('Moderate');
    expect(ratingToDifficultyLabel(3)).toBe('Moderate');
    expect(ratingToDifficultyLabel(4)).toBe('Difficult');
    expect(ratingToDifficultyLabel(5)).toBe('Difficult');
  });
  it('returns null for missing/invalid ratings', () => {
    expect(ratingToDifficultyLabel(null)).toBeNull();
    expect(ratingToDifficultyLabel(undefined)).toBeNull();
    expect(ratingToDifficultyLabel(0)).toBeNull();
  });
});

describe('workItemDetailLine', () => {
  it('enumerates ALL core-drilling holes from details_json', () => {
    const line = workItemDetailLine({
      work_type: 'CORE DRILL',
      quantity: 3,
      details_json: {
        holes: [
          { bitSize: '4"', depthInches: 10, quantity: 2 },
          { bitSize: '6', depthInches: 12, quantity: 1 },
        ],
      },
    });
    expect(line).toBe('2× 4" @ 10", 1× 6" @ 12"');
  });

  // OLD SHAPE — rows written before the Aug 2026 "what size rebar?" change.
  // Their wording must not drift; the office reads these every day.
  it('flags steel on a legacy hole (cutSteel boolean, no size)', () => {
    const line = workItemDetailLine({
      details_json: { holes: [{ bitSize: '4', depthInches: 8, quantity: 1, cutSteel: true }] },
    });
    expect(line).toBe('1× 4" @ 8" steel');
  });

  it('flags steel on a legacy cut (cutSteel boolean, no size)', () => {
    const line = workItemDetailLine({
      details_json: { cuts: [{ linearFeet: 120, cutDepth: 6, cutSteel: true }] },
    });
    expect(line).toBe('120 LF @ 6" (steel)');
  });

  // NEW SHAPE — the operator answers a bar size. `cutSteel` is still written
  // (derived) so nothing downstream had to change at once.
  it('prints the rebar SIZE on a new hole', () => {
    const line = workItemDetailLine({
      details_json: {
        holes: [
          { bitSize: '4', depthInches: 8, quantity: 1, rebarSize: '#5', cutSteel: true, steelEncountered: '#5 rebar' },
        ],
      },
    });
    expect(line).toBe('1× 4" @ 8" rebar #5');
  });

  it('prints the rebar SIZE on a new cut, alongside the other flags', () => {
    const line = workItemDetailLine({
      details_json: {
        cutType: 'wet',
        cuts: [
          { linearFeet: 80, cutDepth: 6, rebarSize: '#4', cutSteel: true, overcut: true },
        ],
      },
    });
    expect(line).toBe('80 LF @ 6" (rebar #4, overcut) (wet)');
  });

  it('prints free-text rebar answers ("unknown") without a stray #', () => {
    const line = workItemDetailLine({
      details_json: { holes: [{ bitSize: '6', depthInches: 12, quantity: 2, rebarSize: 'unknown', cutSteel: true }] },
    });
    expect(line).toBe('2× 6" @ 12" rebar: unknown');
  });

  it('describes sawing cuts with LF, depth and wet/dry', () => {
    const line = workItemDetailLine({
      work_type: 'SLAB SAW',
      details_json: {
        cutType: 'wet',
        cuts: [{ linearFeet: 120, cutDepth: 6 }],
      },
    });
    expect(line).toBe('120 LF @ 6" (wet)');
  });

  it('falls back to flat columns when details_json is absent', () => {
    expect(
      workItemDetailLine({ core_quantity: 4, core_size: '4"', core_depth_inches: 10 })
    ).toBe('4 cores (4" @ 10")');
    expect(
      workItemDetailLine({ linear_feet_cut: 80, cut_depth_inches: 6 })
    ).toBe('80 LF @ 6"');
  });

  it('returns empty string when there is no detail at all', () => {
    expect(workItemDetailLine({ work_type: 'CLEANUP', quantity: 1 })).toBe('');
  });

  // ── Demolition / removal quick entries (break & remove, jack hammering,
  //    chipping, Brokk) — a TOP-LEVEL areas[] rather than a notes string.
  it('describes a break & remove area entry with method and equipment', () => {
    const line = workItemDetailLine({
      work_type: 'BREAK & REMOVE',
      details_json: {
        areas: [
          { length: 4, width: 6, depth: 8 },
          { length: 3, width: 8 },
        ],
        totalSquareFeet: 48,
        method: 'rigged',
        equipment: 'excavator',
      },
    });
    expect(line).toBe(`48 sq ft (4' × 6' @ 8", 3' × 8') — rigged: excavator`);
  });

  it('uses Brokk thickness and derives the sq-ft total when it is missing', () => {
    const line = workItemDetailLine({
      work_type: 'BROKK',
      details_json: { areas: [{ length: 10, width: 5, thickness: 6 }] },
    });
    expect(line).toBe(`50 sq ft (10' × 5' @ 6")`);
  });

  it('does NOT mistake nested sawing areas for a demolition entry', () => {
    const line = workItemDetailLine({
      work_type: 'SLAB SAW',
      details_json: { cutType: 'dry', cuts: [{ linearFeet: 26, cutDepth: 4, areas: [{ length: 5, width: 8 }] }] },
    });
    expect(line).toBe('26 LF @ 4" (dry)');
  });
});

// The quick note is INTERNAL (office-only). workItemDetailLine feeds
// customer-facing surfaces — the signed completion PDF's description column
// and both invoice line builders — so it must never emit note prose.
describe('workItemDetailLine — customer-facing safety', () => {
  const note = 'Waited on the contractor for 45 min, GC was a nightmare';

  it('never leaks the notes column into the detail line', () => {
    const line = workItemDetailLine({
      work_type: 'SLAB SAW',
      notes: note,
      details_json: { cutType: 'wet', cuts: [{ linearFeet: 120, cutDepth: 6 }] },
    });
    expect(line).toBe('120 LF @ 6" (wet)');
    expect(line).not.toContain('contractor');
  });

  it('never leaks details_json.notes into the detail line', () => {
    const line = workItemDetailLine({
      work_type: 'BREAK & REMOVE',
      details_json: { areas: [{ length: 4, width: 6 }], totalSquareFeet: 24, notes: note },
    });
    expect(line).toBe(`24 sq ft (4' × 6')`);
    expect(line).not.toContain('contractor');
  });

  it('still produces a usable description for a demolition item (invoice lines)', () => {
    // Before details_json was read, these degraded to a bare work type.
    const line = workItemDetailLine({
      work_type: 'JACK HAMMERING',
      quantity: 48,
      details_json: { areas: [{ length: 8, width: 6 }], totalSquareFeet: 48, equipment: '90lb breaker' },
    });
    expect(line).toBe(`48 sq ft (8' × 6') — 90lb breaker`);
  });
});

// The completion PDF is signed by the customer AND published to their portal.
// toCompletionPdfWorkItems is the trust boundary for BOTH the in-person route
// (which receives a client-posted array) and the remote signing route.
describe('toCompletionPdfWorkItems', () => {
  const note = 'Waited on the contractor, GC was a nightmare';

  it('never emits notes from a client-posted payload', () => {
    // Exactly the shape day-complete/page.tsx POSTs: no details_json, and
    // `description` undefined — so notes used to BE the whole description.
    const out = toCompletionPdfWorkItems([
      { type: 'CORE DRILL', description: undefined, quantity: 3, unit: undefined, depth: 10, notes: note },
    ]);
    expect(out).toEqual([{ type: 'CORE DRILL', quantity: 3, description: '10" depth' }]);
    expect(JSON.stringify(out)).not.toContain('contractor');
    expect(out[0]).not.toHaveProperty('notes');
  });

  it('never emits details_json.notes from a DB row, and uses measurements', () => {
    const out = toCompletionPdfWorkItems([
      {
        work_type: 'SLAB SAW',
        quantity: 120,
        notes: note,
        details_json: { cutType: 'wet', cuts: [{ linearFeet: 120, cutDepth: 6 }], notes: note },
      },
    ]);
    expect(out).toEqual([{ type: 'SLAB SAW', quantity: 120, description: '120 LF @ 6" (wet)' }]);
    expect(JSON.stringify(out)).not.toContain('contractor');
  });

  it('labels an unknown shape rather than emitting an empty row', () => {
    expect(toCompletionPdfWorkItems([{}])).toEqual([{ type: 'Work Item', description: '' }]);
    expect(toCompletionPdfWorkItems(null)).toEqual([]);
    expect(toCompletionPdfWorkItems(undefined)).toEqual([]);
  });
});

// daily_job_logs.work_performed is a jsonb array of the same objects the
// operator submits, served by two token-only unauthenticated endpoints.
describe('stripInternalNotes', () => {
  it('removes notes from every entry, keeping the rest intact', () => {
    const out = stripInternalNotes([
      { name: 'CORE DRILL', quantity: 3, notes: 'access was tight' },
      { name: 'SLAB SAW', quantity: 120 },
    ]);
    expect(out).toEqual([
      { name: 'CORE DRILL', quantity: 3 },
      { name: 'SLAB SAW', quantity: 120 },
    ]);
    expect(JSON.stringify(out)).not.toContain('tight');
  });

  it('passes through non-array and non-object payloads untouched', () => {
    expect(stripInternalNotes(null)).toBeNull();
    expect(stripInternalNotes('Poured and cut')).toBe('Poured and cut');
    expect(stripInternalNotes(['a string entry'])).toEqual(['a string entry']);
  });
});

describe('workItemQuickNote', () => {
  it('reads the canonical work_items.notes column', () => {
    expect(workItemQuickNote({ notes: '  Set poly. Access was tight.  ' })).toBe(
      'Set poly. Access was tight.'
    );
  });

  it('falls back to legacy details_json.notes when the column is empty', () => {
    expect(
      workItemQuickNote({ notes: '', details_json: { notes: 'Waited on the contractor' } })
    ).toBe('Waited on the contractor');
    expect(
      workItemQuickNote({ details_json: { holes: [], notes: 'old-style note' } })
    ).toBe('old-style note');
  });

  it('prefers the column over details_json when both are present', () => {
    expect(
      workItemQuickNote({ notes: 'new note', details_json: { notes: 'stale note' } })
    ).toBe('new note');
  });

  it('returns empty string when there is no note anywhere', () => {
    expect(workItemQuickNote({ work_type: 'CLEANUP' })).toBe('');
    expect(workItemQuickNote({ notes: null, details_json: null })).toBe('');
    expect(workItemQuickNote({ notes: '   ' })).toBe('');
  });
});

describe('summarizeWorkItem', () => {
  it('composes label ×qty (detail) — note', () => {
    const s = summarizeWorkItem({
      work_type: 'CORE DRILL',
      quantity: 3,
      notes: 'tight access on the mezzanine',
      details_json: { holes: [{ bitSize: '4', depthInches: 10, quantity: 3 }] },
    });
    expect(s).toBe('CORE DRILL ×3 (3× 4" @ 10") — tight access on the mezzanine');
  });

  // The cap is 160, not 80: the founder's whole point is that the office needs
  // the CONDITIONS narrative, and one sentence of it doesn't fit in 80 chars.
  it('keeps a full two-sentence conditions note intact', () => {
    const note = 'Set poly in the stairwell. Access was tight through the loading dock and we waited on the contractor.';
    const s = summarizeWorkItem({ work_type: 'SLAB SAW', quantity: 120, notes: note });
    expect(s).toContain(note);
    expect(s).not.toContain('…');
  });

  it('truncates runaway notes', () => {
    const s = summarizeWorkItem({ work_type: 'REPAIR', quantity: 1, notes: 'x'.repeat(400) });
    expect(s.length).toBeLessThan(200);
    expect(s).toContain('…');
  });

  it('collapses dictation line breaks so the summary stays one line', () => {
    const s = summarizeWorkItem({
      work_type: 'CORE DRILL',
      quantity: 2,
      notes: 'Set poly.\nAccess was tight.\n\nWaited on the contractor.',
    });
    expect(s).toBe('CORE DRILL ×2 — Set poly. Access was tight. Waited on the contractor.');
    expect(s).not.toContain('\n');
  });

  it('uses the legacy details_json.notes when the notes column is empty', () => {
    const s = summarizeWorkItem({
      work_type: 'HAND SAW',
      quantity: 1,
      details_json: { cuts: [{ linearFeet: 12, cutDepth: 4 }], notes: 'tight access' },
    });
    expect(s).toBe('HAND SAW ×1 (12 LF @ 4") — tight access');
  });
});

describe('buildWorkPerformedSummary', () => {
  it('returns empty string for no items', () => {
    expect(buildWorkPerformedSummary([])).toBe('');
  });

  it('single day: items joined with "; " and NO day prefix', () => {
    const s = buildWorkPerformedSummary([
      {
        work_type: 'CORE DRILL',
        quantity: 3,
        day_number: 1,
        details_json: {
          holes: [
            { bitSize: '4', depthInches: 10, quantity: 2 },
            { bitSize: '6', depthInches: 12, quantity: 1 },
          ],
        },
      },
      { work_type: 'SLAB SAW', quantity: 1, day_number: 1, details_json: { cutType: 'wet', cuts: [{ linearFeet: 120, cutDepth: 6 }] } },
    ]);
    expect(s).toBe(
      'CORE DRILL ×3 (2× 4" @ 10", 1× 6" @ 12"); SLAB SAW ×1 (120 LF @ 6" (wet))'
    );
    expect(s).not.toContain('Day 1');
  });

  it('multi-day: "Day N:" prefixes joined with " | "', () => {
    const s = buildWorkPerformedSummary([
      { work_type: 'CORE DRILL', quantity: 1, day_number: 1, core_quantity: 2, core_size: '4', core_depth_inches: 10 },
      { work_type: 'SLAB SAW', quantity: 1, day_number: 2, linear_feet_cut: 60 },
    ]);
    expect(s).toBe('Day 1: CORE DRILL ×1 (2 cores (4" @ 10")) | Day 2: SLAB SAW ×1 (60 LF)');
  });

  it('treats missing day_number as day 1 (legacy rows)', () => {
    const s = buildWorkPerformedSummary([
      { work_type: 'CLEANUP', quantity: 1 },
      { work_type: 'REPAIR', quantity: 2, day_number: 1 },
    ]);
    expect(s).toBe('CLEANUP ×1; REPAIR ×2');
  });

  it('never emits raw JSON', () => {
    const s = buildWorkPerformedSummary([
      { work_type: 'CORE DRILL', quantity: 1, details_json: { holes: [{ bitSize: '4', depthInches: 10 }] } },
    ]);
    expect(s).not.toContain('{');
    expect(s).not.toContain('[');
  });
});

// ── The OFFLINE/localStorage shape ────────────────────────────────────────────
// work-performed persists its own WorkItem[] on a failed POST (basements,
// parking structures). That shape carries the quick note TWICE — top-level and
// mirrored into `details.notes` — and stores measurements under `details`,
// not `details_json`. Both cost us a blocking finding; these pin them.
describe('offline/localStorage payload shape', () => {
  const offlineItem = {
    name: 'SLAB SAW',
    quantity: 120,
    notes: 'Set poly. Waited on the contractor.',
    details: { cutType: 'wet', cuts: [{ linearFeet: 120, cutDepth: 6 }], notes: 'Set poly. Waited on the contractor.' },
  };

  it('stripInternalNotes removes the MIRRORED note, not just the outer one', () => {
    const out = stripInternalNotes([offlineItem]);
    expect(JSON.stringify(out)).not.toContain('Set poly');
    expect(JSON.stringify(out)).not.toContain('contractor');
    // measurements survive
    expect(JSON.stringify(out)).toContain('120');
  });

  it('toCompletionPdfWorkItems reads `details` and still emits no prose', () => {
    const [row] = toCompletionPdfWorkItems([offlineItem]);
    expect(row.description).toBe('120 LF @ 6" (wet)');
    expect(JSON.stringify(row)).not.toContain('poly');
    expect(row).not.toHaveProperty('notes');
  });
});

// ── The rebar answer (was the yes/no "Cut Steel") ────────────────────────────
// Aug 2026 the founder replaced the boolean with "what SIZE rebar did you cut?".
// Nothing stored was renamed or migrated, so BOTH shapes are live in the table
// at the same time and every helper has to read both.
describe('rebar helpers', () => {
  it('offers the real US bar sizes, #3 through #18', () => {
    expect(REBAR_SIZES).toEqual(['#3', '#4', '#5', '#6', '#7', '#8', '#9', '#10', '#11', '#14', '#18']);
  });

  describe('NEW shape — a size was recorded', () => {
    const entry = { rebarSize: '#4', cutSteel: true, steelEncountered: '#4 rebar' };

    it('reads the size back', () => {
      expect(rebarSizeOf(entry)).toBe('#4');
      expect(cutRebar(entry)).toBe(true);
      expect(rebarLabel(entry)).toBe('Rebar #4');
    });

    it('labels free-text answers without pretending they are a bar number', () => {
      expect(rebarLabel({ rebarSize: 'unknown', cutSteel: true })).toBe('Rebar: unknown');
      expect(rebarLabel({ rebarSize: 'angle iron', cutSteel: true })).toBe('Rebar: angle iron');
    });

    it('trims operator whitespace', () => {
      expect(rebarSizeOf({ rebarSize: '  #9  ' })).toBe('#9');
      expect(rebarLabel({ rebarSize: '  #9  ' })).toBe('Rebar #9');
    });

    it('treats an empty size as "no rebar", even next to a stale boolean', () => {
      expect(rebarSizeOf({ rebarSize: '   ' })).toBe('');
      expect(rebarLabel({ rebarSize: '', cutSteel: false, steelEncountered: '' })).toBeNull();
    });
  });

  describe('OLD shape — rows saved before the change (live production data)', () => {
    // Verbatim from work_items.details_json in production.
    const legacyBooleanOnly = { bitSize: '6', cutSteel: true, quantity: 4, depthInches: 10, plasticSetup: false, steelEncountered: '' };
    const legacyWithText = { depth: 6, width: 13, length: 40, overcut: true, cutSteel: true, quantity: 1, steelEncountered: 'Number 4' };

    it('still reports that steel was cut when only the boolean exists', () => {
      expect(cutRebar(legacyBooleanOnly)).toBe(true);
      expect(rebarSizeOf(legacyBooleanOnly)).toBe('');
      // Says "Steel", NOT "Rebar" — the operator answered a broader question
      // and we must not put words in their mouth after the fact.
      expect(rebarLabel(legacyBooleanOnly)).toBe('Steel Cut');
    });

    it('keeps the legacy free-text description visible', () => {
      expect(cutRebar(legacyWithText)).toBe(true);
      expect(rebarLabel(legacyWithText)).toBe('Steel: Number 4');
    });

    it('reports no steel for a legacy entry that answered "no"', () => {
      expect(cutRebar({ cutSteel: false, steelEncountered: '' })).toBe(false);
      expect(rebarLabel({ cutSteel: false, steelEncountered: '' })).toBeNull();
    });
  });

  it('is null-safe on garbage', () => {
    expect(rebarLabel(null)).toBeNull();
    expect(rebarLabel(undefined)).toBeNull();
    expect(rebarLabel({})).toBeNull();
    expect(cutRebar(null)).toBe(false);
    expect(rebarSizeOf(null)).toBe('');
    // A non-string size (bad client payload) must not crash or leak "[object Object]".
    expect(rebarSizeOf({ rebarSize: 4 as unknown as string })).toBe('');
  });

  it('renders a real legacy production row end-to-end, unchanged', () => {
    // Nested sawing areas: the cut says cutSteel:false, the AREA says true.
    const line = workItemDetailLine({
      work_type: 'SLAB SAW',
      details_json: {
        cutType: 'wet',
        cuts: [
          {
            areas: [{ depth: 6, width: 13, length: 40, overcut: true, cutSteel: true, quantity: 1, steelEncountered: 'Number 4' }],
            cutDepth: 6,
            cutSteel: false,
            inputMode: 'area',
            linearFeet: 106,
            steelEncountered: '',
          },
        ],
      },
    });
    expect(line).toBe('106 LF @ 6" (wet)');
  });
});
