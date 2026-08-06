'use client';

/**
 * "Cut Rebar — what size?" — the replacement for the old yes/no "Cut Steel"
 * checkbox on every hole / cut / area entry (founder, Aug 2026).
 *
 * WHY A SIZE INSTEAD OF A BOOLEAN: "we cut steel" tells the office nothing.
 * #4 vs #9 is the difference between a normal cut and a blade-eating one, and
 * it is what a change order gets argued over. The question is the same one the
 * operator was already answering in free text ("Number 4", "#4 rebar").
 *
 * FIELD CONSTRAINTS (do not shrink these):
 *  - Operators are on a phone, outdoors, often with gloves. Every chip is a
 *    ≥44px tap target. No <select> — a native dropdown of 12 tiny options is
 *    exactly the control that fails with gloves on.
 *  - ALWAYS OPTIONAL. "I don't know" is a real answer on a real jobsite, so
 *    there is an explicit Other/Unknown escape hatch and nothing here can ever
 *    block a submit.
 *  - Tapping the selected chip again clears it — that is how you say "no
 *    rebar" after a mis-tap, without a separate No button.
 *
 * The value is a plain string ('' = nothing recorded). The caller derives the
 * legacy `cutSteel` boolean from it; see lib/work-items-format.ts.
 */

import { useState } from 'react';
import { REBAR_SIZES } from '@/lib/work-items-format';

interface RebarSizePickerProps {
  /** '' when nothing was recorded; '#4'; or free text from the Other box. */
  value: string;
  onChange: (next: string) => void;
  /** Heading — overridable so the areas grid can say "Rebar in this area?". */
  title?: string;
  className?: string;
}

export function RebarSizePicker({
  value,
  onChange,
  title = 'Cut Rebar?',
  className = '',
}: RebarSizePickerProps) {
  const current = (value || '').trim();
  const isPreset = (REBAR_SIZES as readonly string[]).includes(current);
  // Free text (or a freshly-tapped Other with nothing typed yet) keeps the box
  // open. Derived state alone can't know about the empty-but-open case.
  const [otherOpen, setOtherOpen] = useState(current !== '' && !isPreset);

  const selectSize = (size: string) => {
    // Second tap on the active chip clears it — "actually, no rebar".
    if (current === size) {
      onChange('');
    } else {
      onChange(size);
    }
    setOtherOpen(false);
  };

  const active = current !== '';

  return (
    <div
      className={`rounded-xl border-2 px-4 py-3 transition-all ${
        active
          ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
          : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03]'
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
          <p className="text-xs text-gray-500 dark:text-white/50 mt-0.5">
            Tap the bar size you cut through. Leave blank if there was none.
          </p>
        </div>
        {active && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOtherOpen(false);
            }}
            className="flex-shrink-0 min-h-[44px] px-3 text-xs font-bold text-gray-500 dark:text-white/50 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
        {REBAR_SIZES.map((size) => {
          const selected = current === size;
          return (
            <button
              key={size}
              type="button"
              onClick={() => selectSize(size)}
              className={`min-h-[44px] rounded-xl border-2 text-sm font-bold transition-all ${
                selected
                  ? 'border-red-500 bg-red-500 text-white shadow-md'
                  : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white hover:border-red-300'
              }`}
            >
              {size}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            // Switching to Other drops a previously-picked chip, so the text
            // box and the highlighted chip can never disagree about the answer.
            setOtherOpen(true);
            if (isPreset) onChange('');
          }}
          className={`min-h-[44px] col-span-2 rounded-xl border-2 text-sm font-bold transition-all ${
            otherOpen
              ? 'border-red-500 bg-red-500 text-white shadow-md'
              : 'border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white hover:border-red-300'
          }`}
        >
          Other
        </button>
      </div>

      {otherOpen && (
        <input
          type="text"
          value={isPreset ? '' : current}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. unknown, mesh, angle iron"
          /* text-base, not text-sm: iOS zooms the whole page on focus below 16px. */
          className="mt-2 w-full min-h-[44px] px-3 py-2 text-base border-2 border-red-300 dark:border-red-500/30 rounded-xl focus:border-red-500 focus:outline-none bg-white dark:bg-white/[0.05] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30"
        />
      )}
    </div>
  );
}

export default RebarSizePicker;
