-- =============================================================================
-- Operator Workflow Full Deployment
-- =============================================================================
-- Full operator job-flow tracking: clocked_in → en_route → arrived →
-- equipment_check → safety_briefing → work_in_progress → break →
-- wrapping_up → customer_signoff → completed.
-- Includes NFC clock-in/out via single tap, workflow step validation,
-- and a real-time active_operator_dashboard view.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. operator_workflow_sessions table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.operator_workflow_sessions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_order_id            UUID NOT NULL REFERENCES public.job_orders(id) ON DELETE CASCADE,
  operator_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timecard_id             UUID REFERENCES public.timecards(id) ON DELETE SET NULL,

  -- Current state
  current_step            TEXT NOT NULL DEFAULT 'clocked_in'
    CHECK (current_step IN (
      'clocked_in',
      'en_route',
      'arrived',
      'equipment_check',
      'safety_briefing',
      'work_in_progress',
      'break',
      'wrapping_up',
      'customer_signoff',
      'completed'
    )),

  -- Step timestamps
  clocked_in_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  en_route_at             TIMESTAMPTZ,
  arrived_at              TIMESTAMPTZ,
  equipment_check_at      TIMESTAMPTZ,
  safety_briefing_at      TIMESTAMPTZ,
  work_started_at         TIMESTAMPTZ,
  break_started_at        TIMESTAMPTZ,
  wrapping_up_at          TIMESTAMPTZ,
  customer_signoff_at     TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,

  -- Location snapshots (lat/lng at key steps)
  en_route_latitude       DECIMAL(9,6),
  en_route_longitude      DECIMAL(9,6),
  arrived_latitude        DECIMAL(9,6),
  arrived_longitude       DECIMAL(9,6),
  completed_latitude      DECIMAL(9,6),
  completed_longitude     DECIMAL(9,6),

  -- Equipment check
  equipment_check_passed  BOOLEAN,
  equipment_issues        TEXT,

  -- Customer sign-off
  customer_signature      TEXT,  -- base64 or storage URL
  customer_name_signed    TEXT,
  customer_signed_at      TIMESTAMPTZ,

  -- NFC tracking
  clock_in_nfc_tag_uid    TEXT,
  clock_out_nfc_tag_uid   TEXT,
  clock_in_method         TEXT NOT NULL DEFAULT 'manual'
    CHECK (clock_in_method IN ('nfc', 'gps', 'manual', 'remote')),

  -- Session metadata
  is_active               BOOLEAN NOT NULL DEFAULT true,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One active session per operator per job
  CONSTRAINT uq_operator_workflow_active
    UNIQUE (job_order_id, operator_id, is_active)
    DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE public.operator_workflow_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_sessions_own" ON public.operator_workflow_sessions
  FOR ALL
  USING (
    operator_id = auth.uid()
    OR (auth.jwt() -> 'user_metadata' ->> 'role') IN
      ('super_admin', 'operations_manager', 'admin', 'shop_manager')
  );

CREATE INDEX IF NOT EXISTS idx_workflow_sessions_operator
  ON public.operator_workflow_sessions(operator_id);
CREATE INDEX IF NOT EXISTS idx_workflow_sessions_job
  ON public.operator_workflow_sessions(job_order_id);
CREATE INDEX IF NOT EXISTS idx_workflow_sessions_active
  ON public.operator_workflow_sessions(is_active, operator_id) WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. operator_workflow_log table (immutable audit trail)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.operator_workflow_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES public.operator_workflow_sessions(id) ON DELETE CASCADE,
  operator_id     UUID NOT NULL REFERENCES auth.users(id),
  job_order_id    UUID NOT NULL REFERENCES public.job_orders(id),
  from_step       TEXT,
  to_step         TEXT NOT NULL,
  transition_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude        DECIMAL(9,6),
  longitude       DECIMAL(9,6),
  nfc_tag_uid     TEXT,
  method          TEXT DEFAULT 'manual',
  notes           TEXT
);

