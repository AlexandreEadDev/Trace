-- ============================================================
-- Discover: pg_trgm + FTS on items, global popularity RPCs,
-- compatibility views (titles, collections, user_actions).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Allow manga on items.type.
-- Note: Postgres often stores IN (...) as = ANY (ARRAY[...]), so do not rely on
-- pg_get_constraintdef LIKE '%type IN%' to find the constraint — use the real name from migration 003.
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_type_check;

ALTER TABLE public.items
  ADD CONSTRAINT items_type_check
  CHECK (type IN ('book', 'game', 'movie', 'manga'));

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(genre, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS items_fts_gin ON items USING GIN (fts);
CREATE INDEX IF NOT EXISTS items_title_trgm_idx ON items USING GIN (title gin_trgm_ops);

DROP FUNCTION IF EXISTS public.search_items_fts(text, integer);

CREATE OR REPLACE FUNCTION public.search_items_fts(search_query text, max_results integer DEFAULT 24)
RETURNS TABLE (
  id uuid,
  title text,
  type text,
  genre text,
  cover_url text,
  release_year integer,
  external_source text,
  external_id text,
  community_avg double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT btrim(coalesce(search_query, '')) AS t
  ),
  ts AS (
    SELECT
      CASE
        WHEN (SELECT t FROM q) = '' THEN NULL::tsquery
        ELSE coalesce(
          nullif(websearch_to_tsquery('simple', (SELECT t FROM q)), ''::tsquery),
          plainto_tsquery('simple', (SELECT t FROM q))
        )
      END AS qts
  ),
  agg AS (
    SELECT
      i.id AS rid,
      i.title AS rtitle,
      i.type AS rtype,
      i.genre AS rgenre,
      i.cover_url AS rcover,
      i.release_year AS ryear,
      i.external_source AS rsrc,
      i.external_id AS rxid,
      i.fts AS rfts,
      coalesce(avg(r.rating), 0)::double precision AS rcavg
    FROM items i
    CROSS JOIN q
    CROSS JOIN ts
    LEFT JOIN reviews r ON r.item_id = i.id
    WHERE (SELECT t FROM q) <> ''
      AND (
        ((SELECT qts FROM ts) IS NOT NULL AND i.fts @@ (SELECT qts FROM ts))
        OR strpos(lower(i.title), lower((SELECT t FROM q))) > 0
        OR (
          length((SELECT t FROM q)) >= 3
          AND similarity(i.title, (SELECT t FROM q)) > 0.12
        )
      )
    GROUP BY
      i.id,
      i.title,
      i.type,
      i.genre,
      i.cover_url,
      i.release_year,
      i.external_source,
      i.external_id,
      i.fts
  )
  SELECT
    agg.rid AS id,
    agg.rtitle AS title,
    agg.rtype AS type,
    agg.rgenre AS genre,
    agg.rcover AS cover_url,
    agg.ryear AS release_year,
    agg.rsrc AS external_source,
    agg.rxid AS external_id,
    agg.rcavg AS community_avg
  FROM agg
  CROSS JOIN ts
  ORDER BY
    CASE
      WHEN (SELECT qts FROM ts) IS NOT NULL AND agg.rfts @@ (SELECT qts FROM ts)
      THEN ts_rank_cd(agg.rfts, (SELECT qts FROM ts))
      ELSE 0::double precision
    END DESC,
    CASE
      WHEN length((SELECT t FROM q)) >= 3
      THEN similarity(agg.rtitle, (SELECT t FROM q))
      ELSE 0::double precision
    END DESC,
    agg.rcavg DESC,
    agg.rtitle ASC
  LIMIT least(coalesce(nullif(max_results, 0), 24), 100);
$$;

COMMENT ON FUNCTION public.search_items_fts(text, integer) IS
  'Hybrid FTS (simple) + ILIKE + pg_trgm similarity on items; SECURITY DEFINER for stable search_path.';

GRANT EXECUTE ON FUNCTION public.search_items_fts(text, integer) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.popular_titles_global(integer);

CREATE OR REPLACE FUNCTION public.popular_titles_global(limit_n integer DEFAULT 24)
RETURNS TABLE (
  id uuid,
  title text,
  type text,
  genre text,
  cover_url text,
  release_year integer,
  external_source text,
  external_id text,
  community_avg double precision,
  engagement_score double precision,
  sparkline jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH agg AS (
    SELECT
      i.id AS iid,
      i.title AS ititle,
      i.type AS itype,
      i.genre AS igenre,
      i.cover_url AS icover,
      i.release_year AS iyear,
      i.external_source AS isrc,
      i.external_id AS ixid,
      coalesce(rv.avg_rating, 0)::double precision AS cavg,
      (coalesce(rv.cnt, 0)::double precision * 2.0 + coalesce(lib.cnt, 0)::double precision * 1.2) AS raw_eng
    FROM items i
    LEFT JOIN LATERAL (
      SELECT avg(rating)::float AS avg_rating, count(*)::int AS cnt
      FROM reviews
      WHERE item_id = i.id
    ) rv ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cnt
      FROM user_libraries
      WHERE item_id = i.id
    ) lib ON true
  ),
  scored AS (
    SELECT
      agg.*,
      (agg.raw_eng + 1.0) * (1.0 + agg.cavg / 5.0) AS escore
    FROM agg
  ),
  top_ids AS (
    SELECT scored.*
    FROM scored
    ORDER BY scored.escore DESC NULLS LAST, scored.cavg DESC NULLS LAST, scored.ititle ASC
    LIMIT greatest(least(coalesce(nullif(limit_n, 0), 24), 100), 1)
  )
  SELECT
    t.iid AS id,
    t.ititle AS title,
    t.itype AS type,
    t.igenre AS genre,
    t.icover AS cover_url,
    t.iyear AS release_year,
    t.isrc AS external_source,
    t.ixid AS external_id,
    t.cavg AS community_avg,
    t.escore AS engagement_score,
    coalesce(sl.arr, '[]'::jsonb) AS sparkline
  FROM top_ids t
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(round(x.m::numeric, 2) ORDER BY x.wk) AS arr
    FROM (
      SELECT date_trunc('week', r.created_at) AS wk, avg(r.rating)::float AS m
      FROM reviews r
      WHERE r.item_id = t.iid
        AND r.created_at > now() - interval '84 days'
      GROUP BY 1
      ORDER BY 1 ASC
      LIMIT 10
    ) x
  ) sl ON true;
$$;

COMMENT ON FUNCTION public.popular_titles_global(integer) IS
  'Popularity from reviews + user_libraries counts; weekly rating sparkline.';

GRANT EXECUTE ON FUNCTION public.popular_titles_global(integer) TO anon, authenticated;

CREATE OR REPLACE VIEW public.titles AS
SELECT * FROM public.items;

COMMENT ON VIEW public.titles IS 'Spec alias: cached external titles (items).';

CREATE OR REPLACE VIEW public.collections AS
SELECT
  id,
  user_id,
  item_id,
  status,
  private_notes,
  created_at
FROM public.user_libraries;

COMMENT ON VIEW public.collections IS 'Spec alias: user_libraries (collections).';

CREATE OR REPLACE VIEW public.user_actions AS
SELECT
  id,
  user_id,
  item_id,
  rating,
  public_comment,
  created_at,
  'rating'::text AS action_kind
FROM public.reviews;

COMMENT ON VIEW public.user_actions IS 'Spec alias: ratings as user_actions.';
