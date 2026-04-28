-- ============================================================
-- Migration 005 — Add duration_minutes to items
-- For games: avg playtime in hours × 60 (from RAWG)
-- For movies: runtime in minutes (from TMDB)
-- ============================================================

ALTER TABLE items ADD COLUMN IF NOT EXISTS duration_minutes INT;
