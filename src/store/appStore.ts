import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppState,
  AppArea,
  BinderItem,
  Fragment,
  FragmentType,
  FragmentStatus,
  OmittedMaterial,
  OmissionStatus,
  NotebookEntry,
  CodexEntry,
  CodexType,
  Question,
  QuestionCategory,
  QuestionStatus,
  MoodboardItem,
  Tag,
  Link,
  HistoryEvent,
  SavedFilter,
  ViewMode,
  ProjectTarget,
  SplitRefTarget,
  AISettings,
  AIMode,
  ManuscriptSettings,
} from '../types';

function makeId() {
  return crypto.randomUUID();
}

function now() {
  return Date.now();
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
    createdAt: now(),
    updatedAt: now(),
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

// ─── Tree helpers ─────────────────────────────────────────────────────────────

export function findItem(items: BinderItem[], id: string): BinderItem | null {
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
    if (item.id === id) return { ...item, ...patch, updatedAt: now() };
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

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // ── Existing state ───────────────────────────────────────────────────
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

      // ── New collections ──────────────────────────────────────────────────
      fragments: [] as Fragment[],
      omittedMaterial: [] as OmittedMaterial[],
      notebookEntries: [] as NotebookEntry[],
      codexEntries: [] as CodexEntry[],
      questions: [] as Question[],
      moodboardItems: [] as MoodboardItem[],
      projectTags: [] as Tag[],
      links: [] as Link[],
      history: [] as HistoryEvent[],
      savedFilters: [] as SavedFilter[],

      // ── UI state ─────────────────────────────────────────────────────────
      area: 'manuscript' as AppArea,
      splitScreenOpen: false,
      splitRefTarget: null as SplitRefTarget | null,
      splitRefPinned: false,
      searchOpen: false,
      searchQuery: '',
      pendingSelectId: null as string | null,

      // ── AI settings ──────────────────────────────────────────────────────
      aiSettings: {
        mode: 'disabled' as AIMode,
        allowDrafting: false,
      } as AISettings,

      // ── Manuscript format settings ────────────────────────────────────────
      manuscriptSettings: {
        authorName: '',
        authorEmail: '',
        authorPhone: '',
        authorAddress: '',
        bookTitle: '',
        subtitle: '',
        genre: '',
        sceneBreakStyle: '#',
        includeEndMarker: true,
        includeChapterTitles: true,
        includeTitlePage: true,
        includePageNumbers: true,
        includeSynopsis: false,
        synopsisContent: '',
        includeQueryLetter: false,
        queryLetterContent: '',
      } as ManuscriptSettings,

      // ── Existing actions ─────────────────────────────────────────────────

      setProjectTitle: (title) => set({ projectTitle: title }),

      addItem: (parentId, type) => {
        const newItem = makeDocument({ type });
        set((s) => {
          // When inserting at root level, place before Trash
          let idx = 9999;
          if (parentId === null) {
            const trashIdx = s.binder.findIndex((b) => b.id === 'trash');
            if (trashIdx >= 0) idx = trashIdx;
          }
          return {
            binder: insertItemInTree(s.binder, parentId, newItem, idx),
            selectedId: newItem.id,
          };
        });
        get().recordEvent({
          eventType: 'created',
          objectType: 'scene',
          objectId: newItem.id,
          objectTitle: newItem.title,
          description: `Created ${type} "${newItem.title}"`,
        });
      },

      removeItem: (id) => {
        set((s) => {
          const [newBinder, removed] = removeItemFromTree(s.binder, id);
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
          return { binder: insertItemInTree(without, targetParentId, item, index) };
        });
        get().recordEvent({
          eventType: 'moved',
          objectType: 'scene',
          objectId: id,
          objectTitle: findItem(get().binder, id)?.title ?? id,
          description: `Moved scene`,
        });
      },

      selectItem: (id) => set({ selectedId: id }),

      toggleExpanded: (id) => {
        set((s) => {
          const item = findItem(s.binder, id);
          if (!item) return s;
          return { binder: patchItemInTree(s.binder, id, { expanded: !item.expanded }) };
        });
      },

      setViewMode: (mode) => set({ viewMode: mode }),
      setCompositionMode: (on) => set({ compositionMode: on }),
      setInspectorOpen: (open) => set({ inspectorOpen: open }),
      setProjectTarget: (target) =>
        set((s) => ({ projectTarget: { ...s.projectTarget, ...target } })),

      takeSnapshot: (id, label) => {
        set((s) => {
          const item = findItem(s.binder, id);
          if (!item) return s;
          const snap = {
            id: makeId(),
            timestamp: now(),
            label,
            content: item.content,
            metadataSnapshot: item.sceneMetadata ? { ...item.sceneMetadata } : undefined,
          };
          return {
            binder: patchItemInTree(s.binder, id, {
              snapshots: [...item.snapshots, snap],
            }),
          };
        });
        get().recordEvent({
          eventType: 'snapshot_created',
          objectType: 'scene',
          objectId: id,
          objectTitle: findItem(get().binder, id)?.title ?? id,
          description: `Snapshot created: "${label || 'Snapshot'}"`,
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
              ...(snap.metadataSnapshot ? { sceneMetadata: { ...item.sceneMetadata, ...snap.metadataSnapshot } } : {}),
            }),
          };
        });
        get().recordEvent({
          eventType: 'snapshot_restored',
          objectType: 'scene',
          objectId: itemId,
          objectTitle: findItem(get().binder, itemId)?.title ?? itemId,
          description: `Snapshot restored`,
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
          return { binder: patchItemInTree(s.binder, 'trash', { children: [] }) };
        });
      },

      permanentlyDeleteItem: (id) => {
        set((s) => {
          const [newBinder] = removeItemFromTree(s.binder, id);
          return { binder: newBinder };
        });
      },

      // ── Navigation ──────────────────────────────────────────────────────

      setArea: (area) => set({ area }),

      setSplitScreen: (open, target) =>
        set({ splitScreenOpen: open, splitRefTarget: target ?? null }),

      setSplitRefPinned: (pinned) => set({ splitRefPinned: pinned }),

      setSplitRefTarget: (target) => set({ splitRefTarget: target }),

      setSearchOpen: (open, query) =>
        set({ searchOpen: open, ...(query !== undefined ? { searchQuery: query } : {}) }),

      setSearchQuery: (query) => set({ searchQuery: query }),

      setPendingSelectId: (id) => set({ pendingSelectId: id }),

      // ── Tags ─────────────────────────────────────────────────────────────

      addTag: (name, color = '#6b46c1') => {
        const tag: Tag = { id: makeId(), name, color, createdAt: now() };
        set((s) => ({ projectTags: [...s.projectTags, tag] }));
        return tag;
      },

      updateTag: (id, patch) => {
        set((s) => ({
          projectTags: s.projectTags.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }));
      },

      deleteTag: (id) => {
        set((s) => ({ projectTags: s.projectTags.filter((t) => t.id !== id) }));
      },

      getOrCreateTag: (name) => {
        const existing = get().projectTags.find(
          (t) => t.name.toLowerCase() === name.toLowerCase(),
        );
        if (existing) return existing;
        return get().addTag(name);
      },

      // ── Fragments ────────────────────────────────────────────────────────

      addFragment: (partial = {}) => {
        const id = makeId();
        const fragment: Fragment = {
          id,
          title: 'Untitled Fragment',
          content: '',
          fragmentType: 'other' as FragmentType,
          tags: [],
          relatedCharacters: [],
          relatedPlaces: [],
          relatedThemes: [],
          possiblePlacement: '',
          source: '',
          status: 'unsorted' as FragmentStatus,
          createdAt: now(),
          updatedAt: now(),
          ...partial,
        };
        set((s) => ({ fragments: [...s.fragments, fragment] }));
        get().recordEvent({
          eventType: 'created',
          objectType: 'fragment',
          objectId: id,
          objectTitle: fragment.title,
          description: `Fragment created: "${fragment.title}"`,
        });
        return id;
      },

      updateFragment: (id, patch) => {
        set((s) => ({
          fragments: s.fragments.map((f) =>
            f.id === id ? { ...f, ...patch, updatedAt: now() } : f,
          ),
        }));
      },

      deleteFragment: (id) => {
        const frag = get().fragments.find((f) => f.id === id);
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'fragment',
          objectId: id,
          objectTitle: frag?.title ?? id,
          description: `Fragment deleted: "${frag?.title ?? id}"`,
        });
        set((s) => ({ fragments: s.fragments.filter((f) => f.id !== id) }));
      },

      attachFragmentToScene: (fragmentId, sceneId) => {
        const frag = get().fragments.find((f) => f.id === fragmentId);
        const scene = findItem(get().binder, sceneId);
        set((s) => ({
          fragments: s.fragments.map((f) =>
            f.id === fragmentId
              ? { ...f, status: 'attached' as FragmentStatus, attachedToSceneId: sceneId, updatedAt: now() }
              : f,
          ),
          links: [
            ...s.links,
            {
              id: makeId(),
              sourceType: 'fragment' as const,
              sourceId: fragmentId,
              targetType: 'scene' as const,
              targetId: sceneId,
              relationshipType: 'attached_to' as const,
              createdAt: now(),
            },
          ],
        }));
        get().recordEvent({
          eventType: 'attached',
          objectType: 'fragment',
          objectId: fragmentId,
          objectTitle: frag?.title ?? fragmentId,
          relatedObjectType: 'scene',
          relatedObjectId: sceneId,
          relatedObjectTitle: scene?.title ?? sceneId,
          description: `Fragment "${frag?.title}" attached to scene "${scene?.title}"`,
        });
      },

      promoteFragmentToScene: (fragmentId, parentId) => {
        const frag = get().fragments.find((f) => f.id === fragmentId);
        if (!frag) return '';
        const newSceneId = makeId();
        const newScene = makeDocument({
          id: newSceneId,
          title: frag.title,
          content: frag.content,
          synopsis: '',
        });
        set((s) => ({
          binder: insertItemInTree(s.binder, parentId, newScene, 9999),
          fragments: s.fragments.map((f) =>
            f.id === fragmentId
              ? { ...f, status: 'promoted' as FragmentStatus, updatedAt: now() }
              : f,
          ),
          links: [
            ...s.links,
            {
              id: makeId(),
              sourceType: 'scene' as const,
              sourceId: newSceneId,
              targetType: 'fragment' as const,
              targetId: fragmentId,
              relationshipType: 'promoted_from' as const,
              createdAt: now(),
            },
          ],
        }));
        get().recordEvent({
          eventType: 'promoted',
          objectType: 'fragment',
          objectId: fragmentId,
          objectTitle: frag.title,
          relatedObjectType: 'scene',
          relatedObjectId: newSceneId,
          relatedObjectTitle: frag.title,
          description: `Fragment "${frag.title}" promoted to scene`,
        });
        return newSceneId;
      },

      sendFragmentToOmitted: (fragmentId, reason = '') => {
        const frag = get().fragments.find((f) => f.id === fragmentId);
        if (!frag) return;
        const id = get().addOmittedMaterial({
          title: frag.title,
          content: frag.content,
          reason,
          tags: frag.tags,
        });
        set((s) => ({
          fragments: s.fragments.map((f) =>
            f.id === fragmentId
              ? { ...f, status: 'discarded' as FragmentStatus, updatedAt: now() }
              : f,
          ),
        }));
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'fragment',
          objectId: fragmentId,
          objectTitle: frag.title,
          relatedObjectType: 'omitted_material',
          relatedObjectId: id,
          relatedObjectTitle: frag.title,
          description: `Fragment "${frag.title}" sent to Omitted Material`,
        });
      },

      // ── Omitted Material ─────────────────────────────────────────────────

      addOmittedMaterial: (partial = {}) => {
        const id = makeId();
        const item: OmittedMaterial = {
          id,
          title: 'Untitled',
          content: '',
          reason: '',
          omissionDate: now(),
          tags: [],
          relatedCharacters: [],
          relatedThemes: [],
          relatedLocations: [],
          omissionStatus: 'cut' as OmissionStatus,
          notes: '',
          createdAt: now(),
          updatedAt: now(),
          ...partial,
        };
        set((s) => ({ omittedMaterial: [...s.omittedMaterial, item] }));
        get().recordEvent({
          eventType: 'created',
          objectType: 'omitted_material',
          objectId: id,
          objectTitle: item.title,
          description: `Omitted material created: "${item.title}"`,
        });
        return id;
      },

      updateOmittedMaterial: (id, patch) => {
        set((s) => ({
          omittedMaterial: s.omittedMaterial.map((o) =>
            o.id === id ? { ...o, ...patch, updatedAt: now() } : o,
          ),
        }));
      },

      deleteOmittedMaterial: (id) => {
        const item = get().omittedMaterial.find((o) => o.id === id);
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'omitted_material',
          objectId: id,
          objectTitle: item?.title ?? id,
          description: `Omitted material permanently deleted: "${item?.title ?? id}"`,
        });
        set((s) => ({ omittedMaterial: s.omittedMaterial.filter((o) => o.id !== id) }));
      },

      sendSceneToOmitted: (sceneId, reason = '') => {
        const scene = findItem(get().binder, sceneId);
        if (!scene) return;
        const id = makeId();
        const omitted: OmittedMaterial = {
          id,
          title: scene.title,
          content: scene.content,
          sourceSceneId: sceneId,
          sourceSceneTitle: scene.title,
          reason,
          omissionDate: now(),
          tags: scene.sceneMetadata?.tags ?? [],
          relatedCharacters: scene.sceneMetadata?.charactersPresent ?? [],
          relatedThemes: scene.sceneMetadata?.themes ?? [],
          relatedLocations: scene.sceneMetadata?.location ? [scene.sceneMetadata.location] : [],
          omissionStatus: 'cut',
          notes: '',
          createdAt: now(),
          updatedAt: now(),
        };
        set((s) => ({
          omittedMaterial: [...s.omittedMaterial, omitted],
        }));
        // Use permanentlyDeleteItem to remove scene from binder without sending to Trash
        get().permanentlyDeleteItem(sceneId);
        get().recordEvent({
          eventType: 'moved',
          objectType: 'scene',
          objectId: sceneId,
          objectTitle: scene.title,
          relatedObjectType: 'omitted_material',
          relatedObjectId: id,
          relatedObjectTitle: scene.title,
          description: `Scene "${scene.title}" sent to Omitted Material`,
        });
      },

      restoreOmittedToScene: (omittedId, parentId = 'manuscript') => {
        const omitted = get().omittedMaterial.find((o) => o.id === omittedId);
        if (!omitted) return '';
        const newSceneId = makeId();
        const newScene = makeDocument({
          id: newSceneId,
          title: omitted.title,
          content: omitted.content,
        });
        set((s) => ({
          binder: insertItemInTree(s.binder, parentId, newScene, 9999),
          omittedMaterial: s.omittedMaterial.map((o) =>
            o.id === omittedId
              ? { ...o, omissionStatus: 'restored' as OmissionStatus, updatedAt: now() }
              : o,
          ),
        }));
        get().recordEvent({
          eventType: 'restored',
          objectType: 'omitted_material',
          objectId: omittedId,
          objectTitle: omitted.title,
          relatedObjectType: 'scene',
          relatedObjectId: newSceneId,
          relatedObjectTitle: omitted.title,
          description: `Omitted material "${omitted.title}" restored as new scene`,
        });
        return newSceneId;
      },

      // ── Notebook ─────────────────────────────────────────────────────────

      addNotebookEntry: (partial = {}) => {
        const id = makeId();
        const entry: NotebookEntry = {
          id,
          title: 'Untitled Entry',
          content: '',
          date: new Date().toISOString().split('T')[0],
          tags: [],
          relatedSceneIds: [],
          relatedFragmentIds: [],
          relatedCodexIds: [],
          relatedQuestionIds: [],
          isPrivate: false,
          archived: false,
          createdAt: now(),
          updatedAt: now(),
          ...partial,
        };
        set((s) => ({ notebookEntries: [...s.notebookEntries, entry] }));
        get().recordEvent({
          eventType: 'created',
          objectType: 'notebook_entry',
          objectId: id,
          objectTitle: entry.title,
          description: `Notebook entry created: "${entry.title}"`,
        });
        return id;
      },

      updateNotebookEntry: (id, patch) => {
        set((s) => ({
          notebookEntries: s.notebookEntries.map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: now() } : e,
          ),
        }));
      },

      deleteNotebookEntry: (id) => {
        const entry = get().notebookEntries.find((e) => e.id === id);
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'notebook_entry',
          objectId: id,
          objectTitle: entry?.title ?? id,
          description: `Notebook entry deleted: "${entry?.title ?? id}"`,
        });
        set((s) => ({ notebookEntries: s.notebookEntries.filter((e) => e.id !== id) }));
      },

      // ── Codex ────────────────────────────────────────────────────────────

      addCodexEntry: (partial = {}) => {
        const id = makeId();
        const entry: CodexEntry = {
          id,
          name: 'Untitled',
          codexType: 'character' as CodexType,
          description: '',
          notes: '',
          aliases: [],
          tags: [],
          relatedSceneIds: [],
          relatedFragmentIds: [],
          relatedOmittedIds: [],
          relatedNotebookIds: [],
          relatedQuestionIds: [],
          customFields: {},
          createdAt: now(),
          updatedAt: now(),
          ...partial,
        };
        set((s) => ({ codexEntries: [...s.codexEntries, entry] }));
        get().recordEvent({
          eventType: 'created',
          objectType: 'codex_entry',
          objectId: id,
          objectTitle: entry.name,
          description: `Codex entry created: "${entry.name}" (${entry.codexType})`,
        });
        return id;
      },

      updateCodexEntry: (id, patch) => {
        set((s) => ({
          codexEntries: s.codexEntries.map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: now() } : e,
          ),
        }));
      },

      deleteCodexEntry: (id) => {
        const entry = get().codexEntries.find((e) => e.id === id);
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'codex_entry',
          objectId: id,
          objectTitle: entry?.name ?? id,
          description: `Codex entry deleted: "${entry?.name ?? id}"`,
        });
        set((s) => ({ codexEntries: s.codexEntries.filter((e) => e.id !== id) }));
      },

      // ── Questions ────────────────────────────────────────────────────────

      addQuestion: (partial = {}) => {
        const id = makeId();
        const question: Question = {
          id,
          text: '',
          category: 'other' as QuestionCategory,
          questionStatus: 'open' as QuestionStatus,
          priority: 'medium',
          relatedSceneIds: [],
          relatedFragmentIds: [],
          relatedOmittedIds: [],
          relatedCodexIds: [],
          relatedNotebookIds: [],
          answer: '',
          notes: '',
          createdAt: now(),
          updatedAt: now(),
          ...partial,
        };
        set((s) => ({ questions: [...s.questions, question] }));
        get().recordEvent({
          eventType: 'created',
          objectType: 'question',
          objectId: id,
          objectTitle: question.text.slice(0, 60) || 'New question',
          description: `Question created`,
        });
        return id;
      },

      updateQuestion: (id, patch) => {
        set((s) => ({
          questions: s.questions.map((q) =>
            q.id === id ? { ...q, ...patch, updatedAt: now() } : q,
          ),
        }));
      },

      deleteQuestion: (id) => {
        const q = get().questions.find((q) => q.id === id);
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'question',
          objectId: id,
          objectTitle: q?.text.slice(0, 60) ?? id,
          description: `Question deleted`,
        });
        set((s) => ({ questions: s.questions.filter((q) => q.id !== id) }));
      },

      // ── Moodboard ────────────────────────────────────────────────────────

      addMoodboardItem: (partial = {}) => {
        const id = makeId();
        const item: MoodboardItem = {
          id,
          title: 'Untitled',
          imageUrl: '',
          description: '',
          tags: [],
          source: '',
          relatedSceneIds: [],
          relatedCodexIds: [],
          notes: '',
          createdAt: now(),
          updatedAt: now(),
          ...partial,
        };
        set((s) => ({ moodboardItems: [...s.moodboardItems, item] }));
        get().recordEvent({
          eventType: 'created',
          objectType: 'moodboard_item',
          objectId: id,
          objectTitle: item.title,
          description: `Moodboard item created: "${item.title}"`,
        });
        return id;
      },

      updateMoodboardItem: (id, patch) => {
        set((s) => ({
          moodboardItems: s.moodboardItems.map((m) =>
            m.id === id ? { ...m, ...patch, updatedAt: now() } : m,
          ),
        }));
      },

      deleteMoodboardItem: (id) => {
        const item = get().moodboardItems.find((m) => m.id === id);
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'moodboard_item',
          objectId: id,
          objectTitle: item?.title ?? id,
          description: `Moodboard item deleted: "${item?.title ?? id}"`,
        });
        set((s) => ({ moodboardItems: s.moodboardItems.filter((m) => m.id !== id) }));
      },

      // ── Links ────────────────────────────────────────────────────────────

      addLink: (linkData) => {
        const link: Link = { ...linkData, id: makeId(), createdAt: now() };
        set((s) => ({ links: [...s.links, link] }));
        get().recordEvent({
          eventType: 'linked',
          objectType: linkData.sourceType,
          objectId: linkData.sourceId,
          objectTitle: linkData.sourceId,
          relatedObjectType: linkData.targetType,
          relatedObjectId: linkData.targetId,
          relatedObjectTitle: linkData.targetId,
          description: `Link created: ${linkData.relationshipType}`,
        });
      },

      removeLink: (id) => {
        set((s) => ({ links: s.links.filter((l) => l.id !== id) }));
      },

      // ── History ──────────────────────────────────────────────────────────

      recordEvent: (event) => {
        const histEvent: HistoryEvent = {
          ...event,
          id: makeId(),
          timestamp: now(),
        };
        set((s) => ({
          history: [...s.history.slice(-499), histEvent],
        }));
      },

      // ── Saved Filters ────────────────────────────────────────────────────

      addSavedFilter: (filter) => {
        const saved: SavedFilter = { ...filter, id: makeId(), createdAt: now() };
        set((s) => ({ savedFilters: [...s.savedFilters, saved] }));
      },

      deleteSavedFilter: (id) => {
        set((s) => ({ savedFilters: s.savedFilters.filter((f) => f.id !== id) }));
      },

      // ── AI ───────────────────────────────────────────────────────────────

      setAISettings: (patch) => {
        set((s) => ({ aiSettings: { ...s.aiSettings, ...patch } }));
      },

      // ── Manuscript Format ─────────────────────────────────────────────────

      updateManuscriptSettings: (patch) => {
        set((s) => ({ manuscriptSettings: { ...s.manuscriptSettings, ...patch } }));
      },

      // ── Export / Backup ──────────────────────────────────────────────────

      exportProjectBackup: () => {
        const state = get();
        const backup = {
          version: 2,
          exportedAt: new Date().toISOString(),
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
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], {
          type: 'application/json;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${state.projectTitle.replace(/\s+/g, '_')}_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        get().recordEvent({
          eventType: 'exported',
          objectType: 'scene',
          objectId: 'project',
          objectTitle: state.projectTitle,
          description: 'Full project backup exported',
        });
      },

      importProjectBackup: (json) => {
        try {
          const data = JSON.parse(json);
          if (!data.projectTitle || !data.binder) {
            alert('Invalid backup file: missing required fields.');
            return;
          }
          set({
            projectTitle: data.projectTitle ?? 'Imported Project',
            projectTarget: data.projectTarget ?? { wordTarget: 80000, deadlineDate: '' },
            binder: data.binder ?? INITIAL_BINDER,
            fragments: data.fragments ?? [],
            omittedMaterial: data.omittedMaterial ?? [],
            notebookEntries: data.notebookEntries ?? [],
            codexEntries: data.codexEntries ?? [],
            questions: data.questions ?? [],
            moodboardItems: data.moodboardItems ?? [],
            projectTags: data.projectTags ?? [],
            links: data.links ?? [],
            history: data.history ?? [],
            savedFilters: data.savedFilters ?? [],
            selectedId: null,
          });
          get().recordEvent({
            eventType: 'imported',
            objectType: 'scene',
            objectId: 'project',
            objectTitle: data.projectTitle ?? 'Imported Project',
            description: 'Project backup imported',
          });
        } catch {
          alert('Failed to parse backup file. Please check the file and try again.');
        }
      },
    }),
    { name: 'book-bitch-project' },
  ),
);
