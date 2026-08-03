import {
  computeOperatorRating,
  ratingBand,
  SOURCE_WEIGHTS,
  RECENCY_HALF_LIFE_DAYS,
  MIN_RECENCY_WEIGHT,
  MIN_REVIEWS_FOR_COMPOSITE,
  REQUIRE_MULTIPLE_SOURCES,
} from './operator-rating';

// Fixed "now" so recency weighting is deterministic.
const NOW = new Date(2026, 6, 1, 12, 0, 0); // Jul 1 2026, local
const DAY = 86_400_000;
/** local YMD `daysAgo` before NOW */
const ymdAgo = (daysAgo: number) => {
  const d = new Date(NOW.getTime() - daysAgo * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const isoAgo = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * DAY).toISOString();

describe('tuning constants are PINNED', () => {
  // These exist so that changing a weight is a deliberate act that breaks a
  // test, not a silent change to everyone's score. The composite tests below
  // derive NOTHING from SOURCE_WEIGHTS — they hard-code the expected numbers —
  // so a weight change fails there too.
  it('pins the documented source weights as literals', () => {
    expect(SOURCE_WEIGHTS).toEqual({ supervisor: 0.5, customer: 0.3, helper: 0.2 });
  });

  it('pins the recency scheme', () => {
    expect(RECENCY_HALF_LIFE_DAYS).toBe(180);
    expect(MIN_RECENCY_WEIGHT).toBe(0.1);
  });

  it('pins the provisional threshold', () => {
    expect(MIN_REVIEWS_FOR_COMPOSITE).toBe(3);
    expect(REQUIRE_MULTIPLE_SOURCES).toBe(true);
  });
});

describe('hand-computed composites (literal, NOT derived from SOURCE_WEIGHTS)', () => {
  it('2 supervisor 5s + 1 customer 1 = 3.50', () => {
    // supervisor avg 5 @ 0.5/0.8 = 0.625 ; customer avg 1 @ 0.3/0.8 = 0.375
    // 5(0.625) + 1(0.375) = 3.125 + 0.375 = 3.50
    const r = computeOperatorRating({
      supervisorVisits: [
        { performance_rating: 5, safety_rating: 5, cleanliness_rating: 5, visit_date: ymdAgo(0) },
        { performance_rating: 5, safety_rating: 5, cleanliness_rating: 5, visit_date: ymdAgo(0) },
      ],
      customerSurveys: [
        { overall_rating: 1, communication_rating: 1, cleanliness_rating: 1, submitted_at: isoAgo(0) },
      ],
      now: NOW,
    });
    expect(r.provisional).toBe(false);
    expect(r.composite).toBe(3.5);
  });

  it('supervisor 4 + customer 2 + helper 5 (all three sources) = 3.60', () => {
    // 4(0.5) + 2(0.3) + 5(0.2) = 2.0 + 0.6 + 1.0 = 3.60
    const r = computeOperatorRating({
      supervisorVisits: [{ performance_rating: 4, visit_date: ymdAgo(0) }],
      customerSurveys: [{ overall_rating: 2, submitted_at: isoAgo(0) }],
      helperReviews: [{ rating: 5, created_at: isoAgo(0) }],
      now: NOW,
    });
    expect(r.provisional).toBe(false);
    expect(r.composite).toBe(3.6);
  });

  it('2 supervisor 2s + 1 helper 5 = 2.86', () => {
    // supervisor avg 2 @ 0.5/0.7 = 0.714285… ; helper 5 @ 0.2/0.7 = 0.285714…
    // 2(0.714285) + 5(0.285714) = 1.428571 + 1.428571 = 2.857142 → 2.86
    const r = computeOperatorRating({
      supervisorVisits: [
        { performance_rating: 2, safety_rating: 2, cleanliness_rating: 2, visit_date: ymdAgo(0) },
        { performance_rating: 2, safety_rating: 2, cleanliness_rating: 2, visit_date: ymdAgo(0) },
      ],
      helperReviews: [{ rating: 5, created_at: isoAgo(0) }],
      now: NOW,
    });
    expect(r.provisional).toBe(false);
    expect(r.composite).toBe(2.86);
  });

  it('pins the per-source weights actually applied in a 2-source mix', () => {
    const r = computeOperatorRating({
      supervisorVisits: [
        { performance_rating: 5, visit_date: ymdAgo(0) },
        { performance_rating: 5, visit_date: ymdAgo(0) },
      ],
      customerSurveys: [{ overall_rating: 1, submitted_at: isoAgo(0) }],
      now: NOW,
    });
    expect(r.sources.supervisor.weight).toBe(0.625);
    expect(r.sources.customer.weight).toBe(0.375);
    expect(r.sources.helper.weight).toBe(0);
  });
});

describe('provisional guard (thin samples never publish a headline score)', () => {
  it('withholds the score for a SINGLE review, however extreme', () => {
    // The exact scenario the guard exists for: one 1-star helper review would
    // otherwise renormalise to 100% weight and read as an official "1.00".
    const r = computeOperatorRating({
      helperReviews: [{ rating: 1, created_at: isoAgo(0) }],
      now: NOW,
    });
    expect(r.composite).toBeNull();
    expect(r.rawComposite).toBe(1);
    expect(r.provisional).toBe(true);
    expect(r.provisionalReason).toBe('insufficient_reviews');
    expect(r.totalReviews).toBe(1);
    // The individual review is still there to display.
    expect(r.sources.helper.count).toBe(1);
    expect(r.sources.helper.average).toBe(1);
  });

  it('withholds the score below MIN_REVIEWS_FOR_COMPOSITE', () => {
    const r = computeOperatorRating({
      supervisorVisits: [{ performance_rating: 5, visit_date: ymdAgo(0) }],
      customerSurveys: [{ overall_rating: 5, submitted_at: isoAgo(0) }],
      now: NOW,
    });
    expect(r.totalReviews).toBe(2);
    expect(r.composite).toBeNull();
    expect(r.provisionalReason).toBe('insufficient_reviews');
  });

  it('withholds the score when only ONE source has data, even with enough reviews', () => {
    const r = computeOperatorRating({
      supervisorVisits: [
        { performance_rating: 4, visit_date: ymdAgo(0) },
        { performance_rating: 4, visit_date: ymdAgo(5) },
        { performance_rating: 4, visit_date: ymdAgo(10) },
        { performance_rating: 4, visit_date: ymdAgo(15) },
      ],
      now: NOW,
    });
    expect(r.totalReviews).toBe(4);
    expect(r.composite).toBeNull();
    expect(r.provisional).toBe(true);
    expect(r.provisionalReason).toBe('single_source');
    expect(r.rawComposite).toBe(4);
  });

  it('publishes once the threshold AND multi-source rules are both met', () => {
    const r = computeOperatorRating({
      supervisorVisits: [
        { performance_rating: 4, visit_date: ymdAgo(0) },
        { performance_rating: 4, visit_date: ymdAgo(1) },
      ],
      customerSurveys: [{ overall_rating: 4, submitted_at: isoAgo(0) }],
      now: NOW,
    });
    expect(r.provisional).toBe(false);
    expect(r.provisionalReason).toBeNull();
    expect(r.composite).toBe(4);
  });

  it('an ungraded person is NOT "provisional" — they are simply ungraded', () => {
    const r = computeOperatorRating({ now: NOW });
    expect(r.composite).toBeNull();
    expect(r.rawComposite).toBeNull();
    expect(r.provisional).toBe(false);
    expect(r.provisionalReason).toBeNull();
  });
});

describe('computeOperatorRating', () => {
  describe('empty / ungraded', () => {
    it('returns null (never 0) when there is no input at all', () => {
      const r = computeOperatorRating({ now: NOW });
      expect(r.composite).toBeNull();
      expect(r.totalReviews).toBe(0);
      expect(r.strongest).toBeNull();
      expect(r.weakest).toBeNull();
      expect(r.lastReviewedAt).toBeNull();
    });

    it('returns null when every source is an empty array', () => {
      const r = computeOperatorRating({
        supervisorVisits: [],
        customerSurveys: [],
        helperReviews: [],
        now: NOW,
      });
      expect(r.composite).toBeNull();
      expect(r.rawComposite).toBeNull();
      expect(r.sources.supervisor.average).toBeNull();
      expect(r.sources.customer.average).toBeNull();
      expect(r.sources.helper.average).toBeNull();
    });

    it('ignores rows that exist but carry no scores (a visit with no ratings is not a grade)', () => {
      const r = computeOperatorRating({
        supervisorVisits: [
          { performance_rating: null, safety_rating: null, cleanliness_rating: null, visit_date: ymdAgo(1) },
        ],
        now: NOW,
      });
      expect(r.rawComposite).toBeNull();
      expect(r.totalReviews).toBe(0);
      expect(r.sources.supervisor.count).toBe(0);
    });

    it('ignores out-of-range and non-numeric grades', () => {
      const r = computeOperatorRating({
        supervisorVisits: [
          // 0 and 6 are outside the 1-5 CHECK; only safety=4 is a real grade
          { performance_rating: 0, safety_rating: 4, cleanliness_rating: 6, visit_date: ymdAgo(0) },
        ],
        now: NOW,
      });
      expect(r.rawComposite).toBe(4);
      expect(r.sources.supervisor.dimensions).toHaveLength(1);
      expect(r.sources.supervisor.dimensions[0].key).toBe('supervisor.safety');
    });

    it('tolerates null entries inside the arrays', () => {
      const r = computeOperatorRating({
        supervisorVisits: [null as never, { performance_rating: 5, visit_date: ymdAgo(0) }],
        now: NOW,
      });
      expect(r.rawComposite).toBe(5);
    });
  });

  describe('single source', () => {
    it('a lone supervisor visit IS the raw composite (missing sources do not drag it down)', () => {
      const r = computeOperatorRating({
        supervisorVisits: [
          { performance_rating: 4, safety_rating: 4, cleanliness_rating: 4, visit_date: ymdAgo(0) },
        ],
        now: NOW,
      });
      expect(r.rawComposite).toBe(4);
      expect(r.sources.supervisor.weight).toBe(1);
      expect(r.sources.customer.weight).toBe(0);
      expect(r.sources.helper.weight).toBe(0);
      // …but it is NOT published as a standing.
      expect(r.composite).toBeNull();
    });

    it('a lone helper review IS the raw composite', () => {
      const r = computeOperatorRating({
        helperReviews: [{ rating: 3, created_at: isoAgo(0) }],
        now: NOW,
      });
      expect(r.rawComposite).toBe(3);
      expect(r.sources.helper.weight).toBe(1);
    });

    it('averages the dimensions within one review before anything else', () => {
      const r = computeOperatorRating({
        supervisorVisits: [
          { performance_rating: 5, safety_rating: 4, cleanliness_rating: 3, visit_date: ymdAgo(0) },
        ],
        now: NOW,
      });
      expect(r.rawComposite).toBe(4); // (5+4+3)/3
    });
  });

  describe('cleanliness is not double-counted across sources', () => {
    it('supervisor cleanliness and customer cleanliness stay in separate source means', () => {
      const r = computeOperatorRating({
        // Supervisor: perfect on everything.
        supervisorVisits: [
          { performance_rating: 5, safety_rating: 5, cleanliness_rating: 5, visit_date: ymdAgo(0) },
        ],
        // Customer: bottomed out on everything, including cleanliness.
        customerSurveys: [
          { overall_rating: 1, communication_rating: 1, cleanliness_rating: 1, submitted_at: isoAgo(0) },
        ],
        now: NOW,
      });

      expect(r.sources.supervisor.average).toBe(5);
      expect(r.sources.customer.average).toBe(1);
      expect(r.rawComposite).toBe(3.5); // literal — see the hand-computed block

      // Both cleanliness dimensions are reported, distinctly keyed + labelled.
      const keys = [...r.sources.supervisor.dimensions, ...r.sources.customer.dimensions].map((d) => d.key);
      expect(keys).toContain('supervisor.cleanliness');
      expect(keys).toContain('customer.cleanliness');
    });

    it('a flat pooled mean would differ — proving the two-stage average is doing work', () => {
      const r = computeOperatorRating({
        supervisorVisits: [
          { performance_rating: 5, safety_rating: 5, cleanliness_rating: 5, visit_date: ymdAgo(0) },
        ],
        customerSurveys: [
          { overall_rating: 1, communication_rating: 1, cleanliness_rating: 1, submitted_at: isoAgo(0) },
        ],
        now: NOW,
      });
      // Naive pooling of all six numbers would be exactly 3.
      expect(r.rawComposite).not.toBe(3);
      expect(r.rawComposite).toBe(3.5); // supervisor is weighted heavier
    });

    it('a source with more columns does not out-vote a source with one', () => {
      // Supervisor gives 3 scores of 2; helper gives 1 score of 5.
      const r = computeOperatorRating({
        supervisorVisits: [
          { performance_rating: 2, safety_rating: 2, cleanliness_rating: 2, visit_date: ymdAgo(0) },
        ],
        helperReviews: [{ rating: 5, created_at: isoAgo(0) }],
        now: NOW,
      });
      // 2(0.5/0.7) + 5(0.2/0.7) = 2.857… → 2.86
      expect(r.rawComposite).toBe(2.86);
      // NOT the flat 4-number pool (2,2,2,5) = 2.75.
      expect(r.rawComposite).not.toBe(2.75);
    });
  });

  describe('source weighting', () => {
    it('renormalises to 1 across whichever sources are present', () => {
      const r = computeOperatorRating({
        supervisorVisits: [{ performance_rating: 4, visit_date: ymdAgo(0) }],
        customerSurveys: [{ overall_rating: 4, submitted_at: isoAgo(0) }],
        helperReviews: [{ rating: 4, created_at: isoAgo(0) }],
        now: NOW,
      });
      const total =
        r.sources.supervisor.weight + r.sources.customer.weight + r.sources.helper.weight;
      expect(total).toBe(1);
      expect(r.sources.supervisor.weight).toBe(0.5);
      expect(r.sources.customer.weight).toBe(0.3);
      expect(r.sources.helper.weight).toBe(0.2);
      expect(r.composite).toBe(4);
    });

    it('weights supervisor heaviest when the sources disagree', () => {
      const supHigh = computeOperatorRating({
        supervisorVisits: [{ performance_rating: 5, visit_date: ymdAgo(0) }],
        helperReviews: [{ rating: 1, created_at: isoAgo(0) }],
        now: NOW,
      });
      const helpHigh = computeOperatorRating({
        supervisorVisits: [{ performance_rating: 1, visit_date: ymdAgo(0) }],
        helperReviews: [{ rating: 5, created_at: isoAgo(0) }],
        now: NOW,
      });
      expect(supHigh.rawComposite).toBe(3.86); // 5(5/7) + 1(2/7)
      expect(helpHigh.rawComposite).toBe(2.14); // 1(5/7) + 5(2/7)
      expect(supHigh.rawComposite as number).toBeGreaterThan(helpHigh.rawComposite as number);
    });
  });

  describe('recency weighting', () => {
    it('pulls the score toward the more recent review', () => {
      const r = computeOperatorRating({
        supervisorVisits: [
          { performance_rating: 5, visit_date: ymdAgo(0) },                        // today
          { performance_rating: 1, visit_date: ymdAgo(RECENCY_HALF_LIFE_DAYS) },   // one half-life old
        ],
        now: NOW,
      });
      // Unweighted mean would be 3; recency must favour the recent 5.
      // weights 1 and 0.5 → (5*1 + 1*0.5) / 1.5 = 3.67
      expect(r.rawComposite).toBe(3.67);
    });

    it('halves the weight after exactly one half-life', () => {
      const r = computeOperatorRating({
        supervisorVisits: [
          { performance_rating: 4, visit_date: ymdAgo(0) },
          { performance_rating: 2, visit_date: ymdAgo(RECENCY_HALF_LIFE_DAYS) },
        ],
        now: NOW,
      });
      // (4*1 + 2*0.5) / 1.5 = 3.333… → 3.33
      expect(r.rawComposite).toBe(3.33);
    });

    it('floors very old reviews at MIN_RECENCY_WEIGHT instead of discarding them', () => {
      const r = computeOperatorRating({
        supervisorVisits: [
          { performance_rating: 5, visit_date: ymdAgo(0) },
          { performance_rating: 1, visit_date: ymdAgo(3650) }, // ~10 years
        ],
        now: NOW,
      });
      // (5*1 + 1*0.1) / 1.1 = 4.636… → 4.64
      expect(r.rawComposite).toBe(4.64);
      expect(r.rawComposite as number).toBeLessThan(5); // still counted, not dropped
      expect(r.totalReviews).toBe(2);
    });

    it('gives undated reviews full weight rather than dropping them', () => {
      const r = computeOperatorRating({
        supervisorVisits: [{ performance_rating: 2 }],
        now: NOW,
      });
      expect(r.rawComposite).toBe(2);
      expect(r.totalReviews).toBe(1);
      expect(r.lastReviewedAt).toBeNull();
    });

    it('does not over-weight a future-dated review', () => {
      const future = computeOperatorRating({
        supervisorVisits: [{ performance_rating: 5, visit_date: ymdAgo(-30) }],
        now: NOW,
      });
      expect(future.rawComposite).toBe(5);
    });

    it('parses a bare YYYY-MM-DD as a LOCAL date (no UTC off-by-one)', () => {
      // A visit dated "today" must land at weight 1, not weight <1 from a
      // timezone-shifted parse.
      const r = computeOperatorRating({
        supervisorVisits: [
          { performance_rating: 5, visit_date: ymdAgo(0) },
          { performance_rating: 1, visit_date: ymdAgo(RECENCY_HALF_LIFE_DAYS) },
        ],
        now: NOW,
      });
      expect(r.rawComposite).toBe(3.67);
    });
  });

  describe('breakdown', () => {
    it('reports the weakest and strongest dimension', () => {
      const r = computeOperatorRating({
        supervisorVisits: [
          { performance_rating: 5, safety_rating: 2, cleanliness_rating: 4, visit_date: ymdAgo(0) },
        ],
        now: NOW,
      });
      expect(r.weakest?.key).toBe('supervisor.safety');
      expect(r.weakest?.average).toBe(2);
      expect(r.strongest?.key).toBe('supervisor.performance');
      expect(r.strongest?.average).toBe(5);
    });

    it('averages a dimension across reviews (unweighted, for display)', () => {
      const r = computeOperatorRating({
        supervisorVisits: [
          { safety_rating: 2, visit_date: ymdAgo(0) },
          { safety_rating: 4, visit_date: ymdAgo(10) },
        ],
        now: NOW,
      });
      const safety = r.sources.supervisor.dimensions.find((d) => d.key === 'supervisor.safety');
      expect(safety?.average).toBe(3);
      expect(safety?.count).toBe(2);
    });

    it('counts reviews and reports the most recent review date', () => {
      const r = computeOperatorRating({
        supervisorVisits: [
          { performance_rating: 4, visit_date: ymdAgo(30) },
          { performance_rating: 4, visit_date: ymdAgo(2) },
        ],
        customerSurveys: [{ overall_rating: 4, submitted_at: isoAgo(90) }],
        helperReviews: [{ rating: 4, created_at: isoAgo(200) }],
        now: NOW,
      });
      expect(r.totalReviews).toBe(4);
      expect(r.lastReviewedAt).toBe(ymdAgo(2));
    });

    it('composite stays inside 1-5 for any valid input', () => {
      const worst = computeOperatorRating({
        supervisorVisits: [{ performance_rating: 1, safety_rating: 1, cleanliness_rating: 1 }],
        customerSurveys: [{ overall_rating: 1, communication_rating: 1, cleanliness_rating: 1 }],
        helperReviews: [{ rating: 1 }],
        now: NOW,
      });
      const best = computeOperatorRating({
        supervisorVisits: [{ performance_rating: 5, safety_rating: 5, cleanliness_rating: 5 }],
        customerSurveys: [{ overall_rating: 5, communication_rating: 5, cleanliness_rating: 5 }],
        helperReviews: [{ rating: 5 }],
        now: NOW,
      });
      expect(worst.composite).toBe(1);
      expect(best.composite).toBe(5);
    });
  });

  it('is pure — same input, same output', () => {
    const input = {
      supervisorVisits: [{ performance_rating: 3, safety_rating: 5, visit_date: ymdAgo(12) }],
      customerSurveys: [{ overall_rating: 4, submitted_at: isoAgo(40) }],
      now: NOW,
    };
    expect(computeOperatorRating(input)).toEqual(computeOperatorRating(input));
  });
});

describe('ratingBand', () => {
  it('distinguishes ungraded from badly graded', () => {
    expect(ratingBand(null).key).toBe('none');
    expect(ratingBand(1).key).toBe('needs_focus');
  });

  it('bands the 1-5 range', () => {
    expect(ratingBand(2.4).key).toBe('needs_focus');
    expect(ratingBand(2.5).key).toBe('developing');
    expect(ratingBand(3.4).key).toBe('developing');
    expect(ratingBand(3.5).key).toBe('solid');
    expect(ratingBand(4.4).key).toBe('solid');
    expect(ratingBand(4.5).key).toBe('strong');
    expect(ratingBand(5).key).toBe('strong');
  });
});
