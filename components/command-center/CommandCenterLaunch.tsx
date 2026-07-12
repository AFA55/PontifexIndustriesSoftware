'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * Launch tile for the Jarvis Command Center, pinned at the bottom of the admin
 * dashboard. Brand-gradient mini arc-reactor mark + label → /dashboard/command-center.
 *
 * Render this only for command-center roles — see COMMAND_CENTER_ROLES in lib/rbac.ts
 * (all office/management roles; worker tier excluded). The render sites gate by role;
 * this component carries no role logic of its own.
 * It is an intentional dark tile that does NOT invert for light mode (it teases the
 * dark HUD it links to).
 *
 * The Platform Hub reuses this tile with owner-facing copy (Artifex as the
 * founder's 2nd brain for Pontifex itself) — the chat + memory notes are
 * tenant-scoped, so opened under the PONTIFEX org it manages Pontifex, not a client.
 */
export default function CommandCenterLaunch({
  title = 'Artifex',
  description = "Your AI operations assistant — talk to it, ask about jobs and hours, create tickets by voice.",
  badge = 'AI',
}: {
  title?: string;
  description?: string;
  badge?: string;
}) {
  return (
    <Link
      href="/dashboard/command-center"
      className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-[#0d0820] p-5 shadow-lg transition-transform hover:scale-[1.005] sm:p-6"
    >
      {/* ambient brand glow */}
      <div className="pointer-events-none absolute -left-12 -top-12 h-48 w-48 rounded-full bg-[#0EA5E9]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 right-0 h-52 w-52 rounded-full bg-[#DC2626]/20 blur-3xl" />
      <div className="relative flex items-center gap-4">
        {/* mini arc-reactor mark */}
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-gradient-to-br from-[#0EA5E9] to-[#DC2626] opacity-20" />
          <span className="absolute inset-1 rounded-full border-2 border-[#38BDF8]/60" />
          <span className="absolute inset-[14px] rounded-full bg-gradient-to-br from-[#0EA5E9] via-[#38BDF8] to-[#DC2626] shadow-[0_0_16px_rgba(56,189,248,0.7)]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
              {title}
            </h2>
            <span className="rounded-full border border-[#38BDF8]/40 bg-[#38BDF8]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-200">
              {badge}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-white/55">
            {description}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-white/40 transition-transform group-hover:translate-x-1 group-hover:text-white/80" />
      </div>
    </Link>
  );
}
