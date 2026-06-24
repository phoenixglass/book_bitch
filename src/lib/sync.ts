import { supabase } from './supabase';

export async function saveProjectToCloud(userId: string, data: Record<string, unknown>) {
  const { error } = await supabase
    .from('projects')
    .upsert({ id: userId, data, updated_at: new Date().toISOString() });
  if (error) console.error('Cloud save failed:', error.message);
}

export async function loadProjectFromCloud(userId: string): Promise<{ data: Record<string, unknown> | null; updatedAt: string | null; notFound: boolean }> {
  const { data, error } = await supabase
    .from('projects')
    .select('data, updated_at')
    .eq('id', userId)
    .single();
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
