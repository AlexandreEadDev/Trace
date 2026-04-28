-- ============================================================
-- LogBook — Catalog RLS update
-- Allow authenticated users to lazily insert catalog items
-- (items are created on first visit to an item detail page).
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can insert items" ON items;

CREATE POLICY "Authenticated users can insert items"
  ON items FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
