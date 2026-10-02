-- ============================================================
-- Migration 013 — Add updated_at to user_libraries
-- Enables sorting the dashboard by "date de modification"
-- (i.e. when an entry moved from backlog → completed).
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Add the column, defaulting to created_at for existing rows.
ALTER TABLE user_libraries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Backfill existing rows so updated_at is never null.
UPDATE user_libraries
  SET updated_at = created_at
  WHERE updated_at IS NULL;

-- 2. Keep updated_at in sync on every UPDATE.
CREATE OR REPLACE FUNCTION set_user_libraries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_libraries_updated_at ON user_libraries;
CREATE TRIGGER trg_user_libraries_updated_at
  BEFORE UPDATE ON user_libraries
  FOR EACH ROW
  EXECUTE FUNCTION set_user_libraries_updated_at();

-- 3. Index to speed up per-user sorting by modification date.
CREATE INDEX IF NOT EXISTS idx_user_libraries_user_updated_at
  ON user_libraries (user_id, updated_at DESC);
