import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  listProjects, createProject, saveProjectToCloud, loadProjectFromCloud, deleteProjectFromCloud,
} from '../lib/sync';
import { snapshotProjectRevision, getProjectRevisionData } from '../lib/revisions';
import { useAppStore, totalWordCount } from '../store/appStore';
import { SyncContext } from '../hooks/useSyncContext';
import type { User } from '@supabase/supabase-js';
import type { ProjectMeta } from '../lib/sync';

// How often we take an automatic version snapshot while a project is being
// actively edited. Snapshots are also pruned server-side to the most recent
// 50 per project, so this only controls density, not unbounded growth.
const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;

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
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const projectsRef = useRef<ProjectMeta[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncing = useRef(false);
  const cloudLoaded = useRef(false);
  const lastSnapshotAt = useRef<Record<string, number>>({});

  const projectWordCount = () => {
    const state = useAppStore.getState();
    return totalWordCount(state.binder.filter((b) => b.id !== 'research' && b.id !== 'trash'));
  };

  // Best-effort periodic snapshot; never throws into the caller since it must
  // not block or fail the regular autosave path.
  const maybeSnapshot = useCallback(async (u: User, projectId: string, name: string, force = false) => {
    const last = lastSnapshotAt.current[projectId] ?? 0;
    if (!force && Date.now() - last < SNAPSHOT_INTERVAL_MS) return;
    try {
      await snapshotProjectRevision(u.id, projectId, name, projectWordCount(), getSerializableState(useAppStore.getState()));
      lastSnapshotAt.current[projectId] = Date.now();
    } catch (err) {
      console.error('Version snapshot failed:', err);
    }
  }, []);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  // Loads/reconciles the active project for a freshly signed-in user. On a
  // brand new account this promotes whatever's in local storage to be the
  // user's first cloud project.
  async function loadForUser(u: User) {
    if (isSyncing.current || cloudLoaded.current) return;
    isSyncing.current = true;
    setSyncStatus('saving');
    try {
      await waitForHydration();
      let list = await listProjects(u.id);
      const state = useAppStore.getState();
      if (list.length === 0) {
        const created = await createProject(u.id, state.projectTitle || 'My Book', getSerializableState(state));
        list = [created];
        useAppStore.setState({ activeProjectId: created.id, localLastModified: created.updatedAt });
      } else {
        const targetId = state.activeProjectId && list.some((p) => p.id === state.activeProjectId)
          ? state.activeProjectId
          : list[0].id;
        const result = await loadProjectFromCloud(targetId);
        if (result.data) {
          const sameProjectLocally = state.activeProjectId === targetId;
          const localTs = sameProjectLocally ? state.localLastModified : null;
          const cloudTs = result.updatedAt;
          // Use cloud data unless local is strictly newer
          const localIsNewer = localTs && cloudTs && new Date(localTs) > new Date(cloudTs);
          if (localIsNewer) {
            // Local has unsaved changes newer than the cloud — push local up
            await saveProjectToCloud(targetId, getSerializableState(useAppStore.getState()), state.projectTitle);
          } else {
            useAppStore.getState().importProjectFromCloud(result.data, cloudTs ?? undefined);
          }
        }
        useAppStore.setState({ activeProjectId: targetId });
      }
      setProjects(list);
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

  // Flushes the currently-open project (if any) then loads `projectId` in its
  // place. Caller must hold the isSyncing lock.
  async function performSwitch(projectId: string) {
    // A pending debounced auto-save would otherwise fire after the switch and
    // redundantly re-save the *new* project onto itself.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const current = useAppStore.getState();
    if (current.activeProjectId && current.activeProjectId !== projectId) {
      await saveProjectToCloud(current.activeProjectId, getSerializableState(current), current.projectTitle);
    }
    const result = await loadProjectFromCloud(projectId);
    useAppStore.getState().importProjectFromCloud(result.data ?? {}, result.updatedAt ?? undefined);
    useAppStore.setState({ activeProjectId: projectId });
  }

  const switchProject = useCallback(async (projectId: string) => {
    if (!user || isSyncing.current) return;
    if (useAppStore.getState().activeProjectId === projectId) return;
    isSyncing.current = true;
    setSyncStatus('saving');
    try {
      await performSwitch(projectId);
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
  }, [user]);

  const createNewProject = useCallback(async (name: string) => {
    if (!user || isSyncing.current) return;
    isSyncing.current = true;
    setSyncStatus('saving');
    try {
      const current = useAppStore.getState();
      if (current.activeProjectId) {
        await saveProjectToCloud(current.activeProjectId, getSerializableState(current), current.projectTitle);
      }
      const created = await createProject(user.id, name, {});
      useAppStore.getState().importProjectFromCloud({}, created.updatedAt);
      useAppStore.setState({ activeProjectId: created.id });
      useAppStore.getState().setProjectTitle(name);
      setProjects((prev) => [created, ...prev]);
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
  }, [user]);

  const removeProject = useCallback(async (projectId: string) => {
    if (!user || isSyncing.current) return;
    isSyncing.current = true;
    setSyncStatus('saving');
    try {
      // Force a fresh snapshot right before deleting so the project can still
      // be recovered afterward — revisions aren't cascade-deleted with it.
      const deletedMeta = projectsRef.current.find((p) => p.id === projectId);
      if (deletedMeta) {
        try {
          const isActive = useAppStore.getState().activeProjectId === projectId;
          const dataToSnapshot = isActive
            ? getSerializableState(useAppStore.getState())
            : (await loadProjectFromCloud(projectId)).data ?? {};
          const wordCount = isActive ? projectWordCount() : 0;
          await snapshotProjectRevision(user.id, projectId, deletedMeta.name, wordCount, dataToSnapshot);
          lastSnapshotAt.current[projectId] = Date.now();
        } catch (err) {
          console.error('Pre-delete snapshot failed:', err);
        }
      }
      await deleteProjectFromCloud(projectId);
      const remaining = projectsRef.current.filter((p) => p.id !== projectId);
      setProjects(remaining);
      if (useAppStore.getState().activeProjectId === projectId) {
        if (remaining.length > 0) {
          try {
            await performSwitch(remaining[0].id);
          } catch (switchErr) {
            // The project we were on is already deleted from the cloud —
            // clear the pointer so auto-save doesn't keep writing into a
            // row that no longer exists. Retrying the sync will re-pick a
            // sane default project.
            useAppStore.setState({ activeProjectId: null });
            throw switchErr;
          }
        } else {
          const created = await createProject(user.id, 'My Book', {});
          useAppStore.getState().importProjectFromCloud({}, created.updatedAt);
          useAppStore.setState({ activeProjectId: created.id });
          setProjects([created]);
        }
      }
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
  }, [user]);

  const restoreRevision = useCallback(async (revisionId: string) => {
    const projectId = useAppStore.getState().activeProjectId;
    if (!user || !projectId || isSyncing.current) return;
    isSyncing.current = true;
    setSyncStatus('saving');
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const current = useAppStore.getState();
      // Snapshot the current state first so restoring isn't itself a lossy
      // operation — the writer can always undo a bad restore too.
      try {
        await snapshotProjectRevision(user.id, projectId, current.projectTitle, projectWordCount(), getSerializableState(current));
      } catch (err) {
        console.error('Pre-restore snapshot failed:', err);
      }
      const data = await getProjectRevisionData(revisionId);
      useAppStore.getState().importProjectFromCloud(data);
      const restored = useAppStore.getState();
      await saveProjectToCloud(projectId, getSerializableState(restored), restored.projectTitle);
      const ts = new Date().toISOString();
      useAppStore.setState({ localLastModified: ts });
      lastSnapshotAt.current[projectId] = Date.now();
      setProjects((prev) => prev.map((p) => (
        p.id === projectId ? { ...p, name: restored.projectTitle, updatedAt: ts } : p
      )));
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
        setProjects([]);
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
    const unsub = useAppStore.subscribe(() => {
      if (isSyncing.current || !cloudLoaded.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const projectId = useAppStore.getState().activeProjectId;
        if (!projectId) return;
        isSyncing.current = true;
        setSyncStatus('saving');
        try {
          const ts = new Date().toISOString();
          useAppStore.setState({ localLastModified: ts });
          const state = useAppStore.getState();
          await saveProjectToCloud(projectId, getSerializableState(state), state.projectTitle);
          setProjects((prev) => prev.map((p) => (
            p.id === projectId ? { ...p, name: state.projectTitle, updatedAt: ts } : p
          )));
          setCloudError(null);
          setSyncStatus('saved');
          setTimeout(() => setSyncStatus('idle'), 2000);
          void maybeSnapshot(user, projectId, state.projectTitle);
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
  }, [user, maybeSnapshot]);

  const signOut = () => supabase.auth.signOut();

  return (
    <SyncContext.Provider value={{
      user, syncStatus, cloudError, projects, signOut, forceReloadFromCloud,
      switchProject, createNewProject, removeProject, restoreRevision,
    }}>
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
    researchEntries: state.researchEntries,
    projectTags: state.projectTags,
    links: state.links,
    history: state.history,
    savedFilters: state.savedFilters,
    editorSettings: state.editorSettings,
    manuscriptSettings: state.manuscriptSettings,
    betaReaderSettings: state.betaReaderSettings,
    storyBrief: state.storyBrief,
    localLastModified: state.localLastModified,
  };
}
