import { supabase } from './supabase';
import { withRetry } from './dbRetry';

const MAX_REVISIONS_PER_PROJECT = 50;

export interface RevisionMeta {
  id: string;
  name: string;
  wordCount: number;
  createdAt: string;
}

export async function snapshotProjectRevision(
  userId: string,
  projectId: string,
  name: string,
  wordCount: number,
  data: Record<string, unknown>,
) {
  const { error } = await withRetry(() => supabase.from('project_revisions').insert({
    project_id: projectId,
    user_id: userId,
    name,
    word_count: wordCount,
    data,
  }));
  if (error) {
    console.error('Failed to snapshot project revision:', error.message);
    throw new Error(error.message);
  }
  await pruneOldRevisions(projectId);
}

async function pruneOldRevisions(projectId: string) {
  const { data, error } = await withRetry(() => supabase
    .from('project_revisions')
    .select('id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .range(MAX_REVISIONS_PER_PROJECT, MAX_REVISIONS_PER_PROJECT + 200));
  if (error || !data || data.length === 0) return;
  const staleIds = data.map((row) => row.id as string);
  await withRetry(() => supabase.from('project_revisions').delete().in('id', staleIds));
}

export async function listProjectRevisions(projectId: string): Promise<RevisionMeta[]> {
  const { data, error } = await withRetry(() => supabase
    .from('project_revisions')
    .select('id, name, word_count, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(MAX_REVISIONS_PER_PROJECT));
  if (error) {
    console.error('Failed to list project revisions:', error.message);
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    wordCount: (row.word_count as number) ?? 0,
    createdAt: row.created_at as string,
  }));
}

export async function getProjectRevisionData(revisionId: string): Promise<Record<string, unknown>> {
  const { data, error } = await withRetry(() => supabase
    .from('project_revisions')
    .select('data')
    .eq('id', revisionId)
    .single());
  if (error) {
    console.error('Failed to load project revision:', error.message);
    throw new Error(error.message);
  }
  return (data?.data as Record<string, unknown>) ?? {};
}
