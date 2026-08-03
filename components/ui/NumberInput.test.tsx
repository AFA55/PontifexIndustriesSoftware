/**
 * Regression tests for the "can't delete the 1" bug (founder, Aug 2026).
 *
 * The old shape — value={number} + onChange={parseInt(raw) || 1} — physically
 * could not be emptied: clearing produced NaN, `NaN || 1` snapped it back to 1,
 * and React re-rendered "1" into the box. These tests pin the behaviour that
 * makes the field clearable, typed over, and honest about "nothing entered".
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { NumberInput } from './NumberInput';

/** Mirrors real usage: parent owns a number, the field must stay clearable. */
function Harness({
  initial,
  emptyValue,
  integer,
  blankZero,
}: {
  initial: number;
  emptyValue?: number;
  integer?: boolean;
  blankZero?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NumberInput
        aria-label="qty"
        value={value}
        onValueChange={setValue}
        emptyValue={emptyValue}
        integer={integer}
        blankZero={blankZero}
      />
      <span data-testid="committed">{String(value)}</span>
    </>
  );
}

const box = () => screen.getByLabelText('qty') as HTMLInputElement;

describe('NumberInput — the field must be clearable', () => {
  it('STAYS EMPTY when the default 1 is deleted (the actual bug)', () => {
    render(<Harness initial={1} emptyValue={1} integer />);
    expect(box().value).toBe('1');

    fireEvent.change(box(), { target: { value: '' } });

    // The old code re-rendered "1" here. That is the whole complaint.
    expect(box().value).toBe('');
  });

  it('lets the operator type a real number straight over the cleared default', () => {
    render(<Harness initial={1} emptyValue={1} integer />);
    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.change(box(), { target: { value: '40' } });

    expect(box().value).toBe('40');
    expect(screen.getByTestId('committed')).toHaveTextContent('40');
  });

  it('does not trap a leading 0 in a measurement field', () => {
    render(<Harness initial={0} emptyValue={0} blankZero />);
    expect(box().value).toBe(''); // blank + placeholder, not a "0" to delete

    fireEvent.change(box(), { target: { value: '12.5' } });
    expect(screen.getByTestId('committed')).toHaveTextContent('12.5');
  });

  it('reports the empty value downstream while the box is blank', () => {
    render(<Harness initial={5} emptyValue={1} integer />);
    fireEvent.change(box(), { target: { value: '' } });
    expect(screen.getByTestId('committed')).toHaveTextContent('1');
  });

  it('restores the committed value on blur so nothing is left half-typed', () => {
    render(<Harness initial={1} emptyValue={1} integer />);
    fireEvent.change(box(), { target: { value: '' } });
    expect(box().value).toBe('');

    fireEvent.blur(box());
    expect(box().value).toBe('1');
  });

  it('survives the intermediate states of typing a decimal', () => {
    // NOTE: a lone "." is not a valid number, so <input type="number"> reports
    // value === '' for it — in jsdom AND in real browsers. What matters is that
    // passing through that state doesn't commit a junk number or wedge the box.
    render(<Harness initial={0} emptyValue={0} blankZero />);
    fireEvent.change(box(), { target: { value: '.' } });
    expect(screen.getByTestId('committed')).toHaveTextContent('0'); // not NaN

    fireEvent.change(box(), { target: { value: '.5' } });
    expect(screen.getByTestId('committed')).toHaveTextContent('0.5');
    expect(box().value).toBe('.5');
  });

  it('never emits NaN, whatever is typed', () => {
    const seen: number[] = [];
    function Spy() {
      const [v, setV] = useState(1);
      return (
        <NumberInput
          aria-label="qty"
          value={v}
          onValueChange={(n) => { seen.push(n); setV(n); }}
          emptyValue={1}
          integer
        />
      );
    }
    render(<Spy />);
    for (const raw of ['', '-', '.', 'abc', '4', '40']) {
      fireEvent.change(box(), { target: { value: raw } });
    }
    expect(seen.every((n) => Number.isFinite(n))).toBe(true);
  });

  it('parses whole numbers when integer is set', () => {
    render(<Harness initial={1} emptyValue={1} integer />);
    fireEvent.change(box(), { target: { value: '3.9' } });
    expect(screen.getByTestId('committed')).toHaveTextContent('3');
  });
});
