-- Run this in your Supabase SQL editor (https://supabase.com/dashboard → SQL Editor)
-- This creates the projects table that stores each user's project data.

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security so users can only access their own data
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Postgres has no `CREATE POLICY IF NOT EXISTS`, so drop first to keep this
-- file safely re-runnable (these are also superseded/dropped by migration
-- 002, but that shouldn't be a precondition for this file being idempotent).
DROP POLICY IF EXISTS "Users can view their own project" ON projects;
DROP POLICY IF EXISTS "Users can insert their own project" ON projects;
DROP POLICY IF EXISTS "Users can update their own project" ON projects;
DROP POLICY IF EXISTS "Users can delete their own project" ON projects;

CREATE POLICY "Users can view their own project" ON projects
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert their own project" ON projects
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own project" ON projects
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete their own project" ON projects
  FOR DELETE USING (auth.uid() = id);
