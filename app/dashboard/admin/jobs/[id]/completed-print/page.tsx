'use client';

export const dynamic = 'force-dynamic';

/**
 * SUPERSEDED (Aug 2026) — this URL now redirects to the WORK TICKET.
 *
 * The old completed-ticket printout rendered one whole-job sheet with no
 * per-day and no per-operator separation. The founder needs the crew's work
 * split BY DAY and BY OPERATOR, plus a same-day / whole-week choice, in the
 * real paper-ticket layout. That lives at
 * `app/dashboard/admin/jobs/[id]/work-ticket` and is a strict superset of what
 * this page printed (customer + address + job no. + times + work performed +
 * footage + subsistence + signature, plus the agreement block, the numbered
 * checklist and the three-copy footer).
 *
 * The route is kept as a redirect because the URL is linked from the
 * completed-job-tickets view and may be bookmarked by the office. `week` mode
 * is the right landing for a finished job — it shows every day the crew was
 * there with the grand total.
 */

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';

export default function CompletedPrintRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/dashboard/admin/jobs/${jobId}/work-ticket?mode=week`);
  }, [jobId, router]);

  return <div className="p-8 text-sm text-gray-600">Opening the work ticket…</div>;
}
