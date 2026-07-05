import { supabase } from './supabase';
import { withRetry } from './dbRetry';

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
}

export async function listProjects(userId: string): Promise<ProjectMeta[]> {
  const { data, error } = await withRetry(() => supabase
    .from('projects')
    .select('id, name, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false }));
  if (error) {
    console.error('Failed to list projects:', error.message);
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? 'Untitled Project',
    updatedAt: row.updated_at as string,
  }));
}

export async function createProject(userId: string, name: string, data: Record<string, unknown>): Promise<ProjectMeta> {
  const { data: row, error } = await withRetry(() => supabase
    .from('projects')
    .insert({ user_id: userId, name, data, updated_at: new Date().toISOString() })
    .select('id, name, updated_at')
    .single());
  if (error) {
    console.error('Failed to create project:', error.message);
    throw new Error(error.message);
  }
  return { id: row.id as string, name: row.name as string, updatedAt: row.updated_at as string };
}

export async function saveProjectToCloud(projectId: string, data: Record<string, unknown>, name?: string) {
  const patch: Record<string, unknown> = { data, updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = name;
  const { error } = await withRetry(() => supabase.from('projects').update(patch).eq('id', projectId));
  if (error) {
    console.error('Cloud save failed:', error.message);
    throw new Error(error.message);
  }
}

export async function loadProjectFromCloud(projectId: string): Promise<{ data: Record<string, unknown> | null; updatedAt: string | null; notFound: boolean }> {
  const { data, error } = await withRetry(() => supabase
    .from('projects')
    .select('data, updated_at')
    .eq('id', projectId)
    .single());
  if (error) {
    if (error.code === 'PGRST116') {
      return { data: null, updatedAt: null, notFound: true };
    }
    console.error('Cloud load failed:', error.message);
    throw new Error(error.message);
  }
  return {
    data: (data?.data as Record<string, unknown> | null) ?? null,
    updatedAt: (data?.updated_at as string | null) ?? null,
    notFound: false,
  };
}

export async function deleteProjectFromCloud(projectId: string) {
  const { error } = await withRetry(() => supabase.from('projects').delete().eq('id', projectId));
  if (error) {
    console.error('Failed to delete project:', error.message);
    throw new Error(error.message);
  }
}
