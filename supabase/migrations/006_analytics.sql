-- ============================================================
-- Migration 006 — Analytics: item click tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS item_clicks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE item_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert clicks" ON item_clicks;
CREATE POLICY "Anyone can insert clicks"
  ON item_clicks FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read clicks" ON item_clicks;
CREATE POLICY "Anyone can read clicks"
  ON item_clicks FOR SELECT
  USING (true);
