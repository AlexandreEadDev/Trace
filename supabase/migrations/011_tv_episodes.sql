-- TV series per-episode tracking (status + optional rating)
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_type_check;
ALTER TABLE public.items
  ADD CONSTRAINT items_type_check
  CHECK (type IN ('book', 'game', 'movie', 'manga', 'tv'));

CREATE TABLE IF NOT EXISTS tv_episode_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  show_item_id    UUID REFERENCES items(id) ON DELETE CASCADE NOT NULL,
  season_number   INT NOT NULL,
  episode_number  INT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'backlog'
                  CHECK (status IN ('backlog', 'completed')),
  rating          NUMERIC(2,1)
                  CHECK (
                    rating IS NULL
                    OR (rating >= 0.5 AND rating <= 5 AND mod((rating * 2)::numeric, 1) = 0)
                  ),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, show_item_id, season_number, episode_number)
);

ALTER TABLE tv_episode_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own episode progress" ON tv_episode_progress;
CREATE POLICY "Users can read their own episode progress"
  ON tv_episode_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own episode progress" ON tv_episode_progress;
CREATE POLICY "Users can insert their own episode progress"
  ON tv_episode_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own episode progress" ON tv_episode_progress;
CREATE POLICY "Users can update their own episode progress"
  ON tv_episode_progress FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own episode progress" ON tv_episode_progress;
CREATE POLICY "Users can delete their own episode progress"
  ON tv_episode_progress FOR DELETE
  USING (auth.uid() = user_id);
