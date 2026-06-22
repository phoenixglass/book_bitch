import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { saveProjectToCloud, loadProjectFromCloud } from '../lib/sync';
import { useAppStore } from '../store/appStore';
import type { User } from '@supabase/supabase-js';

interface SyncContextValue {
  user: User | null;
  syncStatus: 'idle' | 'saving' | 'saved' | 'error';
  cloudError: string | null;
  signOut: () => void;
  forceReloadFromCloud: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue>({
  user: null,
  syncStatus: 'idle',
  cloudError: null,
  signOut: () => {},
  forceReloadFromCloud: async () => {},
});

export function useSyncContext() {
  return useContext(SyncContext);
}

function waitForHydration(): Promise<void> {
  return new Promise((resolve) => {
    if (useAppStore.persist.hasHydrated()) {
      resolve();
    } else {
      const unsub = useAppStore.persist.onFinishHydration(() => {
        unsub();
        resolve();
      });
    }
  });
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [cloudError, setCloudError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);
  const cloudLoaded = useRef(false);

  async function loadForUser(u: User) {
    if (isSyncing.current || cloudLoaded.current) return;
    isSyncing.current = true;
    setSyncStatus('saving');
    try {
      await waitForHydration();
      const result = await loadProjectFromCloud(u.id);
      if (result.data) {
        useAppStore.getState().importProjectFromCloud(result.data);
      } else if (result.notFound) {
        // First ever login — upload existing local data
        await saveProjectToCloud(u.id, getSerializableState(useAppStore.getState()));
      }
      cloudLoaded.current = true;
      setCloudError(null);
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to load project from cloud:', msg);
      setCloudError(msg);
      setSyncStatus('error');
      // Keep local data intact — don't crash or overwrite
    } finally {
      isSyncing.current = false;
    }
  }

  const forceReloadFromCloud = useCallback(async () => {
    if (!user || isSyncing.current) return;
    cloudLoaded.current = false;
    await loadForUser(user);
  }, [user]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) loadForUser(u);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        const u = session?.user ?? null;
        setUser(u);
        if (u) loadForUser(u);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        cloudLoaded.current = false;
        setCloudError(null);
        setSyncStatus('idle');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Debounced auto-save on any store change
  useEffect(() => {
    if (!user) return;
    const unsub = useAppStore.subscribe((state) => {
      if (isSyncing.current || !cloudLoaded.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        isSyncing.current = true;
        setSyncStatus('saving');
        try {
          await saveProjectToCloud(user.id, getSerializableState(state));
          setCloudError(null);
          setSyncStatus('saved');
          setTimeout(() => setSyncStatus('idle'), 2000);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setCloudError(msg);
          setSyncStatus('error');
        } finally {
          isSyncing.current = false;
        }
      }, 2000);
    });
    return () => unsub();
  }, [user]);

  const signOut = () => supabase.auth.signOut();

  return (
    <SyncContext.Provider value={{ user, syncStatus, cloudError, signOut, forceReloadFromCloud }}>
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
