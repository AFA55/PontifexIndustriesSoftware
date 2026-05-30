-- Security fix (applied to prod 2026-05-30): 9 SECURITY DEFINER views bypass RLS and were
-- GRANTed to anon/authenticated, allowing unauthenticated cross-tenant reads of P&L, payroll,
-- GPS, and customer data via PostgREST (the anon key ships in the client bundle). All app call
-- sites read these views through the service-role client (supabaseAdmin), which is unaffected by
-- these grants. Revoke anon/authenticated access to close the exfiltration path.
REVOKE ALL ON public.job_pnl_summary FROM anon, authenticated;
REVOKE ALL ON public.job_profitability FROM anon, authenticated;
REVOKE ALL ON public.active_operator_dashboard FROM anon, authenticated;
REVOKE ALL ON public.badges_with_details FROM anon, authenticated;
REVOKE ALL ON public.active_job_orders_v3 FROM anon, authenticated;
REVOKE ALL ON public.active_job_orders FROM anon, authenticated;
REVOKE ALL ON public.schedule_board_view FROM anon, authenticated;
REVOKE ALL ON public.timecards_with_users FROM anon, authenticated;
REVOKE ALL ON public.job_completion_summary FROM anon, authenticated;
