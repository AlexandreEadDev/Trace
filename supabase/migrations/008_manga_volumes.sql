-- Manga per-volume read tracking
CREATE TABLE IF NOT EXISTS manga_volume_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  manga_item_id   UUID REFERENCES items(id) ON DELETE CASCADE NOT NULL,
  volume_number   INT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'backlog'
                  CHECK (status IN ('backlog', 'completed')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, manga_item_id, volume_number)
);

ALTER TABLE manga_volume_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own volume progress" ON manga_volume_progress;
CREATE POLICY "Users can read their own volume progress"
  ON manga_volume_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own volume progress" ON manga_volume_progress;
CREATE POLICY "Users can insert their own volume progress"
  ON manga_volume_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own volume progress" ON manga_volume_progress;
CREATE POLICY "Users can update their own volume progress"
  ON manga_volume_progress FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own volume progress" ON manga_volume_progress;
CREATE POLICY "Users can delete their own volume progress"
  ON manga_volume_progress FOR DELETE
  USING (auth.uid() = user_id);
