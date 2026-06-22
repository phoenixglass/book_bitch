import { supabase } from './supabase';

export async function saveProjectToCloud(userId: string, data: object) {
  const { error } = await supabase
    .from('projects')
    .upsert({ id: userId, data, updated_at: new Date().toISOString() });
  if (error) console.error('Cloud save failed:', error.message);
}

export async function loadProjectFromCloud(userId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('data')
    .eq('id', userId)
    .single();
  if (error && error.code !== 'PGRST116') {
    console.error('Cloud load failed:', error.message);
    return null;
  }
  return data?.data ?? null;
}
