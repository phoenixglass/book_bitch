import { useEffect, useRef, useState, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { saveProjectToCloud, loadProjectFromCloud } from '../lib/sync';
import { useAppStore } from '../store/appStore';
import type { User } from '@supabase/supabase-js';

interface SyncContextValue {
  user: User | null;
  syncStatus: 'idle' | 'saving' | 'saved' | 'error';
  signOut: () => void;
}

const SyncContext = createContext<SyncContextValue>({
  user: null,
  syncStatus: 'idle',
  signOut: () => {},
});

export function useSyncContext() {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingFromCloud = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        isLoadingFromCloud.current = true;
        const cloudData = await loadProjectFromCloud(currentUser.id);
        if (cloudData) {
          useAppStore.getState().importProjectFromCloud(cloudData);
        } else {
          // First login: no cloud data yet — push existing local state up
          const state = useAppStore.getState();
          await saveProjectToCloud(currentUser.id, getSerializableState(state));
        }
        isLoadingFromCloud.current = false;
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Debounced save: whenever store changes and user is logged in, save after 2s of inactivity
  useEffect(() => {
    if (!user) return;
    const unsub = useAppStore.subscribe((state) => {
      if (isLoadingFromCloud.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSyncStatus('saving');
        try {
          await saveProjectToCloud(user.id, getSerializableState(state));
          setSyncStatus('saved');
          setTimeout(() => setSyncStatus('idle'), 2000);
        } catch {
          setSyncStatus('error');
        }
      }, 2000);
    });
    return () => unsub();
  }, [user]);

  const signOut = () => supabase.auth.signOut();

  return (
    <SyncContext.Provider value={{ user, syncStatus, signOut }}>
      {children}
    </SyncContext.Provider>
  );
}

function getSerializableState(state: ReturnType<typeof useAppStore.getState>) {
  return {
    projectTitle: state.projectTitle,
    projectTarget: state.projectTarget,
    binder: state.binder,
    fragments: state.fragments,
    omittedMaterial: state.omittedMaterial,
    notebookEntries: state.notebookEntries,
    codexEntries: state.codexEntries,
    questions: state.questions,
    moodboardItems: state.moodboardItems,
    projectTags: state.projectTags,
    links: state.links,
    history: state.history,
    savedFilters: state.savedFilters,
    editorSettings: state.editorSettings,
    manuscriptSettings: state.manuscriptSettings,
  };
}
