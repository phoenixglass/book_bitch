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
  const isSyncing = useRef(false);
  const cloudLoaded = useRef(false);

  async function loadForUser(u: User) {
    if (isSyncing.current) return;
    isSyncing.current = true;
    try {
      const cloudData = await loadProjectFromCloud(u.id);
      if (cloudData) {
        useAppStore.getState().importProjectFromCloud(cloudData);
      } else {
        // First ever login — upload existing local data
        await saveProjectToCloud(u.id, getSerializableState(useAppStore.getState()));
      }
      cloudLoaded.current = true;
    } finally {
      isSyncing.current = false;
    }
  }

  useEffect(() => {
    // Load data for any existing session on page load
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) loadForUser(u);
    });

    // Only react to actual sign-in / sign-out events, not token refreshes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        const u = session?.user ?? null;
        setUser(u);
        if (u && !cloudLoaded.current) loadForUser(u);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        cloudLoaded.current = false;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Debounced save on any store change
  useEffect(() => {
    if (!user) return;
    const unsub = useAppStore.subscribe((state) => {
      if (isSyncing.current || !cloudLoaded.current) return;
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
