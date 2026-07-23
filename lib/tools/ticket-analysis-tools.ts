/**
 * Ticket-analysis tools (Platform Hub — AI draft diagnosis for feedback/bug tickets).
 *
 * Every tool here is scoped to the TICKET's tenant_id (the customer who filed the
 * ticket), not the caller's — the caller is always a super_admin investigating
 * someone else's tenant, so `createTicketAnalysisTools(targetTenantId)` closes over
 * that target id and every query below carries an explicit `.eq('tenant_id', ...)`.
 * supabaseAdmin bypasses RLS, so this manual filter IS the security boundary.
 *
 * READ-ONLY, by design: this feature is draft-only (see lib/agents/ticket-analysis-agent.ts).
 * None of these tools may insert/update/delete anything. Do not add a write tool here.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-admin';

export function createTicketAnalysisTools(targetTenantId: string) {
  return {
    get_tenant_profile: tool({
      description:
        "Basic info about the tenant who filed this ticket: name, plan, status, when they signed up, and how many active users they have. Use this first for context on who you're investigating.",
      inputSchema: z.object({}),
      execute: async () => {
        const [tenantRes, userCountRes] = await Promise.all([
          supabaseAdmin
            .from('tenants')
            .select('name, plan, plan_type, status, created_at, max_users, max_jobs_per_month')
            .eq('id', targetTenantId)
            .maybeSingle(),
          supabaseAdmin
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', targetTenantId)
            .eq('active', true)
            .is('deleted_at', null),
        ]);
        if (tenantRes.error) throw new Error(`get_tenant_profile: ${tenantRes.error.message}`);
        if (!tenantRes.data) return { error: 'Tenant not found.' };
        return {
          name: tenantRes.data.name,
          plan: tenantRes.data.plan ?? tenantRes.data.plan_type,
          status: tenantRes.data.status,
          createdAt: tenantRes.data.created_at,
          maxUsers: tenantRes.data.max_users,
          maxJobsPerMonth: tenantRes.data.max_jobs_per_month,
          activeUserCount: userCountRes.count ?? 0,
        };
      },
    }),

    get_tenant_recent_activity: tool({
      description:
        "Recent activity for this tenant across jobs, timecards, and invoices — the last 15 of each, most recent first. Use this to see what the tenant has actually been doing around the time the ticket was filed, to check whether the described problem shows up in the data.",
      inputSchema: z.object({}),
      execute: async () => {
        const [jobsRes, timecardsRes, invoicesRes] = await Promise.all([
          supabaseAdmin
            .from('job_orders')
            .select('job_number, customer_name, status, scheduled_date, created_at')
            .eq('tenant_id', targetTenantId)
            .order('created_at', { ascending: false })
            .limit(15),
          supabaseAdmin
            .from('timecards')
            .select('user_id, date, clock_in_time, clock_out_time, approval_status')
            .eq('tenant_id', targetTenantId)
            .order('clock_in_time', { ascending: false })
            .limit(15),
          supabaseAdmin
            .from('invoices')
            .select('invoice_number, customer_name, status, total_amount, invoice_date, created_at')
            .eq('tenant_id', targetTenantId)
            .order('created_at', { ascending: false })
            .limit(15),
        ]);
        if (jobsRes.error) throw new Error(`get_tenant_recent_activity (jobs): ${jobsRes.error.message}`);
        if (timecardsRes.error) throw new Error(`get_tenant_recent_activity (timecards): ${timecardsRes.error.message}`);
        if (invoicesRes.error) throw new Error(`get_tenant_recent_activity (invoices): ${invoicesRes.error.message}`);
        return {
          recentJobs: jobsRes.data ?? [],
          recentTimecards: timecardsRes.data ?? [],
          recentInvoices: invoicesRes.data ?? [],
        };
      },
    }),

    search_related_records: tool({
      description:
        "Flexible read across this tenant's job_orders, timecards, or invoices, filtered by an optional date range and/or a keyword. Use this to dig into whatever the ticket specifically describes — e.g. a job number, a customer name, a date the customer mentioned. `entity` picks which table to search; `keyword` matches against the most relevant text column for that entity (job_orders: job_number/customer_name/title; invoices: invoice_number/customer_name; timecards has no free-text column, so keyword is ignored there).",
      inputSchema: z.object({
        entity: z.enum(['job_orders', 'timecards', 'invoices']).describe('Which table to search.'),
        keyword: z.string().optional().describe('Optional keyword to match (job number, customer name, invoice number).'),
        dateFrom: z.string().optional().describe('Optional inclusive start date, YYYY-MM-DD.'),
        dateTo: z.string().optional().describe('Optional inclusive end date, YYYY-MM-DD.'),
        limit: z.number().int().positive().max(50).optional().describe('Max rows to return (default 25).'),
      }),
      execute: async ({ entity, keyword, dateFrom, dateTo, limit }) => {
        const cap = limit ?? 25;
        // Strip PostgREST filter metachars from the model-derived keyword before
        // it goes into any .or() string (security audit M3).
        const kw = keyword ? keyword.replace(/[%,()]/g, '').trim() : keyword;

        if (entity === 'job_orders') {
          let q = supabaseAdmin
            .from('job_orders')
            .select('job_number, title, customer_name, status, scheduled_date, created_at, description')
            .eq('tenant_id', targetTenantId)
            .order('created_at', { ascending: false })
            .limit(cap);
          if (dateFrom) q = q.gte('scheduled_date', dateFrom);
          if (dateTo) q = q.lte('scheduled_date', dateTo);
          if (kw) q = q.or(`job_number.ilike.%${kw}%,customer_name.ilike.%${kw}%,title.ilike.%${kw}%`);
          const { data, error } = await q;
          if (error) throw new Error(`search_related_records (job_orders): ${error.message}`);
          return { entity, count: data?.length ?? 0, results: data ?? [] };
        }

        if (entity === 'invoices') {
          let q = supabaseAdmin
            .from('invoices')
            .select('invoice_number, customer_name, status, total_amount, balance_due, invoice_date, due_date, created_at')
            .eq('tenant_id', targetTenantId)
            .order('created_at', { ascending: false })
            .limit(cap);
          if (dateFrom) q = q.gte('invoice_date', dateFrom);
          if (dateTo) q = q.lte('invoice_date', dateTo);
          if (kw) q = q.or(`invoice_number.ilike.%${kw}%,customer_name.ilike.%${kw}%`);
          const { data, error } = await q;
          if (error) throw new Error(`search_related_records (invoices): ${error.message}`);
          return { entity, count: data?.length ?? 0, results: data ?? [] };
        }

        let q = supabaseAdmin
          .from('timecards')
          .select('user_id, date, clock_in_time, clock_out_time, total_hours, approval_status, flagged_reason')
          .eq('tenant_id', targetTenantId)
          .order('date', { ascending: false })
          .limit(cap);
        if (dateFrom) q = q.gte('date', dateFrom);
        if (dateTo) q = q.lte('date', dateTo);
        const { data, error } = await q;
        if (error) throw new Error(`search_related_records (timecards): ${error.message}`);
        return { entity, count: data?.length ?? 0, results: data ?? [] };
      },
    }),
  };
}

/** Static instance (dummy tenant id) used ONLY for type inference — never executed. */
export const ticketAnalysisToolsForTypes = createTicketAnalysisTools('');
