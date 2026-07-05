-- Run this in your Supabase SQL editor (https://supabase.com/dashboard → SQL Editor)
-- Adds versioned snapshots of each project so a bad autosave, a bug, or an
-- accidental delete can be recovered from. Snapshots are taken periodically
-- during editing and immediately before a project is deleted.
--
-- Deliberately NOT a foreign key to projects(id) with cascade delete: a
-- snapshot must survive the deletion of the project it was taken from, so a
-- deleted project can still be recovered from its last revision.

CREATE TABLE IF NOT EXISTS project_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_revisions_project_id_idx
  ON project_revisions(project_id, created_at DESC);

ALTER TABLE project_revisions ENABLE ROW LEVEL SECURITY;

-- Postgres has no `CREATE POLICY IF NOT EXISTS`, so drop first to keep this
-- file safely re-runnable against a database that already has it applied.
DROP POLICY IF EXISTS "Users can view their own revisions" ON project_revisions;
DROP POLICY IF EXISTS "Users can insert their own revisions" ON project_revisions;
DROP POLICY IF EXISTS "Users can delete their own revisions" ON project_revisions;

CREATE POLICY "Users can view their own revisions" ON project_revisions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own revisions" ON project_revisions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own revisions" ON project_revisions
  FOR DELETE USING (auth.uid() = user_id);
