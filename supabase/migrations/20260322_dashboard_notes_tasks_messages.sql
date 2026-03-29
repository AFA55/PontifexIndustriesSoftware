-- Dashboard Notes (personal/shared sticky notes)
CREATE TABLE IF NOT EXISTS public.dashboard_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  color TEXT DEFAULT 'yellow' CHECK (color IN ('yellow', 'blue', 'green', 'pink', 'purple')),
  pinned BOOLEAN DEFAULT false,
  shared BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dashboard_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notes" ON public.dashboard_notes FOR ALL USING (
  user_id = auth.uid() OR (shared = true AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin', 'operations_manager')
  ))
);
CREATE INDEX idx_dashboard_notes_user ON dashboard_notes(user_id, pinned DESC, position);

-- Dashboard Tasks (personal todo items)
CREATE TABLE IF NOT EXISTS public.dashboard_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date DATE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dashboard_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tasks" ON public.dashboard_tasks FOR ALL USING (user_id = auth.uid());
CREATE INDEX idx_dashboard_tasks_user ON dashboard_tasks(user_id, completed, position);

-- Team Messages (internal chat feed)
CREATE TABLE IF NOT EXISTS public.team_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_role TEXT,
  content TEXT NOT NULL,
  channel TEXT DEFAULT 'general' CHECK (channel IN ('general', 'ops', 'sales', 'urgent')),
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users read messages" ON public.team_messages FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users create messages" ON public.team_messages FOR INSERT WITH CHECK (author_id = auth.uid());
CREATE POLICY "Authors delete own" ON public.team_messages FOR DELETE USING (author_id = auth.uid());
CREATE INDEX idx_team_messages_channel ON team_messages(channel, created_at DESC);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_dashboard_notes_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trigger_dashboard_notes_updated_at BEFORE UPDATE ON dashboard_notes FOR EACH ROW EXECUTE FUNCTION update_dashboard_notes_updated_at();

CREATE OR REPLACE FUNCTION update_dashboard_tasks_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trigger_dashboard_tasks_updated_at BEFORE UPDATE ON dashboard_tasks FOR EACH ROW EXECUTE FUNCTION update_dashboard_tasks_updated_at();
