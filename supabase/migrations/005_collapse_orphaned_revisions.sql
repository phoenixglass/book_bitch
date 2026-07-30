-- Run this in your Supabase SQL editor (https://supabase.com/dashboard → SQL Editor)
--
-- One-time cleanup for revisions belonging to projects that have already been
-- deleted. Going forward the app collapses these at deletion time, but rows
-- that leaked before that shipped are still here, and nothing will ever prune
-- them: pruneOldRevisions only runs when a new snapshot is inserted for the
-- same project, which can never happen again once the project is gone.
--
-- This keeps the NEWEST revision for each deleted project — the one migration
-- 003 describes as the recovery path — and removes the superseded copies
-- behind it. It is not a plain "delete all orphans": recovering a deleted
-- project still works afterward.
--
-- DESTRUCTIVE. Run the preview first and read the counts before the DELETE.
-- Run in the SQL editor this executes as an admin and bypasses row-level
-- security, so it cleans up every user's orphaned rows, not just your own.

-- ── 1. Preview (read-only) ────────────────────────────────────────────────────
-- How many rows would go, and roughly how much space they occupy.
WITH orphans AS (
  SELECT
    r.id,
    r.data,
    ROW_NUMBER() OVER (PARTITION BY r.project_id ORDER BY r.created_at DESC) AS recency
  FROM project_revisions r
  WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = r.project_id)
)
SELECT
  count(*) FILTER (WHERE recency > 1)  AS rows_to_delete,
  count(*) FILTER (WHERE recency = 1)  AS rows_kept_for_recovery,
  pg_size_pretty(COALESCE(sum(pg_column_size(data)) FILTER (WHERE recency > 1), 0)) AS space_reclaimed
FROM orphans;

-- ── 2. The cleanup ────────────────────────────────────────────────────────────
-- Uncomment and run once the preview above looks right.
--
-- WITH orphans AS (
--   SELECT
--     r.id,
--     ROW_NUMBER() OVER (PARTITION BY r.project_id ORDER BY r.created_at DESC) AS recency
--   FROM project_revisions r
--   WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = r.project_id)
-- )
-- DELETE FROM project_revisions
-- WHERE id IN (SELECT id FROM orphans WHERE recency > 1);

-- ── 3. Return the space to the operating system ──────────────────────────────
-- A DELETE alone only marks rows dead; the file keeps its size and Postgres
-- reuses the space internally. VACUUM FULL rewrites the table for real, but
-- needs roughly the table's size again in free space while it runs — on a disk
-- that is already full it can fail. If it does, a plain VACUUM still frees the
-- space for reuse inside Postgres, which is usually enough to get writes going
-- again.
--
-- VACUUM FULL project_revisions;
