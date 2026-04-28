-- ============================================================
-- LogBook — Initial Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ITEMS table (public catalog of books and games)
CREATE TABLE IF NOT EXISTS items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('book', 'game')),
  genre        TEXT,
  cover_url    TEXT,
  release_year INT,
  external_source TEXT,
  external_id     TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS external_source TEXT;

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS external_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'items_external_source_external_id_key'
  ) THEN
    ALTER TABLE items
      ADD CONSTRAINT items_external_source_external_id_key
      UNIQUE (external_source, external_id);
  END IF;
END $$;

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read items" ON items;
CREATE POLICY "Anyone can read items"
  ON items FOR SELECT
  USING (true);

-- Only service role can insert/update items (managed via dashboard)
DROP POLICY IF EXISTS "Service role can manage items" ON items;
CREATE POLICY "Service role can manage items"
  ON items FOR ALL
  USING (auth.role() = 'service_role');


-- REVIEWS table (public ratings and comments)
CREATE TABLE IF NOT EXISTS reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  item_id        UUID REFERENCES items(id) ON DELETE CASCADE NOT NULL,
  rating         INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  public_comment TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, item_id)
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read reviews" ON reviews;
CREATE POLICY "Anyone can read reviews"
  ON reviews FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert their own reviews" ON reviews;
CREATE POLICY "Authenticated users can insert their own reviews"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own reviews" ON reviews;
CREATE POLICY "Users can update their own reviews"
  ON reviews FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own reviews" ON reviews;
CREATE POLICY "Users can delete their own reviews"
  ON reviews FOR DELETE
  USING (auth.uid() = user_id);


-- USER_LIBRARIES table (private personal tracking)
CREATE TABLE IF NOT EXISTS user_libraries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  item_id       UUID REFERENCES items(id) ON DELETE CASCADE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'in_progress', 'completed')),
  private_notes TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, item_id)
);

ALTER TABLE user_libraries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own library" ON user_libraries;
CREATE POLICY "Users can read their own library"
  ON user_libraries FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert into their own library" ON user_libraries;
CREATE POLICY "Users can insert into their own library"
  ON user_libraries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own library entries" ON user_libraries;
CREATE POLICY "Users can update their own library entries"
  ON user_libraries FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own library entries" ON user_libraries;
CREATE POLICY "Users can delete their own library entries"
  ON user_libraries FOR DELETE
  USING (auth.uid() = user_id);
