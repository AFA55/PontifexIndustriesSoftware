'use client';

/**
 * A number field you can actually CLEAR.
 *
 * ── THE BUG THIS EXISTS TO KILL (founder, Aug 2026) ─────────────────────────
 * "in places where 1 is a placeholder … there have been times I try to type
 *  linear ft and it doesn't let me delete the 1"
 *
 * Every numeric field in the app was written like this:
 *
 *     <input type="number"
 *            value={qty}                                    // a NUMBER
 *            onChange={e => setQty(parseInt(e.target.value) || 1)} />
 *
 * Select-all + Delete makes `e.target.value` the empty string. `parseInt('')`
 * is NaN, `NaN || 1` is 1 — so React immediately re-renders the box with "1"
 * in it. The field physically cannot be emptied: the operator deletes the 1,
 * it reappears, and to enter 40 they have to fight the cursor. The same shape
 * with `|| 0` traps a "0" in every linear-feet / depth / width box. That is
 * ~110 fields across work-performed, the schedule form and equipment quantity.
 *
 * ── THE FIX ─────────────────────────────────────────────────────────────────
 * While the user is typing, a local DRAFT string is what's displayed — so the
 * box shows exactly what they typed, including nothing at all. The parsed
 * number still flows out on every keystroke, so nothing downstream changes.
 * On blur the draft is dropped and the committed value takes over again.
 *
 * `blankZero` additionally hides a meaningless leading "0" in measurement
 * fields, so the operator sees an empty box with a placeholder instead of a
 * zero they have to delete first.
 */

import { forwardRef, useState, type InputHTMLAttributes } from 'react';

type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  /**
   * Accepts a string too: plenty of this codebase's form state is typed
   * `string | number` because it round-trips through inputs. Anything
   * unparseable shows as an empty box rather than "NaN".
   */
  value: number | string | null | undefined;
  /** Fires on every keystroke with the parsed number (never NaN). */
  onValueChange: (next: number) => void;
  /** What an empty box means. Quantities use 1; measurements use 0. */
  emptyValue?: number;
  /** parseInt instead of parseFloat (whole counts: quantity, # of cuts). */
  integer?: boolean;
  /** Show an empty box instead of a bare "0" when nothing has been entered. */
  blankZero?: boolean;
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    { value, onValueChange, emptyValue = 0, integer = false, blankZero = false, onBlur, ...rest },
    ref
  ) {
    // null = "not editing"; the committed value is displayed.
    // Any string (including '') = "the user is typing"; show it verbatim.
    const [draft, setDraft] = useState<string | null>(null);

    let shown: string;
    if (draft !== null) {
      shown = draft;
    } else if (value === null || value === undefined || value === '') {
      shown = '';
    } else if (typeof value === 'number' && Number.isNaN(value)) {
      shown = '';
    } else if (blankZero && Number(value) === 0) {
      shown = '';
    } else {
      shown = String(value);
    }

    return (
      <input
        {...rest}
        ref={ref}
        type="number"
        inputMode={integer ? 'numeric' : 'decimal'}
        value={shown}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          if (raw === '' || raw === '-' || raw === '.') {
            // Mid-edit or emptied — report "nothing entered" but DON'T force
            // the box back to a number, or we recreate the original bug.
            onValueChange(emptyValue);
            return;
          }
          const parsed = integer ? parseInt(raw, 10) : parseFloat(raw);
          if (!Number.isNaN(parsed)) onValueChange(parsed);
        }}
        onBlur={(e) => {
          setDraft(null);
          onBlur?.(e);
        }}
      />
    );
  }
);

export default NumberInput;
