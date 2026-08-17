'use client';

import { AlertTriangle } from 'lucide-react';
import type { ComplianceItem } from '@/lib/site-compliance-display';

/**
 * The rendered form of `site_compliance` for the crew.
 *
 * ONE COMPONENT, BOTH OPERATOR SURFACES. The job ticket (`my-jobs/[id]`) and
 * the jobsite screen (`my-jobs/[id]/jobsite`) each used to run their own
 * key/value loop over the same jsonb, with different fallbacks — so the same
 * job could read "Orientation Datetime · 2026-08-16T08:00" on one screen and
 * "Orientation Datetime · Yes" on the other. The wording lives in
 * `lib/site-compliance-display.ts`; the pixels live here; neither page has an
 * opinion of its own.
 *
 * WHY IT STACKS INSTEAD OF ALIGNING RIGHT. This is read on a 375px phone,
 * one-handed, often with gloves on. "Attend site orientation" next to
 * "Sun, Aug 16 · 8:00 AM" on one line either wraps into mush or truncates the
 * half that matters. Stacked, the instruction is the heading and the time is
 * the biggest thing under it — which is the order you'd say it out loud.
 *
 * Nothing here is smaller than 14px and nothing is interactive, so there are no
 * tap targets to size; the only control is the collapse header the page owns.
 */
export default function SiteComplianceList({ items }: { items: ComplianceItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const critical = item.tone === 'critical';
        return (
          <div
            key={item.key}
            className={`rounded-xl border px-4 py-3 ${
              critical
                ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/40'
                : 'bg-gray-50 dark:bg-white/[0.05] border-gray-200 dark:border-white/10'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {critical && (
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              )}
              <div className="flex-1 min-w-0">
                {/* THE INSTRUCTION. Not a field name — what they have to do. */}
                <p
                  className={`text-[15px] font-bold leading-snug ${
                    critical
                      ? 'text-amber-900 dark:text-amber-200'
                      : 'text-gray-700 dark:text-white/70'
                  }`}
                >
                  {item.label}
                </p>

                {/* THE FACT. Empty for a bare flag, where the label already
                    says everything — a "Yes" under "No photos on this site"
                    would be noise, not information. */}
                {item.value !== '' && (
                  <p
                    className={`mt-1 font-extrabold break-words ${
                      item.layout === 'block'
                        ? 'text-[15px] font-semibold leading-relaxed whitespace-pre-wrap'
                        : 'text-[17px] leading-tight'
                    } ${critical ? 'text-amber-950 dark:text-white' : 'text-gray-900 dark:text-white'}`}
                  >
                    {item.value}
                  </p>
                )}

                {item.detail && (
                  <p
                    className={`mt-1 text-[14px] leading-snug ${
                      critical
                        ? 'text-amber-800 dark:text-amber-200/80'
                        : 'text-gray-600 dark:text-white/60'
                    }`}
                  >
                    {item.detail}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
