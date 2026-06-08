-- Per-volume user ratings (1–5 stars, half steps) for manga
ALTER TABLE manga_volume_progress
  ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1)
  CHECK (
    rating IS NULL
    OR (rating >= 0.5 AND rating <= 5 AND mod((rating * 2)::numeric, 1) = 0)
  );
