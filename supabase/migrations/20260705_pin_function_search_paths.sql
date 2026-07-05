-- Security hardening (advisor: function_search_path_mutable, 16 findings, Jul 5 2026).
-- Pin search_path so these functions can't be hijacked via a role-mutable
-- search path. Idempotent: re-running just re-sets the same setting. Applied to prod.
ALTER FUNCTION public.get_current_tenant_id() SET search_path = public;
ALTER FUNCTION public.get_tenant_by_code(p_code text) SET search_path = public;
ALTER FUNCTION public.get_tenant_by_slug(p_slug text) SET search_path = public;
ALTER FUNCTION public.get_user_tenant_id(p_user_id uuid) SET search_path = public;
ALTER FUNCTION public.hiring_set_updated_at() SET search_path = public;
ALTER FUNCTION public.subsistence_nights_set_updated_at() SET search_path = public;
ALTER FUNCTION public.supervisor_visits_set_updated_at() SET search_path = public;
ALTER FUNCTION public.update_dashboard_layouts_updated_at() SET search_path = public;
ALTER FUNCTION public.update_dashboard_notes_updated_at() SET search_path = public;
ALTER FUNCTION public.update_dashboard_tasks_updated_at() SET search_path = public;
ALTER FUNCTION public.update_operator_daily_reports_updated_at() SET search_path = public;
ALTER FUNCTION public.update_pay_category_config_updated_at() SET search_path = public;
ALTER FUNCTION public.update_rating_forms_updated_at() SET search_path = public;
ALTER FUNCTION public.update_tenants_updated_at() SET search_path = public;
ALTER FUNCTION public.upsert_equipment_recommendation(p_scope_type text, p_equipment_item text) SET search_path = public;
ALTER FUNCTION public.vehicles_set_updated_at() SET search_path = public;
