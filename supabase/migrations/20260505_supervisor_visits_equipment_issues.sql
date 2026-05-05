-- Add equipment_issues jsonb to supervisor_visits.
-- Each entry: { equipment_name, equipment_id (nullable until inventory exists),
--               whats_wrong, action ('maintenance' | 'replace'), photo_urls[],
--               status ('open' | 'converted'), created_at }
-- When the shop manager system (Phase 2) lands, a hook converts each entry
-- into a real maintenance_requests row (action='maintenance') or shop_tasks
-- row (action='replace'), then sets status='converted'.

ALTER TABLE public.supervisor_visits
  ADD COLUMN IF NOT EXISTS equipment_issues jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.supervisor_visits.equipment_issues IS
  'Equipment issues captured during a supervisor visit. JSONB array of objects with equipment_name, whats_wrong, action (maintenance|replace), photo_urls, status. Converted to maintenance_requests / shop_tasks once shop manager system lands.';