ALTER TABLE public.operator_workflow_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_log_own" ON public.operator_workflow_log
  FOR SELECT
  USING (
    operator_id = auth.uid()
    OR (auth.jwt() -> 'user_metadata' ->> 'role') IN
      ('super_admin', 'operations_manager', 'admin', 'shop_manager')
  );

CREATE POLICY "workflow_log_insert" ON public.operator_workflow_log
  FOR INSERT WITH CHECK (operator_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_workflow_log_session
  ON public.operator_workflow_log(session_id);
CREATE INDEX IF NOT EXISTS idx_workflow_log_operator_date
  ON public.operator_workflow_log(operator_id, transition_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. nfc_clock_in() — single NFC tap handles clock-in OR clock-out
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.nfc_clock_in(
  p_nfc_tag_uid   TEXT,
  p_latitude      DECIMAL DEFAULT NULL,
  p_longitude     DECIMAL DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_tag           public.nfc_tags%ROWTYPE;
  v_user_id       UUID := auth.uid();
  v_open_tc       public.timecards%ROWTYPE;
  v_job_id        UUID;
  v_new_tc_id     UUID;
  v_session_id    UUID;
  v_result        JSONB;
BEGIN
  -- Validate NFC tag
  SELECT * INTO v_tag
  FROM public.nfc_tags
  WHERE tag_uid = p_nfc_tag_uid AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown or inactive NFC tag');
  END IF;

  -- Update last_scanned
  UPDATE public.nfc_tags
  SET last_scanned_at = NOW(), last_scanned_by = v_user_id
  WHERE id = v_tag.id;

  -- Check for open timecard (clock-out path)
  SELECT * INTO v_open_tc
  FROM public.timecards
  WHERE user_id = v_user_id AND clock_out_time IS NULL
  ORDER BY clock_in_time DESC
  LIMIT 1;

  IF FOUND THEN
    -- ── CLOCK OUT ──
    UPDATE public.timecards
    SET
      clock_out_time       = NOW(),
      clock_out_latitude   = p_latitude,
      clock_out_longitude  = p_longitude,
      nfc_tag_uid          = p_nfc_tag_uid,
      nfc_tag_id           = v_tag.id
    WHERE id = v_open_tc.id;

    -- Close active workflow session if exists
    UPDATE public.operator_workflow_sessions
    SET current_step = 'completed',
        completed_at = NOW(),
        is_active    = false,
        updated_at   = NOW(),
        clock_out_nfc_tag_uid = p_nfc_tag_uid,
        completed_latitude  = p_latitude,
        completed_longitude = p_longitude
    WHERE operator_id = v_user_id AND is_active = true
    RETURNING id INTO v_session_id;

    -- Log transition
    IF v_session_id IS NOT NULL THEN
      INSERT INTO public.operator_workflow_log
        (session_id, operator_id, job_order_id, from_step, to_step, latitude, longitude, nfc_tag_uid, method)
      SELECT v_session_id, v_user_id, job_order_id, 'wrapping_up', 'completed',
             p_latitude, p_longitude, p_nfc_tag_uid, 'nfc'
      FROM public.operator_workflow_sessions WHERE id = v_session_id;
    END IF;

    v_result := jsonb_build_object(
      'success',  true,
      'action',   'clock_out',
      'tag_label', v_tag.label,
      'timecard_id', v_open_tc.id
    );

  ELSE
    -- ── CLOCK IN ──
    -- Find assigned job for today
    SELECT id INTO v_job_id
    FROM public.job_orders
    WHERE assigned_to = v_user_id
      AND scheduled_date = CURRENT_DATE
      AND status NOT IN ('completed', 'cancelled')
      AND deleted_at IS NULL
    ORDER BY dispatch_priority ASC, created_at ASC
    LIMIT 1;

    INSERT INTO public.timecards (
      user_id, date, clock_in_time,
      clock_in_latitude, clock_in_longitude,
      clock_in_method, nfc_tag_uid, nfc_tag_id,
      job_order_id, timecard_source
    ) VALUES (
      v_user_id, CURRENT_DATE, NOW(),
      p_latitude, p_longitude,
      'nfc', p_nfc_tag_uid, v_tag.id,
      v_job_id, 'nfc'
    ) RETURNING id INTO v_new_tc_id;

    -- Create workflow session if job found
    IF v_job_id IS NOT NULL THEN
      INSERT INTO public.operator_workflow_sessions (
        job_order_id, operator_id, timecard_id,
        current_step, clocked_in_at,
        clock_in_nfc_tag_uid, clock_in_method
      ) VALUES (
        v_job_id, v_user_id, v_new_tc_id,
        'clocked_in', NOW(),
        p_nfc_tag_uid, 'nfc'
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_session_id;

      -- Log first transition
      IF v_session_id IS NOT NULL THEN
        INSERT INTO public.operator_workflow_log
          (session_id, operator_id, job_order_id, from_step, to_step,
           latitude, longitude, nfc_tag_uid, method)
        VALUES
          (v_session_id, v_user_id, v_job_id, NULL, 'clocked_in',
           p_latitude, p_longitude, p_nfc_tag_uid, 'nfc');
      END IF;
    END IF;

    v_result := jsonb_build_object(
      'success',     true,
      'action',      'clock_in',
      'tag_label',   v_tag.label,
      'timecard_id', v_new_tc_id,
      'job_id',      v_job_id
    );
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. advance_operator_workflow() — validated step progression
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.advance_operator_workflow(
  p_session_id  UUID,
  p_to_step     TEXT,
  p_latitude    DECIMAL DEFAULT NULL,
  p_longitude   DECIMAL DEFAULT NULL,
  p_notes       TEXT    DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_session     public.operator_workflow_sessions%ROWTYPE;
  v_allowed     TEXT[];
BEGIN
  SELECT * INTO v_session
  FROM public.operator_workflow_sessions
  WHERE id = p_session_id AND operator_id = auth.uid() AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found or not active');
  END IF;

  -- Define valid next steps for each current step
  v_allowed := CASE v_session.current_step
    WHEN 'clocked_in'       THEN ARRAY['en_route', 'arrived']
    WHEN 'en_route'         THEN ARRAY['arrived']
    WHEN 'arrived'          THEN ARRAY['equipment_check', 'safety_briefing', 'work_in_progress']
    WHEN 'equipment_check'  THEN ARRAY['safety_briefing', 'work_in_progress']
    WHEN 'safety_briefing'  THEN ARRAY['work_in_progress']
    WHEN 'work_in_progress' THEN ARRAY['break', 'wrapping_up']
    WHEN 'break'            THEN ARRAY['work_in_progress']
    WHEN 'wrapping_up'      THEN ARRAY['customer_signoff', 'completed']
    WHEN 'customer_signoff' THEN ARRAY['completed']
    ELSE ARRAY[]::TEXT[]
  END;

  IF NOT (p_to_step = ANY(v_allowed)) THEN
    RETURN jsonb_build_object(
      'success',  false,
      'error',    format('Cannot move from %s to %s', v_session.current_step, p_to_step),
      'allowed',  v_allowed
    );
  END IF;

  -- Apply timestamp for the new step
  UPDATE public.operator_workflow_sessions SET
    current_step        = p_to_step,
    notes               = COALESCE(p_notes, notes),
    updated_at          = NOW(),
    en_route_at         = CASE WHEN p_to_step = 'en_route'         THEN NOW() ELSE en_route_at         END,
    arrived_at          = CASE WHEN p_to_step = 'arrived'          THEN NOW() ELSE arrived_at          END,
    equipment_check_at  = CASE WHEN p_to_step = 'equipment_check'  THEN NOW() ELSE equipment_check_at  END,
    safety_briefing_at  = CASE WHEN p_to_step = 'safety_briefing'  THEN NOW() ELSE safety_briefing_at  END,
    work_started_at     = CASE WHEN p_to_step = 'work_in_progress' THEN NOW() ELSE work_started_at     END,
    break_started_at    = CASE WHEN p_to_step = 'break'            THEN NOW() ELSE break_started_at    END,
    wrapping_up_at      = CASE WHEN p_to_step = 'wrapping_up'      THEN NOW() ELSE wrapping_up_at      END,
    customer_signoff_at = CASE WHEN p_to_step = 'customer_signoff' THEN NOW() ELSE customer_signoff_at END,
    completed_at        = CASE WHEN p_to_step = 'completed'        THEN NOW() ELSE completed_at        END,
    is_active           = CASE WHEN p_to_step = 'completed'        THEN false ELSE is_active           END,
    -- Location snapshots
    en_route_latitude   = CASE WHEN p_to_step = 'en_route' THEN p_latitude  ELSE en_route_latitude  END,
    en_route_longitude  = CASE WHEN p_to_step = 'en_route' THEN p_longitude ELSE en_route_longitude END,
    arrived_latitude    = CASE WHEN p_to_step = 'arrived'  THEN p_latitude  ELSE arrived_latitude   END,
    arrived_longitude   = CASE WHEN p_to_step = 'arrived'  THEN p_longitude ELSE arrived_longitude  END,
    completed_latitude  = CASE WHEN p_to_step = 'completed' THEN p_latitude  ELSE completed_latitude END,
    completed_longitude = CASE WHEN p_to_step = 'completed' THEN p_longitude ELSE completed_longitude END
  WHERE id = p_session_id;

  -- Audit log
  INSERT INTO public.operator_workflow_log
    (session_id, operator_id, job_order_id, from_step, to_step,
     latitude, longitude, method, notes)
  VALUES
    (p_session_id, auth.uid(), v_session.job_order_id,
     v_session.current_step, p_to_step,
     p_latitude, p_longitude, 'app', p_notes);

  RETURN jsonb_build_object(
    'success',    true,
    'session_id', p_session_id,
    'from_step',  v_session.current_step,
    'to_step',    p_to_step
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. active_operator_dashboard view
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.active_operator_dashboard AS
SELECT
  ows.id              AS session_id,
  ows.operator_id,
  p.full_name         AS operator_name,
  p.email             AS operator_email,
  p.phone             AS operator_phone,
  p.role              AS operator_role,

  -- Job info
  ows.job_order_id,
  jo.job_number,
  jo.title            AS job_title,
  jo.customer_name,
  jo.address          AS job_address,
  jo.job_type,
  jo.estimated_hours,

  -- Current workflow state
  ows.current_step,
  ows.clocked_in_at,
  ows.en_route_at,
  ows.arrived_at,
  ows.work_started_at,
  ows.wrapping_up_at,
  ows.completed_at,

  -- Time on site
  CASE
    WHEN ows.arrived_at IS NOT NULL AND ows.completed_at IS NULL THEN
      ROUND(EXTRACT(EPOCH FROM (NOW() - ows.arrived_at)) / 3600, 2)
    WHEN ows.arrived_at IS NOT NULL AND ows.completed_at IS NOT NULL THEN
      ROUND(EXTRACT(EPOCH FROM (ows.completed_at - ows.arrived_at)) / 3600, 2)
    ELSE 0
  END                 AS hours_on_site,

  -- Total shift time
  ROUND(EXTRACT(EPOCH FROM (NOW() - ows.clocked_in_at)) / 3600, 2)
                      AS total_shift_hours,

  -- Timecard link
  ows.timecard_id,
  tc.clock_in_time,
  tc.clock_in_method,

  -- Location
  ows.en_route_latitude,
  ows.en_route_longitude,
  ows.arrived_latitude,
  ows.arrived_longitude,

  -- Equipment check status
  ows.equipment_check_passed,
  ows.equipment_issues,

  -- Customer sign-off
  ows.customer_signoff_at,
  ows.customer_name_signed,

  -- Session metadata
  ows.is_active,
  ows.created_at      AS session_started_at

FROM public.operator_workflow_sessions ows
JOIN public.profiles p   ON p.id  = ows.operator_id
JOIN public.job_orders jo ON jo.id = ows.job_order_id
LEFT JOIN public.timecards tc ON tc.id = ows.timecard_id
WHERE ows.is_active = true
ORDER BY ows.clocked_in_at ASC;

COMMENT ON VIEW public.active_operator_dashboard IS
  'Real-time view of all operators currently on active workflow sessions';
