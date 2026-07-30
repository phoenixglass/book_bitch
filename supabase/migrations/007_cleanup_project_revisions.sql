-- Run this in your Supabase SQL editor (https://supabase.com/dashboard → SQL Editor)
-- Moves revision retention out of the client and into one SQL function.
--
-- Both rules previously lived in TypeScript: pruneOldRevisions capped live
-- projects, collapseRevisionsToLatest handled projects that had been deleted.
-- That put the retention count in two places that could silently disagree, and
-- each was a select followed by a delete, so a snapshot arriving in between
-- could change the row set out from under it. This applies both rules in a
-- single statement, and is the only definition of them.
--
-- SECURITY INVOKER (the default, stated here because it matters): the function
-- runs with the caller's privileges, so the row-level security policies on
-- project_revisions and projects scope it to the caller's own rows. Making this
-- SECURITY DEFINER would let any authenticated caller prune every user's
-- revisions.

DROP FUNCTION IF EXISTS public.cleanup_project_revisions(integer);

CREATE FUNCTION public.cleanup_project_revisions(max_revisions_per_project integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH ranked AS (
    SELECT
      r.id,
      ROW_NUMBER() OVER (PARTITION BY r.project_id ORDER BY r.created_at DESC) AS recency,
      EXISTS (SELECT 1 FROM projects p WHERE p.id = r.project_id) AS project_exists
    FROM project_revisions r
  )
  DELETE FROM project_revisions
  WHERE id IN (
    SELECT id FROM ranked
    WHERE
      -- Live project: keep the most recent N.
      (project_exists AND recency > max_revisions_per_project)
      -- Deleted project: keep only the newest. Migration 003 keeps revisions
      -- alive past their project so it can still be recovered, and recovery
      -- reads that last revision; the ones behind it are unreachable.
      OR (NOT project_exists AND recency > 1)
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_project_revisions(integer) TO authenticated;
