-- Artifex persistent memory: conversation history + durable memory notes.
-- Lets Artifex "remember" past chats across sessions and recall durable
-- facts (the "2nd brain" feature) instead of starting stateless every time.

CREATE TABLE IF NOT EXISTS artifex_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifex_conversations_user
  ON artifex_conversations(tenant_id, user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS artifex_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES artifex_conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  parts jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifex_messages_conversation
  ON artifex_messages(conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS artifex_memory_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  note text NOT NULL,
  category text,
  source_conversation_id uuid REFERENCES artifex_conversations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artifex_memory_notes_tenant
  ON artifex_memory_notes(tenant_id, created_at DESC);

ALTER TABLE artifex_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifex_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifex_memory_notes ENABLE ROW LEVEL SECURITY;

-- Conversations: a user sees only their own; staff roles required (matches
-- the command-center gate in app/api/command-center/assistant/route.ts).
DO $$ BEGIN
  CREATE POLICY "artifex_conversations_own_rw" ON artifex_conversations
    FOR ALL
    USING (
      tenant_id = public.current_user_tenant_id()
      AND user_id = auth.uid()
      AND public.current_user_has_role('admin', 'super_admin', 'salesman', 'operations_manager', 'supervisor', 'shop_manager', 'shop_help', 'inventory_manager')
    )
    WITH CHECK (
      tenant_id = public.current_user_tenant_id()
      AND user_id = auth.uid()
      AND public.current_user_has_role('admin', 'super_admin', 'salesman', 'operations_manager', 'supervisor', 'shop_manager', 'shop_help', 'inventory_manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Messages: scoped through the parent conversation's ownership.
DO $$ BEGIN
  CREATE POLICY "artifex_messages_own_rw" ON artifex_messages
    FOR ALL
    USING (
      tenant_id = public.current_user_tenant_id()
      AND EXISTS (
        SELECT 1 FROM artifex_conversations c
        WHERE c.id = artifex_messages.conversation_id AND c.user_id = auth.uid()
      )
    )
    WITH CHECK (
      tenant_id = public.current_user_tenant_id()
      AND EXISTS (
        SELECT 1 FROM artifex_conversations c
        WHERE c.id = artifex_messages.conversation_id AND c.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Memory notes are shared knowledge across the whole tenant (any staff
-- member's conversation can contribute a note, any staff member can recall
-- it) — this is what makes it a company "2nd brain" rather than per-user.
DO $$ BEGIN
  CREATE POLICY "artifex_memory_notes_tenant_rw" ON artifex_memory_notes
    FOR ALL
    USING (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_has_role('admin', 'super_admin', 'salesman', 'operations_manager', 'supervisor', 'shop_manager', 'shop_help', 'inventory_manager')
    )
    WITH CHECK (
      tenant_id = public.current_user_tenant_id()
      AND public.current_user_has_role('admin', 'super_admin', 'salesman', 'operations_manager', 'supervisor', 'shop_manager', 'shop_help', 'inventory_manager')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
