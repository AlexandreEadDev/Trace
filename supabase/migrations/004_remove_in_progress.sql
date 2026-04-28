-- ============================================================
-- Migration 004 — Remove 'in_progress' status
-- Run in Supabase SQL Editor
-- ============================================================

-- Migrate existing in_progress entries to completed
UPDATE user_libraries SET status = 'completed' WHERE status = 'in_progress';

-- Drop the old constraint and recreate with only backlog/completed
DO $$ DECLARE cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  INNER JOIN pg_class cls ON cls.oid = con.conrelid
  WHERE cls.relname = 'user_libraries' AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%in_progress%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_libraries DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE user_libraries
  ADD CONSTRAINT user_libraries_status_check
  CHECK (status IN ('backlog', 'completed'));
