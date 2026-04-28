-- ============================================================
-- LogBook — Add 'movie' to items.type
-- Run this in your Supabase SQL Editor
-- ============================================================

DO $$
DECLARE
  cname text;
BEGIN
  -- Find and drop the existing type CHECK constraint on items
  SELECT con.conname INTO cname
  FROM pg_constraint con
  INNER JOIN pg_class cls ON cls.oid = con.conrelid
  WHERE cls.relname = 'items'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%book%game%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE items DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE items
  ADD CONSTRAINT items_type_check
  CHECK (type IN ('book', 'game', 'movie'));
