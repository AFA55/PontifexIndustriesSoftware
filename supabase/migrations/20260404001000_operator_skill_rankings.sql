-- Operator Skill Rankings System
-- Predefined and custom skill categories per tenant, plus per-operator ratings

-- ── Skill Categories ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_skill_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  is_default boolean DEFAULT false,
  display_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Unique slug per tenant (NULL tenant_id = global defaults)
CREATE UNIQUE INDEX IF NOT EXISTS operator_skill_categories_slug_tenant_idx
  ON operator_skill_categories (slug, tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS operator_skill_categories_slug_default_idx
  ON operator_skill_categories (slug)
  WHERE tenant_id IS NULL;

-- ── Skill Ratings ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_skill_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  operator_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  category_id uuid REFERENCES operator_skill_categories(id) ON DELETE CASCADE,
  rating int CHECK (rating >= 1 AND rating <= 10),
  notes text,
  rated_by uuid REFERENCES profiles(id),
  rated_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(operator_id, category_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE operator_skill_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_skill_ratings ENABLE ROW LEVEL SECURITY;

-- Categories: read for all tenant members
CREATE POLICY "skill_categories_read" ON operator_skill_categories
  FOR SELECT USING (
    tenant_id IS NULL -- global defaults visible to all
    OR tenant_id::text = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  );

-- Categories: write for admin+
CREATE POLICY "skill_categories_write" ON operator_skill_categories
  FOR ALL USING (
    tenant_id::text = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
    AND (auth.jwt() -> 'user_metadata' ->> 'role') IN (
      'super_admin', 'admin', 'operations_manager'
    )
  );

-- Ratings: read for all tenant members
CREATE POLICY "skill_ratings_read" ON operator_skill_ratings
  FOR SELECT USING (
    tenant_id::text = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
  );

-- Ratings: write for admin+
CREATE POLICY "skill_ratings_write" ON operator_skill_ratings
  FOR ALL USING (
    tenant_id::text = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')
    AND (auth.jwt() -> 'user_metadata' ->> 'role') IN (
      'super_admin', 'admin', 'operations_manager'
    )
  );

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS operator_skill_ratings_operator_idx ON operator_skill_ratings (operator_id);
CREATE INDEX IF NOT EXISTS operator_skill_ratings_tenant_idx ON operator_skill_ratings (tenant_id);
CREATE INDEX IF NOT EXISTS operator_skill_categories_tenant_idx ON operator_skill_categories (tenant_id);

-- ── Default Categories (global, tenant_id = NULL) ─────────────────────────────
INSERT INTO operator_skill_categories (name, slug, is_default, display_order, tenant_id)
VALUES
  ('Core Drilling',          'core_drilling',   true, 1, NULL),
  ('Hand Sawing / Push Sawing', 'hand_sawing',  true, 2, NULL),
  ('Chain Sawing',           'chain_sawing',    true, 3, NULL),
  ('Wall Saw',               'wall_saw',        true, 4, NULL),
  ('Track Saw',              'track_saw',       true, 5, NULL),
  ('Demo',                   'demo',            true, 6, NULL),
  ('Slab Sawing',            'slab_sawing',     true, 7, NULL),
  ('Removal',                'removal',         true, 8, NULL),
  ('Nook Operation',         'nook_operation',  true, 9, NULL)
ON CONFLICT DO NOTHING;
