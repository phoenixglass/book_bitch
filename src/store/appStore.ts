import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppState,
  BinderItem,
  ProjectTarget,
  ViewMode,
} from '../types';

function makeId() {
  return crypto.randomUUID();
}

function makeDocument(overrides: Partial<BinderItem> = {}): BinderItem {
  return {
    id: makeId(),
    type: 'document',
    title: 'Untitled',
    content: '',
    synopsis: '',
    notes: '',
    label: 'none',
    status: 'No Status',
    children: [],
    expanded: false,
    snapshots: [],
    wordCountTarget: 0,
    ...overrides,
  };
}

const INITIAL_BINDER: BinderItem[] = [
  {
    id: 'manuscript',
    type: 'folder',
    title: 'Manuscript',
    content: '',
    synopsis: '',
    notes: '',
    label: 'none',
    status: 'No Status',
    children: [
      makeDocument({ title: 'Chapter 1', id: 'ch1' }),
      makeDocument({ title: 'Chapter 2', id: 'ch2' }),
    ],
    expanded: true,
    snapshots: [],
    wordCountTarget: 0,
  },
  {
    id: 'research',
    type: 'folder',
    title: 'Research',
    content: '',
    synopsis: '',
    notes: '',
    label: 'none',
    status: 'No Status',
    children: [makeDocument({ title: 'Research Notes', id: 'rn1' })],
    expanded: false,
    snapshots: [],
    wordCountTarget: 0,
  },
  {
    id: 'trash',
    type: 'folder',
    title: 'Trash',
    content: '',
    synopsis: '',
    notes: '',
    label: 'none',
    status: 'No Status',
    children: [],
    expanded: false,
    snapshots: [],
    wordCountTarget: 0,
  },
];

// ─── helpers ────────────────────────────────────────────────────────────────

export function findItem(
  items: BinderItem[],
  id: string,
): BinderItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    const found = findItem(item.children, id);
    if (found) return found;
  }
  return null;
}

function removeItemFromTree(
  items: BinderItem[],
  id: string,
): [BinderItem[], BinderItem | null] {
  let removed: BinderItem | null = null;
  const result = items
    .map((item) => {
      if (item.id === id) {
        removed = item;
        return null;
      }
      const [newChildren, r] = removeItemFromTree(item.children, id);
      if (r) removed = r;
      return { ...item, children: newChildren };
    })
    .filter(Boolean) as BinderItem[];
  return [result, removed];
}

function insertItemInTree(
  items: BinderItem[],
  parentId: string | null,
  item: BinderItem,
  index: number,
): BinderItem[] {
  if (parentId === null) {
    const arr = [...items];
    arr.splice(index, 0, item);
    return arr;
  }
  return items.map((i) => {
    if (i.id === parentId) {
      const arr = [...i.children];
      arr.splice(index, 0, item);
      return { ...i, children: arr };
    }
    return { ...i, children: insertItemInTree(i.children, parentId, item, index) };
  });
}

function patchItemInTree(
  items: BinderItem[],
  id: string,
  patch: Partial<BinderItem>,
): BinderItem[] {
  return items.map((item) => {
    if (item.id === id) return { ...item, ...patch };
    return { ...item, children: patchItemInTree(item.children, id, patch) };
  });
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function totalWordCount(items: BinderItem[]): number {
  let total = 0;
  for (const item of items) {
    if (item.type === 'document') {
      total += countWords(item.content);
    }
    total += totalWordCount(item.children);
  }
  return total;
}

// ─── store ──────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      projectTitle: 'My Project',
      binder: INITIAL_BINDER,
      selectedId: 'ch1',
      multiSelectedIds: [],
      viewMode: 'editor' as ViewMode,
      compositionMode: false,
      inspectorOpen: true,
      projectTarget: {
        wordTarget: 80000,
        deadlineDate: '',
      } as ProjectTarget,

      setProjectTitle: (title) => set({ projectTitle: title }),

      addItem: (parentId, type) => {
        const newItem = makeDocument({ type });
        set((s) => ({
          binder: insertItemInTree(s.binder, parentId, newItem, 9999),
          selectedId: newItem.id,
        }));
      },

      removeItem: (id) => {
        set((s) => {
          const [newBinder, removed] = removeItemFromTree(s.binder, id);
          // move to trash unless it IS trash
          if (removed && id !== 'trash') {
            const trashItem = findItem(newBinder, 'trash');
            if (trashItem) {
              const withTrash = patchItemInTree(newBinder, 'trash', {
                children: [...trashItem.children, { ...removed, id: removed.id }],
              });
              return { binder: withTrash, selectedId: null };
            }
          }
          return { binder: newBinder, selectedId: null };
        });
      },

      updateItem: (id, patch) => {
        set((s) => ({ binder: patchItemInTree(s.binder, id, patch) }));
      },

      moveItem: (id, targetParentId, index) => {
        set((s) => {
          const [without, item] = removeItemFromTree(s.binder, id);
          if (!item) return s;
          return {
            binder: insertItemInTree(without, targetParentId, item, index),
          };
        });
      },

      selectItem: (id) => set({ selectedId: id }),

      toggleExpanded: (id) => {
        set((s) => {
          const item = findItem(s.binder, id);
          if (!item) return s;
          return {
            binder: patchItemInTree(s.binder, id, {
              expanded: !item.expanded,
            }),
          };
        });
      },

      setViewMode: (mode) => set({ viewMode: mode }),

      setCompositionMode: (on) => set({ compositionMode: on }),

      setInspectorOpen: (open) => set({ inspectorOpen: open }),

      setProjectTarget: (target) =>
        set((s) => ({
          projectTarget: { ...s.projectTarget, ...target },
        })),

      takeSnapshot: (id, label) => {
        set((s) => {
          const item = findItem(s.binder, id);
          if (!item) return s;
          const snap = {
            id: makeId(),
            timestamp: Date.now(),
            label,
            content: item.content,
          };
          return {
            binder: patchItemInTree(s.binder, id, {
              snapshots: [...item.snapshots, snap],
            }),
          };
        });
      },

      restoreSnapshot: (itemId, snapshotId) => {
        set((s) => {
          const item = findItem(s.binder, itemId);
          if (!item) return s;
          const snap = item.snapshots.find((sn) => sn.id === snapshotId);
          if (!snap) return s;
          return {
            binder: patchItemInTree(s.binder, itemId, {
              content: snap.content,
            }),
          };
        });
      },

      deleteSnapshot: (itemId, snapshotId) => {
        set((s) => {
          const item = findItem(s.binder, itemId);
          if (!item) return s;
          return {
            binder: patchItemInTree(s.binder, itemId, {
              snapshots: item.snapshots.filter((sn) => sn.id !== snapshotId),
            }),
          };
        });
      },

      emptyTrash: () => {
        set((s) => {
          const trashItem = findItem(s.binder, 'trash');
          if (!trashItem) return s;
          return {
            binder: patchItemInTree(s.binder, 'trash', {
              children: [],
            }),
          };
        });
      },

      permanentlyDeleteItem: (id) => {
        set((s) => {
          const [newBinder] = removeItemFromTree(s.binder, id);
          return { binder: newBinder };
        });
      },
    }),
    { name: 'book-bitch-project' },
  ),
);
