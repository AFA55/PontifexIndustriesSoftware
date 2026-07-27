'use client';

export const dynamic = 'force-dynamic';

/**
 * Tools hub — field/office utilities available to ALL users (no role gate).
 * Previously the /dashboard/tools route had no page (the JSA form linked back
 * to a 404); this is that hub. Add new tool cards here.
 */

import Link from 'next/link';
import { ArrowLeft, Scale, ClipboardList, ChevronRight, Wrench } from 'lucide-react';

const TOOLS = [
  {
    href: '/dashboard/tools/concrete-calculator',
    icon: Scale,
    title: 'Concrete Weight Calculator',
    desc: 'Estimate the weight of a slab cut, removal, or core before you lift or haul it.',
  },
  {
    href: '/dashboard/tools/jsa-form',
    icon: ClipboardList,
    title: 'Job Safety Analysis (JSA)',
    desc: 'Fill out a job safety analysis: hazards, controls, PPE, and sign-off.',
  },
];

export default function ToolsHubPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-5">
        <Link href="/dashboard" className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Back to dashboard">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shrink-0">
          <Wrench className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Tools</h1>
          <p className="text-xs text-slate-500 dark:text-white/50">Handy calculators and forms for the field.</p>
        </div>
      </div>

      <div className="space-y-3">
        {TOOLS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-white/[0.04] ring-1 ring-slate-100 dark:ring-white/10 hover:ring-violet-300 dark:hover:ring-violet-500/40 transition-colors min-h-[64px]"
          >
            <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center shrink-0">
              <t.icon className="w-5 h-5 text-violet-600 dark:text-violet-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.title}</p>
              <p className="text-xs text-slate-500 dark:text-white/50">{t.desc}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 dark:text-white/30 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
