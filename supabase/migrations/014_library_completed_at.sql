-- ============================================================
-- Migration 014 — Add completed_at to user_libraries
-- Persists the exact timestamp of the backlog → completed
-- transition so the dashboard can sort by "date de visionnage".
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Add the column.
ALTER TABLE user_libraries
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill: existing completed rows fall back to their last update
-- (or creation date when updated_at is missing).
UPDATE user_libraries
  SET completed_at = COALESCE(updated_at, created_at)
  WHERE status = 'completed' AND completed_at IS NULL;

-- 2. Keep completed_at in sync with the status transition.
--    - backlog → completed : stamp now()
--    - completed → backlog : clear the stamp
--    - completed → completed : preserve the original stamp
CREATE OR REPLACE FUNCTION set_user_libraries_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed' THEN
      NEW.completed_at = now();
    END IF;
  ELSE
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_libraries_completed_at ON user_libraries;
CREATE TRIGGER trg_user_libraries_completed_at
  BEFORE INSERT OR UPDATE ON user_libraries
  FOR EACH ROW
  EXECUTE FUNCTION set_user_libraries_completed_at();

-- 3. Index to speed up per-user sorting by completion date.
CREATE INDEX IF NOT EXISTS idx_user_libraries_user_completed_at
  ON user_libraries (user_id, completed_at DESC);
