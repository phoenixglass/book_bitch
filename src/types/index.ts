export type ItemType = 'folder' | 'document' | 'root';

export type Label =
  | 'none'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple';

export type Status =
  | 'No Status'
  | 'To Do'
  | 'In Progress'
  | 'First Draft'
  | 'Revised Draft'
  | 'Final Draft'
  | 'Done';

export interface Snapshot {
  id: string;
  timestamp: number;
  label: string;
  content: string;
}

export interface BinderItem {
  id: string;
  type: ItemType;
  title: string;
  content: string; // HTML from TipTap
  synopsis: string;
  notes: string;
  label: Label;
  status: Status;
  children: BinderItem[];
  expanded: boolean;
  snapshots: Snapshot[];
  wordCountTarget: number;
  driveFileId?: string; // Google Drive doc ID — enables re-sync
}

export type ViewMode = 'editor' | 'corkboard' | 'outline';

export interface ProjectTarget {
  wordTarget: number;
  deadlineDate: string; // ISO date string
}

export interface AppState {
  projectTitle: string;
  binder: BinderItem[];
  selectedId: string | null;
  multiSelectedIds: string[];
  viewMode: ViewMode;
  compositionMode: boolean;
  inspectorOpen: boolean;
  projectTarget: ProjectTarget;

  // Actions
  setProjectTitle: (title: string) => void;
  addItem: (parentId: string | null, type: 'folder' | 'document') => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<BinderItem>) => void;
  moveItem: (id: string, targetParentId: string | null, index: number) => void;
  selectItem: (id: string | null) => void;
  toggleExpanded: (id: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setCompositionMode: (on: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setProjectTarget: (target: Partial<ProjectTarget>) => void;
  takeSnapshot: (id: string, label: string) => void;
  restoreSnapshot: (itemId: string, snapshotId: string) => void;
  deleteSnapshot: (itemId: string, snapshotId: string) => void;
  emptyTrash: () => void;
  permanentlyDeleteItem: (id: string) => void;
}
