import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';
import type { ProjectMeta } from '../lib/sync';

export interface SyncContextValue {
  user: User | null;
  syncStatus: 'idle' | 'saving' | 'saved' | 'error';
  cloudError: string | null;
  projects: ProjectMeta[];
  signOut: () => void;
  forceReloadFromCloud: () => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
  createNewProject: (name: string) => Promise<void>;
  removeProject: (projectId: string) => Promise<void>;
  restoreRevision: (revisionId: string) => Promise<void>;
}

export const SyncContext = createContext<SyncContextValue>({
  user: null,
  syncStatus: 'idle',
  cloudError: null,
  projects: [],
  signOut: () => {},
  forceReloadFromCloud: async () => {},
  switchProject: async () => {},
  createNewProject: async () => {},
  removeProject: async () => {},
  restoreRevision: async () => {},
});

export function useSyncContext() {
  return useContext(SyncContext);
}
