-- Run this in your Supabase SQL editor (https://supabase.com/dashboard → SQL Editor)
-- Upgrades the single-project-per-user `projects` table to support multiple
-- projects per user. Existing rows (id = user id) are preserved and become
-- each user's first project.

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_id_fkey;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
UPDATE projects SET user_id = id WHERE user_id IS NULL;
ALTER TABLE projects ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'My Book';
ALTER TABLE projects ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);

DROP POLICY IF EXISTS "Users can view their own project" ON projects;
DROP POLICY IF EXISTS "Users can insert their own project" ON projects;
DROP POLICY IF EXISTS "Users can update their own project" ON projects;
DROP POLICY IF EXISTS "Users can delete their own project" ON projects;

CREATE POLICY "Users can view their own projects" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects" ON projects
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects" ON projects
  FOR DELETE USING (auth.uid() = user_id);
