-- Run this in your Supabase SQL editor (https://supabase.com/dashboard → SQL Editor)
-- Adds the content hash used to skip storing a snapshot that is byte-identical
-- to the project's most recent one. Without it, a tab left open banks a fresh
-- full copy of the manuscript every snapshot interval whether or not anything
-- was actually written.
--
-- Nullable on purpose: rows predating this column keep a NULL hash, which
-- simply never matches, so the worst case for an old row is one redundant
-- snapshot rather than a skipped or failed one.

ALTER TABLE project_revisions ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- The existing project_revisions_project_id_idx (project_id, created_at DESC)
-- already covers the "most recent revision for this project" lookup that the
-- dedup check performs, so no additional index is needed here.
