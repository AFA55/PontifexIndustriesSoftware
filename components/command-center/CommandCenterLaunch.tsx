'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * Launch tile for the Jarvis Command Center, pinned at the bottom of the admin
 * dashboard. Brand-gradient mini arc-reactor mark + label → /dashboard/command-center.
 *
 * Render this only for command-center roles (admin / super_admin / operations_manager).
 * It is an intentional dark tile that does NOT invert for light mode (it teases the
 * dark HUD it links to).
 */
export default function CommandCenterLaunch() {
  return (
    <Link
      href="/dashboard/command-center"
      className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-[#0d0820] p-5 shadow-lg transition-transform hover:scale-[1.005] sm:p-6"
    >
      {/* ambient brand glow */}
      <div className="pointer-events-none absolute -left-12 -top-12 h-48 w-48 rounded-full bg-[#7C3AED]/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 right-0 h-52 w-52 rounded-full bg-[#EF4444]/20 blur-3xl" />
      <div className="relative flex items-center gap-4">
        {/* mini arc-reactor mark */}
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-gradient-to-br from-[#7C3AED] to-[#EF4444] opacity-20" />
          <span className="absolute inset-1 rounded-full border-2 border-[#DB2777]/60" />
          <span className="absolute inset-[14px] rounded-full bg-gradient-to-br from-[#7C3AED] via-[#DB2777] to-[#EF4444] shadow-[0_0_16px_rgba(219,39,119,0.7)]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Command Center
            </h2>
            <span className="rounded-full border border-[#DB2777]/40 bg-[#DB2777]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-pink-200">
              New
            </span>
          </div>
          <p className="mt-0.5 text-sm text-white/55">
            Your live operations HUD — clocked-in crew, today&apos;s jobs, approvals at a glance.
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-white/40 transition-transform group-hover:translate-x-1 group-hover:text-white/80" />
      </div>
    </Link>
  );
}
