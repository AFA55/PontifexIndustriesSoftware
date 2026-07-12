/**
 * Operator Artifex tools (founder Jul 12: "Artifex for operators — help them
 * in the field, but it must ONLY access what they have access to").
 *
 * HARD PERMISSION WALL: every query filters by BOTH tenantId AND the caller's
 * own userId (assigned_to / helper_assigned_to / user_id). There is no tool
 * that returns other employees' data, revenue, roster, or management state —
 * the wall is the toolset itself, not a prompt instruction. supabaseAdmin
 * bypasses RLS, so these filters ARE the security boundary; never relax them.
 *
 * Read-only by design in v1. "Help me complete my ticket" is guided by the
 * agent (steps + deep links), not by writes on the operator's behalf.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { toLocalYMD } from '@/lib/dates';

const mapsUrl = (address: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
const telUrl = (phone: string) => `tel:${phone.replace(/[^+\d]/g, '')}`;

/** Jobs where THIS user is the operator or the helper — the only job scope. */
function myJobsQuery(tenantId: string, userId: string) {
  return supabaseAdmin
    .from('schedule_board_view')
    .select('job_number, customer_name, status, scheduled_date, arrival_time, address, location, job_type, scope_details, description, site_contact_phone, operator_name, helper_name, assigned_to, helper_assigned_to')
    .eq('tenant_id', tenantId)
    .or(`assigned_to.eq.${userId},helper_assigned_to.eq.${userId}`);
}

export function createOperatorArtifexTools(tenantId: string, userId: string) {
  return {
    get_my_jobs_today: tool({
      description:
        "The caller's OWN jobs for today (as operator or helper): job number, customer, address, arrival time, status. Use for 'what do I have today' or 'where am I going'.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await myJobsQuery(tenantId, userId)
          .eq('scheduled_date', toLocalYMD())
          .order('arrival_time', { ascending: true });
        if (error) throw new Error(`get_my_jobs_today: ${error.message}`);
        return {
          count: data?.length ?? 0,
          jobs: (data ?? []).map((j: any) => ({
            jobNumber: j.job_number,
            customer: j.customer_name,
            status: j.status,
            arrivalTime: j.arrival_time,
            address: j.address ?? j.location,
            jobType: j.job_type,
          })),
        };
      },
    }),

    get_my_upcoming_jobs: tool({
      description: "The caller's OWN jobs for the next 7 days. Use for 'what's my week look like'.",
      inputSchema: z.object({}),
      execute: async () => {
        const today = toLocalYMD();
        const week = new Date();
        week.setDate(week.getDate() + 7);
        const { data, error } = await myJobsQuery(tenantId, userId)
          .gte('scheduled_date', today)
          .lte('scheduled_date', toLocalYMD(week))
          .order('scheduled_date');
        if (error) throw new Error(`get_my_upcoming_jobs: ${error.message}`);
        return {
          count: data?.length ?? 0,
          jobs: (data ?? []).map((j: any) => ({
            date: j.scheduled_date,
            jobNumber: j.job_number,
            customer: j.customer_name,
            address: j.address ?? j.location,
            status: j.status,
          })),
        };
      },
    }),

    get_my_job_details: tool({
      description:
        "Full details of ONE of the caller's own jobs: scope, address WITH a tap-to-navigate directions link, and the site contact WITH a tap-to-call link. Use for 'directions to my job', 'call the site contact', 'what's the scope'. Returns nothing for jobs not assigned to the caller.",
      inputSchema: z.object({
        jobNumber: z.string().optional().describe("Job number like QA-2026-123456; omit to use today's first job"),
      }),
      execute: async ({ jobNumber }) => {
        let q = myJobsQuery(tenantId, userId);
        q = jobNumber ? q.eq('job_number', jobNumber) : q.eq('scheduled_date', toLocalYMD());
        const { data, error } = await q.order('arrival_time').limit(1);
        if (error) throw new Error(`get_my_job_details: ${error.message}`);
        const j: any = data?.[0];
        if (!j) return { found: false, note: 'No matching job assigned to you.' };
        const address = j.address ?? j.location ?? null;
        const phone = j.site_contact_phone ?? null;
        return {
          found: true,
          jobNumber: j.job_number,
          customer: j.customer_name,
          status: j.status,
          date: j.scheduled_date,
          arrivalTime: j.arrival_time,
          jobType: j.job_type,
          scope: j.description ?? null,
          address,
          directionsUrl: address ? mapsUrl(address) : null,
          siteContactPhone: phone,
          callUrl: phone ? telUrl(phone) : null,
          role: j.assigned_to === userId ? 'operator' : 'helper',
        };
      },
    }),

    get_my_hours_this_week: tool({
      description: "The caller's OWN hours this week (their timecards only). Use for 'how many hours do I have'.",
      inputSchema: z.object({}),
      execute: async () => {
        const now = new Date();
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        const { data, error } = await supabaseAdmin
          .from('timecards')
          .select('date, net_hours, total_hours, overtime_hours, is_late')
          .eq('tenant_id', tenantId)
          .eq('user_id', userId)
          .gte('date', toLocalYMD(monday))
          .lte('date', toLocalYMD(now));
        if (error) throw new Error(`get_my_hours_this_week: ${error.message}`);
        const rows = data ?? [];
        const total = rows.reduce((s: number, r: any) => s + Number(r.net_hours ?? r.total_hours ?? 0), 0);
        const ot = rows.reduce((s: number, r: any) => s + Number(r.overtime_hours ?? 0), 0);
        return {
          daysWorked: rows.length,
          totalHours: Math.round(total * 100) / 100,
          overtimeHours: Math.round(ot * 100) / 100,
          lateDays: rows.filter((r: any) => r.is_late).length,
        };
      },
    }),
  };
}
