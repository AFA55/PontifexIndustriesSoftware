/**
 * Tests for the nullable-list normalizer.
 *
 * The fixtures are the real production shapes that broke two live tickets on
 * 5 Aug 2026 (Zack's photo_urls, Devin's equipment_needed — both NULL).
 */

import { asArray, normalizeJobArrays, normalizeJobArraysAll } from './job-arrays';

describe('asArray', () => {
  it('passes a real array through untouched', () => {
    expect(asArray(['a', 'b'])).toEqual(['a', 'b']);
    expect(asArray([])).toEqual([]);
  });

  it('turns the values that crashed production into empty arrays', () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray('')).toEqual([]);
  });

  it('parses a stringified array', () => {
    expect(asArray('["Pentruder","Core rig"]')).toEqual(['Pentruder', 'Core rig']);
  });

  it('does not explode on malformed JSON', () => {
    expect(asArray('[not json')).toEqual([]);
  });

  it('splits a comma-joined string, the way job_type is stored', () => {
    expect(asArray('CS, WS/TS, ECD')).toEqual(['CS', 'WS/TS', 'ECD']);
  });

  it('wraps a lone value that should have been a one-item list', () => {
    expect(asArray({ type: 'permit' })).toEqual([{ type: 'permit' }]);
  });

  it('always returns something .map() can be called on', () => {
    for (const v of [null, undefined, '', 0, false, {}, 'x', [1]]) {
      expect(() => asArray(v).map((x) => x)).not.toThrow();
    }
  });
});

describe('normalizeJobArrays', () => {
  it("fixes Zack's job — photo_urls was NULL", () => {
    const job = { id: '1', job_number: 'JOB-2026-424813', photo_urls: null, equipment_needed: ['saw'] };
    const out = normalizeJobArrays(job);
    expect(out.photo_urls).toEqual([]);
    expect(out.equipment_needed).toEqual(['saw']);
  });

  it("fixes Devin's job — equipment_needed was NULL", () => {
    const job = { id: '2', job_number: 'QA-2026-830042', equipment_needed: null, photo_urls: ['a.jpg'] };
    const out = normalizeJobArrays(job);
    expect(out.equipment_needed).toEqual([]);
    expect(out.photo_urls).toEqual(['a.jpg']);
  });

  it('fixes the duplicate, where BOTH were NULL', () => {
    const out = normalizeJobArrays({
      id: '3',
      job_number: 'JOB-2026-521763',
      equipment_needed: null,
      photo_urls: null,
      permits: null,
      ppe_required: null,
    });
    expect(out.equipment_needed).toEqual([]);
    expect(out.photo_urls).toEqual([]);
    expect(out.permits).toEqual([]);
    expect(out.ppe_required).toEqual([]);
  });

  it('leaves columns the row does not have alone', () => {
    const out = normalizeJobArrays({ id: '4', customer_name: 'Acme' });
    expect(out).toEqual({ id: '4', customer_name: 'Acme' });
    expect('photo_urls' in out).toBe(false);
  });

  it('does not mutate the input', () => {
    const job = { id: '5', photo_urls: null };
    normalizeJobArrays(job);
    expect(job.photo_urls).toBeNull();
  });

  it('never touches non-list fields', () => {
    const out = normalizeJobArrays({ id: '6', job_type: 'CS, WS/TS', customer_name: 'Acme', total_cost: 100 });
    expect(out.job_type).toBe('CS, WS/TS');
    expect(out.total_cost).toBe(100);
  });

  it('is safe on junk input', () => {
    expect(normalizeJobArrays(null as never)).toBeNull();
    expect(normalizeJobArraysAll(null)).toEqual([]);
    expect(normalizeJobArraysAll(undefined)).toEqual([]);
  });

  it('normalizes a whole list of jobs', () => {
    const out = normalizeJobArraysAll([{ id: 'a', photo_urls: null }, { id: 'b', photo_urls: ['x'] }]);
    expect(out[0].photo_urls).toEqual([]);
    expect(out[1].photo_urls).toEqual(['x']);
  });
});
