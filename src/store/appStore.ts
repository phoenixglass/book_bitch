import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStorage } from '../utils/idbStorage';
import { countWords as countWordsInHtml } from '../utils/textStats';
import { replaceInBinder } from '../utils/findReplace';
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
  ResearchEntry,
  ResearchType,
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
  AIObjectType,
  AIResult,
  ManuscriptSettings,
  BetaReaderSettings,
  EditorSettings,
  StoryBrief,
  FindReplaceOptions,
  ContinuityReport,
  TruthMirrorResult,
  RevisionPass,
  RevisionPassSceneState,
  ManuscriptAssembly,
  AssemblyScene,
  ImportSourceMeta,
} from '../types';

function makeId() {
  return crypto.randomUUID();
}

// Stable key identifying the Drive file/tab/heading an item was imported
// from, so re-importing after a rename in Drive updates the existing item
// instead of creating a duplicate. Mirrors the key format used for binder
// items in useDriveImport.ts.
function driveImportKey(meta?: ImportSourceMeta): string | undefined {
  if (!meta?.googleFileId) return undefined;
  if (meta.googleTabId) return `${meta.googleFileId}#tab:${meta.googleTabId}`;
  if (meta.googleHeadingId) return `${meta.googleFileId}#heading:${meta.googleHeadingId}`;
  return meta.googleFileId;
}

function now() {
  return Date.now();
}

function nowIso() {
  return new Date().toISOString();
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function flattenDocuments(items: BinderItem[]): BinderItem[] {
  return items.flatMap((item) => [
    ...(item.type === 'document' ? [item] : []),
    ...flattenDocuments(item.children),
  ]);
}

function manuscriptDocuments(items: BinderItem[]): BinderItem[] {
  const manuscriptRoot = items.find((item) => item.id === 'manuscript');
  return flattenDocuments(manuscriptRoot ? [manuscriptRoot] : items);
}

function scenesFromIds(sceneIds: string[]): AssemblyScene[] {
  return sceneIds.map((sceneId, index) => ({ sceneId, included: true, order: index }));
}

export function totalWordCount(items: BinderItem[]): number {
  let total = 0;
  for (const item of items) {
    if (item.type === 'document') {
      total += countWordsInHtml(item.content);
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
      researchEntries: [] as ResearchEntry[],
      revisionPasses: [] as RevisionPass[],
      manuscriptAssemblies: [] as ManuscriptAssembly[],
      projectTags: [] as Tag[],
      links: [] as Link[],
      history: [] as HistoryEvent[],
      savedFilters: [] as SavedFilter[],
      dailyWordCounts: {} as Record<string, number>,

      // ── UI state ─────────────────────────────────────────────────────────
      area: 'manuscript' as AppArea,
      splitScreenOpen: false,
      splitRefTarget: null as SplitRefTarget | null,
      splitRefPinned: false,
      searchOpen: false,
      searchQuery: '',
      pendingSelectId: null as string | null,
      styleCheckOpen: false,

      // ── AI settings ──────────────────────────────────────────────────────
      aiSettings: {
        mode: 'disabled' as AIMode,
        allowDrafting: false,
      } as AISettings,
      aiPanelOpen: false,
      pendingAIResult: null as AIResult | null,
      aiContextObject: null as { type: AIObjectType; id: string } | null,
      storyBrief: null as StoryBrief | null,
      continuityReport: null as ContinuityReport | null,
      truthMirrorResults: {} as Record<string, TruthMirrorResult>,

      // ── Editor appearance settings ────────────────────────────────────────
      editorSettings: {
        fontFamily: 'Times New Roman, Times, serif',
        fontSize: 12,
        lineHeight: 2.0,
        firstLineIndent: 0.5,
        paragraphSpacingBefore: 0,
        paragraphSpacingAfter: 0,
        textAlign: 'left',
        pageWidth: 680,
        pageBackground: '#1a1a2e',
        textColor: '#e0e0e0',
      } as EditorSettings,

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

      // ── Beta reader packet settings ───────────────────────────────────────
      betaReaderSettings: {
        noteToReaders: '',
        includeChapterGuide: true,
        includeFeedbackQuestions: true,
        feedbackQuestions: [
          'Where did you find yourself most engaged? Where did your attention wander?',
          'Were there any characters or relationships you had trouble following?',
          'Did the pacing feel right, or were there sections that dragged or rushed?',
          'Was the ending satisfying?',
          'Is there anything you wanted more of? Less of?',
        ].join('\n'),
      } as BetaReaderSettings,

      localLastModified: null,
      activeProjectId: null,

      // ── Existing actions ─────────────────────────────────────────────────

      setProjectTitle: (title) => set({ projectTitle: title }),
      setActiveProjectId: (id) => set({ activeProjectId: id }),

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
        set((s) => {
          let dailyWordCounts = s.dailyWordCounts;
          if (patch.content !== undefined) {
            const current = findItem(s.binder, id);
            if (current) {
              const delta = countWordsInHtml(patch.content) - countWordsInHtml(current.content);
              if (delta !== 0) {
                const key = todayKey();
                dailyWordCounts = { ...dailyWordCounts, [key]: (dailyWordCounts[key] ?? 0) + delta };
              }
            }
          }
          return { binder: patchItemInTree(s.binder, id, patch), dailyWordCounts };
        });
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

      setStyleCheckOpen: (open) => set({ styleCheckOpen: open }),

      // ── Find & Replace ──────────────────────────────────────────────────

      findAndReplaceInBinder: (searchTerm: string, replaceTerm: string, options?: FindReplaceOptions) => {
        const { items, totalReplacements } = replaceInBinder(get().binder, searchTerm, replaceTerm, options);
        if (totalReplacements > 0) set({ binder: items });
        return totalReplacements;
      },

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
          notes: '',
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

      moveFragmentToOmitted: (fragmentId, reason = '') => {
        const frag = get().fragments.find((f) => f.id === fragmentId);
        if (!frag) return;
        const id = get().addOmittedMaterial({
          title: frag.title,
          content: frag.content,
          reason: reason || 'Moved from Fragments',
          tags: frag.tags,
          importSource: frag.importSource,
        });
        set((s) => ({ fragments: s.fragments.filter((f) => f.id !== fragmentId) }));
        get().recordEvent({
          eventType: 'moved',
          objectType: 'fragment',
          objectId: fragmentId,
          objectTitle: frag.title,
          relatedObjectType: 'omitted_material',
          relatedObjectId: id,
          relatedObjectTitle: frag.title,
          description: `Fragment "${frag.title}" moved to Omitted Material`,
        });
      },

      moveFragmentToManuscript: (fragmentId, parentId = 'manuscript') => {
        const frag = get().fragments.find((f) => f.id === fragmentId);
        if (!frag) return '';
        const newSceneId = makeId();
        const newScene = makeDocument({
          id: newSceneId,
          title: frag.title,
          content: frag.content,
        });
        set((s) => ({
          binder: insertItemInTree(s.binder, parentId, newScene, 9999),
          fragments: s.fragments.filter((f) => f.id !== fragmentId),
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
          eventType: 'moved',
          objectType: 'fragment',
          objectId: fragmentId,
          objectTitle: frag.title,
          relatedObjectType: 'scene',
          relatedObjectId: newSceneId,
          relatedObjectTitle: frag.title,
          description: `Fragment "${frag.title}" moved to Manuscript`,
        });
        return newSceneId;
      },

      trashFragment: (fragmentId) => {
        const frag = get().fragments.find((f) => f.id === fragmentId);
        if (!frag) return;
        set((s) => ({
          fragments: s.fragments.map((f) =>
            f.id === fragmentId ? { ...f, trashedAt: now(), updatedAt: now() } : f,
          ),
        }));
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'fragment',
          objectId: fragmentId,
          objectTitle: frag.title,
          description: `Fragment "${frag.title}" moved to Trash`,
        });
      },

      restoreFragmentFromTrash: (fragmentId) => {
        const frag = get().fragments.find((f) => f.id === fragmentId);
        if (!frag) return;
        set((s) => ({
          fragments: s.fragments.map((f) =>
            f.id === fragmentId ? { ...f, trashedAt: undefined, updatedAt: now() } : f,
          ),
        }));
        get().recordEvent({
          eventType: 'restored',
          objectType: 'fragment',
          objectId: fragmentId,
          objectTitle: frag.title,
          description: `Fragment "${frag.title}" restored from Trash`,
        });
      },

      permanentlyDeleteFragment: (fragmentId) => {
        const frag = get().fragments.find((f) => f.id === fragmentId);
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'fragment',
          objectId: fragmentId,
          objectTitle: frag?.title ?? fragmentId,
          description: `Fragment "${frag?.title}" permanently deleted`,
        });
        set((s) => ({ fragments: s.fragments.filter((f) => f.id !== fragmentId) }));
      },

      reorderFragment: (draggedId, targetId, position) => {
        set((s) => {
          const list = [...s.fragments];
          const fromIdx = list.findIndex((f) => f.id === draggedId);
          if (fromIdx < 0) return s;
          const [item] = list.splice(fromIdx, 1);
          const toIdx = list.findIndex((f) => f.id === targetId);
          if (toIdx < 0) { list.push(item); return { fragments: list }; }
          const insertAt = position === 'before' ? toIdx : toIdx + 1;
          list.splice(insertAt, 0, item);
          return { fragments: list };
        });
      },

      importToFragments: (items) => {
        const ids: string[] = [];
        for (const item of items) {
          const key = driveImportKey(item.importSource);
          const existing = key
            ? get().fragments.find((f) => driveImportKey(f.importSource) === key)
            : undefined;

          if (existing) {
            set((s) => ({
              fragments: s.fragments.map((f) =>
                f.id === existing.id
                  ? { ...f, title: item.title || f.title, content: item.content, importSource: item.importSource, updatedAt: now() }
                  : f
              ),
            }));
            get().recordEvent({
              eventType: 'updated',
              objectType: 'fragment',
              objectId: existing.id,
              objectTitle: item.title || existing.title,
              description: `Fragment "${item.title || existing.title}" re-synced from "${item.importSource?.fileName ?? 'file'}"`,
            });
            ids.push(existing.id);
            continue;
          }

          const id = makeId();
          const frag: Fragment = {
            id,
            title: item.title || 'Untitled Fragment',
            content: item.content,
            fragmentType: 'other' as FragmentType,
            tags: [],
            relatedCharacters: [],
            relatedPlaces: [],
            relatedThemes: [],
            possiblePlacement: '',
            notes: '',
            source: item.importSource?.fileName ?? '',
            status: 'unsorted' as FragmentStatus,
            importSource: item.importSource,
            createdAt: now(),
            updatedAt: now(),
          };
          set((s) => ({ fragments: [...s.fragments, frag] }));
          get().recordEvent({
            eventType: 'imported',
            objectType: 'fragment',
            objectId: id,
            objectTitle: frag.title,
            description: `Fragment "${frag.title}" imported from "${item.importSource?.fileName ?? 'file'}"`,
          });
          ids.push(id);
        }
        return ids;
      },

      sendSceneToFragments: (sceneId) => {
        const scene = findItem(get().binder, sceneId);
        if (!scene || scene.type === 'folder') return;
        const id = get().addFragment({
          title: scene.title,
          content: scene.content,
          source: `Manuscript: ${scene.title}`,
        });
        get().permanentlyDeleteItem(sceneId);
        get().recordEvent({
          eventType: 'moved',
          objectType: 'scene',
          objectId: sceneId,
          objectTitle: scene.title,
          relatedObjectType: 'fragment',
          relatedObjectId: id,
          relatedObjectTitle: scene.title,
          description: `Scene "${scene.title}" sent to Fragments`,
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

      moveOmittedToFragments: (omittedId) => {
        const omitted = get().omittedMaterial.find((o) => o.id === omittedId);
        if (!omitted) return;
        const id = makeId();
        const frag: Fragment = {
          id,
          title: omitted.title,
          content: omitted.content,
          fragmentType: 'other' as FragmentType,
          tags: omitted.tags,
          relatedCharacters: omitted.relatedCharacters,
          relatedPlaces: [],
          relatedThemes: omitted.relatedThemes,
          possiblePlacement: '',
          notes: '',
          source: omitted.sourceSceneTitle ? `Omitted from: ${omitted.sourceSceneTitle}` : 'Omitted Material',
          status: 'unsorted' as FragmentStatus,
          importSource: omitted.importSource,
          createdAt: now(),
          updatedAt: now(),
        };
        set((s) => ({
          fragments: [...s.fragments, frag],
          omittedMaterial: s.omittedMaterial.filter((o) => o.id !== omittedId),
        }));
        get().recordEvent({
          eventType: 'moved',
          objectType: 'omitted_material',
          objectId: omittedId,
          objectTitle: omitted.title,
          relatedObjectType: 'fragment',
          relatedObjectId: id,
          relatedObjectTitle: omitted.title,
          description: `Omitted material "${omitted.title}" moved to Fragments`,
        });
      },

      moveOmittedToManuscript: (omittedId, parentId = 'manuscript') => {
        return get().restoreOmittedToScene(omittedId, parentId);
      },

      trashOmitted: (omittedId) => {
        const omitted = get().omittedMaterial.find((o) => o.id === omittedId);
        if (!omitted) return;
        set((s) => ({
          omittedMaterial: s.omittedMaterial.map((o) =>
            o.id === omittedId ? { ...o, trashedAt: now(), updatedAt: now() } : o,
          ),
        }));
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'omitted_material',
          objectId: omittedId,
          objectTitle: omitted.title,
          description: `Omitted material "${omitted.title}" moved to Trash`,
        });
      },

      restoreOmittedFromTrash: (omittedId) => {
        const omitted = get().omittedMaterial.find((o) => o.id === omittedId);
        if (!omitted) return;
        set((s) => ({
          omittedMaterial: s.omittedMaterial.map((o) =>
            o.id === omittedId ? { ...o, trashedAt: undefined, updatedAt: now() } : o,
          ),
        }));
        get().recordEvent({
          eventType: 'restored',
          objectType: 'omitted_material',
          objectId: omittedId,
          objectTitle: omitted.title,
          description: `Omitted material "${omitted.title}" restored from Trash`,
        });
      },

      permanentlyDeleteOmitted: (omittedId) => {
        const omitted = get().omittedMaterial.find((o) => o.id === omittedId);
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'omitted_material',
          objectId: omittedId,
          objectTitle: omitted?.title ?? omittedId,
          description: `Omitted material "${omitted?.title}" permanently deleted`,
        });
        set((s) => ({ omittedMaterial: s.omittedMaterial.filter((o) => o.id !== omittedId) }));
      },

      reorderOmitted: (draggedId, targetId, position) => {
        set((s) => {
          const list = [...s.omittedMaterial];
          const fromIdx = list.findIndex((o) => o.id === draggedId);
          if (fromIdx < 0) return s;
          const [item] = list.splice(fromIdx, 1);
          const toIdx = list.findIndex((o) => o.id === targetId);
          if (toIdx < 0) { list.push(item); return { omittedMaterial: list }; }
          const insertAt = position === 'before' ? toIdx : toIdx + 1;
          list.splice(insertAt, 0, item);
          return { omittedMaterial: list };
        });
      },

      importToOmitted: (items) => {
        const ids: string[] = [];
        for (const item of items) {
          const key = driveImportKey(item.importSource);
          const existing = key
            ? get().omittedMaterial.find((o) => driveImportKey(o.importSource) === key)
            : undefined;

          if (existing) {
            set((s) => ({
              omittedMaterial: s.omittedMaterial.map((o) =>
                o.id === existing.id
                  ? { ...o, title: item.title || o.title, content: item.content, importSource: item.importSource, updatedAt: now() }
                  : o
              ),
            }));
            get().recordEvent({
              eventType: 'updated',
              objectType: 'omitted_material',
              objectId: existing.id,
              objectTitle: item.title || existing.title,
              description: `Omitted material "${item.title || existing.title}" re-synced from "${item.importSource?.fileName ?? 'file'}"`,
            });
            ids.push(existing.id);
            continue;
          }

          const id = makeId();
          const omitted: OmittedMaterial = {
            id,
            title: item.title || 'Untitled',
            content: item.content,
            reason: item.reason || 'Imported as omitted material',
            omissionDate: now(),
            tags: [],
            relatedCharacters: [],
            relatedThemes: [],
            relatedLocations: [],
            omissionStatus: 'saved_for_later' as OmissionStatus,
            notes: '',
            importSource: item.importSource,
            createdAt: now(),
            updatedAt: now(),
          };
          set((s) => ({ omittedMaterial: [...s.omittedMaterial, omitted] }));
          get().recordEvent({
            eventType: 'imported',
            objectType: 'omitted_material',
            objectId: id,
            objectTitle: omitted.title,
            description: `Omitted material "${omitted.title}" imported from "${item.importSource?.fileName ?? 'file'}"`,
          });
          ids.push(id);
        }
        return ids;
      },

      importToManuscript: (items, parentId = 'manuscript') => {
        const ids: string[] = [];
        for (const item of items) {
          const id = makeId();
          const newScene = makeDocument({
            id,
            title: item.title || 'Untitled',
            content: item.content,
          });
          set((s) => ({
            binder: insertItemInTree(s.binder, parentId, newScene, 9999),
          }));
          get().recordEvent({
            eventType: 'imported',
            objectType: 'scene',
            objectId: id,
            objectTitle: item.title,
            description: `Scene "${item.title}" imported from "${item.importSource?.fileName ?? 'file'}"`,
          });
          ids.push(id);
        }
        return ids;
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

      // ── Research ─────────────────────────────────────────────────────────

      addResearchEntry: (partial = {}) => {
        const id = makeId();
        const entry: ResearchEntry = {
          id,
          title: 'Untitled Research',
          content: '',
          researchType: 'note' as ResearchType,
          tags: [],
          relatedSceneIds: [],
          relatedFragmentIds: [],
          relatedCodexIds: [],
          relatedQuestionIds: [],
          relatedNotebookIds: [],
          notes: '',
          source: '',
          createdAt: now(),
          updatedAt: now(),
          ...partial,
        };
        set((s) => ({ researchEntries: [...s.researchEntries, entry] }));
        get().recordEvent({
          eventType: 'created',
          objectType: 'research_item',
          objectId: id,
          objectTitle: entry.title,
          description: `Research entry created: "${entry.title}"`,
        });
        return id;
      },

      updateResearchEntry: (id, patch) => {
        set((s) => ({
          researchEntries: s.researchEntries.map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: now() } : e,
          ),
        }));
      },

      deleteResearchEntry: (id) => {
        const entry = get().researchEntries.find((e) => e.id === id);
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'research_item',
          objectId: id,
          objectTitle: entry?.title ?? id,
          description: `Research entry deleted: "${entry?.title ?? id}"`,
        });
        set((s) => ({ researchEntries: s.researchEntries.filter((e) => e.id !== id) }));
      },

      trashResearchEntry: (id) => {
        const entry = get().researchEntries.find((e) => e.id === id);
        if (!entry) return;
        set((s) => ({
          researchEntries: s.researchEntries.map((e) =>
            e.id === id ? { ...e, trashedAt: now(), updatedAt: now() } : e,
          ),
        }));
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'research_item',
          objectId: id,
          objectTitle: entry.title,
          description: `Research entry "${entry.title}" moved to Trash`,
        });
      },

      trashResearchEntries: (ids) => {
        const idSet = new Set(ids);
        set((s) => ({
          researchEntries: s.researchEntries.map((e) =>
            idSet.has(e.id) ? { ...e, trashedAt: now(), updatedAt: now() } : e,
          ),
        }));
      },

      restoreResearchEntryFromTrash: (id) => {
        const entry = get().researchEntries.find((e) => e.id === id);
        if (!entry) return;
        set((s) => ({
          researchEntries: s.researchEntries.map((e) =>
            e.id === id ? { ...e, trashedAt: undefined, updatedAt: now() } : e,
          ),
        }));
        get().recordEvent({
          eventType: 'restored',
          objectType: 'research_item',
          objectId: id,
          objectTitle: entry.title,
          description: `Research entry "${entry.title}" restored from Trash`,
        });
      },

      permanentlyDeleteResearchEntry: (id) => {
        const entry = get().researchEntries.find((e) => e.id === id);
        get().recordEvent({
          eventType: 'deleted',
          objectType: 'research_item',
          objectId: id,
          objectTitle: entry?.title ?? id,
          description: `Research entry "${entry?.title}" permanently deleted`,
        });
        set((s) => ({ researchEntries: s.researchEntries.filter((e) => e.id !== id) }));
      },

      importToResearch: (items) => {
        const ids: string[] = [];
        for (const item of items) {
          const key = driveImportKey(item.importSource);
          const existing = key
            ? get().researchEntries.find((e) => driveImportKey(e.importSource) === key)
            : undefined;

          if (existing) {
            set((s) => ({
              researchEntries: s.researchEntries.map((e) =>
                e.id === existing.id
                  ? { ...e, title: item.title || e.title, content: item.content, importSource: item.importSource, updatedAt: now() }
                  : e
              ),
            }));
            get().recordEvent({
              eventType: 'updated',
              objectType: 'research_item',
              objectId: existing.id,
              objectTitle: item.title || existing.title,
              description: `Research entry "${item.title || existing.title}" re-synced from "${item.importSource?.fileName ?? 'file'}"`,
            });
            ids.push(existing.id);
            continue;
          }

          const id = makeId();
          const entry: ResearchEntry = {
            id,
            title: item.title || 'Untitled Research',
            content: item.content,
            researchType: item.researchType ?? ('note' as ResearchType),
            tags: [],
            relatedSceneIds: [],
            relatedFragmentIds: [],
            relatedCodexIds: [],
            relatedQuestionIds: [],
            relatedNotebookIds: [],
            notes: '',
            source: item.importSource?.fileName ?? '',
            importSource: item.importSource,
            createdAt: now(),
            updatedAt: now(),
          };
          set((s) => ({ researchEntries: [...s.researchEntries, entry] }));
          get().recordEvent({
            eventType: 'imported',
            objectType: 'research_item',
            objectId: id,
            objectTitle: entry.title,
            description: `Research entry "${entry.title}" imported from "${item.importSource?.fileName ?? 'file'}"`,
          });
          ids.push(id);
        }
        return ids;
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


      // ── Revision Passes ─────────────────────────────────────────────────

      addRevisionPass: (partial = {}) => {
        const id = makeId();
        const timestamp = now();
        const revisionPass: RevisionPass = { id, title: 'Untitled Revision Pass', description: '', focus: '', color: '#6b46c1', targetSceneIds: [], checklist: [], sceneStates: {}, createdAt: timestamp, updatedAt: timestamp, ...partial };
        set((state) => ({ revisionPasses: [...(state.revisionPasses ?? []), revisionPass] }));
        get().recordEvent({ eventType: 'created', objectType: 'revision_pass', objectId: id, objectTitle: revisionPass.title, description: `Revision pass created: "${revisionPass.title}"` });
        return id;
      },

      updateRevisionPass: (id, patch) => set((state) => ({ revisionPasses: (state.revisionPasses ?? []).map((pass) => pass.id === id ? { ...pass, ...patch, updatedAt: now() } : pass) })),

      deleteRevisionPass: (id) => {
        const pass = (get().revisionPasses ?? []).find((p) => p.id === id);
        get().recordEvent({ eventType: 'deleted', objectType: 'revision_pass', objectId: id, objectTitle: pass?.title ?? id, description: `Revision pass deleted: "${pass?.title ?? id}"` });
        set((state) => ({ revisionPasses: (state.revisionPasses ?? []).filter((pass) => pass.id !== id) }));
      },

      archiveRevisionPass: (id) => {
        const timestamp = now();
        const pass = (get().revisionPasses ?? []).find((p) => p.id === id);
        set((state) => ({ revisionPasses: (state.revisionPasses ?? []).map((p) => p.id === id ? { ...p, archivedAt: timestamp, updatedAt: timestamp } : p) }));
        get().recordEvent({ eventType: 'updated', objectType: 'revision_pass', objectId: id, objectTitle: pass?.title ?? id, description: `Revision pass archived: "${pass?.title ?? id}"` });
      },

      unarchiveRevisionPass: (id) => {
        const pass = (get().revisionPasses ?? []).find((p) => p.id === id);
        set((state) => ({ revisionPasses: (state.revisionPasses ?? []).map((p) => { if (p.id !== id) return p; return { ...p, archivedAt: undefined, updatedAt: now() }; }) }));
        get().recordEvent({ eventType: 'updated', objectType: 'revision_pass', objectId: id, objectTitle: pass?.title ?? id, description: `Revision pass unarchived: "${pass?.title ?? id}"` });
      },

      setRevisionPassTargets: (id, sceneIds) => set((state) => ({ revisionPasses: (state.revisionPasses ?? []).map((pass) => { if (pass.id !== id) return pass; const sceneStates = { ...pass.sceneStates }; sceneIds.forEach((sceneId) => { sceneStates[sceneId] = sceneStates[sceneId] ?? { sceneId, status: 'not_started', notes: '', checklist: {}, updatedAt: now() }; }); return { ...pass, targetSceneIds: sceneIds, sceneStates, updatedAt: now() }; }) })),

      addRevisionPassChecklistItem: (passId, text) => {
        const item = { id: makeId(), text };
        set((state) => ({ revisionPasses: (state.revisionPasses ?? []).map((pass) => pass.id === passId ? { ...pass, checklist: [...pass.checklist, item], updatedAt: now() } : pass) }));
      },

      updateRevisionPassChecklistItem: (passId, itemId, text) => set((state) => ({ revisionPasses: (state.revisionPasses ?? []).map((pass) => pass.id === passId ? { ...pass, checklist: pass.checklist.map((item) => item.id === itemId ? { ...item, text } : item), updatedAt: now() } : pass) })),

      deleteRevisionPassChecklistItem: (passId, itemId) => set((state) => ({ revisionPasses: (state.revisionPasses ?? []).map((pass) => pass.id === passId ? { ...pass, checklist: pass.checklist.filter((item) => item.id !== itemId), sceneStates: Object.fromEntries(Object.entries(pass.sceneStates).map(([sceneId, sceneState]) => { const checklist = { ...sceneState.checklist }; delete checklist[itemId]; return [sceneId, { ...sceneState, checklist }]; })), updatedAt: now() } : pass) })),

      updateRevisionSceneState: (passId, sceneId, patch) => {
        const pass = (get().revisionPasses ?? []).find((p) => p.id === passId);
        const previousStatus = pass?.sceneStates[sceneId]?.status ?? 'not_started';
        set((state) => ({ revisionPasses: (state.revisionPasses ?? []).map((p) => { if (p.id !== passId) return p; const current = p.sceneStates[sceneId] ?? { sceneId, status: 'not_started', notes: '', checklist: {}, updatedAt: now() }; return { ...p, sceneStates: { ...p.sceneStates, [sceneId]: { ...current, ...patch, sceneId, updatedAt: now() } }, updatedAt: now() }; }) }));
        if (patch.status && patch.status !== previousStatus) {
          const scene = findItem(get().binder, sceneId);
          get().recordEvent({ eventType: 'status_changed', objectType: 'revision_pass', objectId: passId, objectTitle: pass?.title ?? passId, relatedObjectType: 'scene', relatedObjectId: sceneId, relatedObjectTitle: scene?.title ?? sceneId, description: `Revision status changed for "${scene?.title ?? sceneId}" in "${pass?.title ?? passId}"` });
        }
      },

      toggleRevisionSceneChecklistItem: (passId, sceneId, itemId) => {
        const pass = (get().revisionPasses ?? []).find((p) => p.id === passId);
        const current = pass?.sceneStates[sceneId] ?? { sceneId, status: 'not_started' as const, notes: '', checklist: {}, updatedAt: now() };
        const checklist = { ...current.checklist, [itemId]: !current.checklist[itemId] };
        const totalItems = pass?.checklist.length ?? 0;
        const checkedCount = pass?.checklist.filter((item) => checklist[item.id]).length ?? 0;
        const patch: Partial<RevisionPassSceneState> = { checklist };
        if (totalItems > 0 && checkedCount === totalItems) {
          patch.status = 'done';
        } else if (current.status === 'done') {
          patch.status = 'in_progress';
        }
        get().updateRevisionSceneState(passId, sceneId, patch);
      },


      // ── Manuscript Assemblies ───────────────────────────────────────────

      addManuscriptAssembly: (partial = {}) => {
        const id = makeId();
        const timestamp = nowIso();
        const assembly: ManuscriptAssembly = {
          id,
          title: 'Untitled Assembly',
          description: '',
          scenes: [],
          sourceMode: 'manual',
          includeTitlePage: false,
          includeSynopsis: false,
          includeQueryLetter: false,
          includePrivateNotes: false,
          createdAt: timestamp,
          updatedAt: timestamp,
          ...partial,
        };
        set((state) => ({ manuscriptAssemblies: [...(state.manuscriptAssemblies ?? []), assembly] }));
        get().recordEvent({ eventType: 'created', objectType: 'manuscript_assembly', objectId: id, objectTitle: assembly.title, description: `Assembly created: "${assembly.title}"` });
        return id;
      },

      updateManuscriptAssembly: (id, patch) => set((state) => ({
        manuscriptAssemblies: (state.manuscriptAssemblies ?? []).map((assembly) => assembly.id === id ? { ...assembly, ...patch, updatedAt: nowIso() } : assembly),
      })),

      deleteManuscriptAssembly: (id) => {
        const assembly = (get().manuscriptAssemblies ?? []).find((item) => item.id === id);
        set((state) => ({ manuscriptAssemblies: (state.manuscriptAssemblies ?? []).filter((item) => item.id !== id) }));
        get().recordEvent({ eventType: 'deleted', objectType: 'manuscript_assembly', objectId: id, objectTitle: assembly?.title ?? id, description: `Assembly deleted: "${assembly?.title ?? id}"` });
      },

      archiveManuscriptAssembly: (id) => {
        const timestamp = nowIso();
        const assembly = (get().manuscriptAssemblies ?? []).find((item) => item.id === id);
        set((state) => ({ manuscriptAssemblies: (state.manuscriptAssemblies ?? []).map((item) => item.id === id ? { ...item, archivedAt: timestamp, updatedAt: timestamp } : item) }));
        get().recordEvent({ eventType: 'updated', objectType: 'manuscript_assembly', objectId: id, objectTitle: assembly?.title ?? id, description: `Assembly archived: "${assembly?.title ?? id}"` });
      },

      unarchiveManuscriptAssembly: (id) => {
        const assembly = (get().manuscriptAssemblies ?? []).find((item) => item.id === id);
        set((state) => ({ manuscriptAssemblies: (state.manuscriptAssemblies ?? []).map((item) => item.id === id ? { ...item, archivedAt: undefined, updatedAt: nowIso() } : item) }));
        get().recordEvent({ eventType: 'updated', objectType: 'manuscript_assembly', objectId: id, objectTitle: assembly?.title ?? id, description: `Assembly unarchived: "${assembly?.title ?? id}"` });
      },

      setAssemblyScenes: (id, scenes) => set((state) => ({
        manuscriptAssemblies: (state.manuscriptAssemblies ?? []).map((assembly) => assembly.id === id ? { ...assembly, scenes: scenes.map((scene, index) => ({ ...scene, order: index })), updatedAt: nowIso() } : assembly),
      })),

      addSceneToAssembly: (assemblyId, sceneId) => set((state) => ({
        manuscriptAssemblies: (state.manuscriptAssemblies ?? []).map((assembly) => {
          if (assembly.id !== assemblyId || assembly.scenes.some((scene) => scene.sceneId === sceneId)) return assembly;
          return { ...assembly, scenes: [...assembly.scenes, { sceneId, included: true, order: assembly.scenes.length }], updatedAt: nowIso() };
        }),
      })),

      removeSceneFromAssembly: (assemblyId, sceneId) => set((state) => ({
        manuscriptAssemblies: (state.manuscriptAssemblies ?? []).map((assembly) => assembly.id === assemblyId ? { ...assembly, scenes: assembly.scenes.filter((scene) => scene.sceneId !== sceneId).map((scene, index) => ({ ...scene, order: index })), updatedAt: nowIso() } : assembly),
      })),

      updateAssemblyScene: (assemblyId, sceneId, patch) => set((state) => ({
        manuscriptAssemblies: (state.manuscriptAssemblies ?? []).map((assembly) => assembly.id === assemblyId ? { ...assembly, scenes: assembly.scenes.map((scene) => scene.sceneId === sceneId ? { ...scene, ...patch } : scene), updatedAt: nowIso() } : assembly),
      })),

      reorderAssemblyScenes: (assemblyId, sceneIdsInOrder) => set((state) => ({
        manuscriptAssemblies: (state.manuscriptAssemblies ?? []).map((assembly) => {
          if (assembly.id !== assemblyId) return assembly;
          const byId = new Map(assembly.scenes.map((scene) => [scene.sceneId, scene]));
          const ordered = sceneIdsInOrder.map((sceneId) => byId.get(sceneId)).filter((scene): scene is AssemblyScene => !!scene);
          const omitted = assembly.scenes.filter((scene) => !sceneIdsInOrder.includes(scene.sceneId));
          return { ...assembly, scenes: [...ordered, ...omitted].map((scene, index) => ({ ...scene, order: index })), updatedAt: nowIso() };
        }),
      })),

      createAssemblyFromBinder: (title = 'Full manuscript') => get().addManuscriptAssembly({ title, sourceMode: 'binder', scenes: scenesFromIds(manuscriptDocuments(get().binder).map((scene) => scene.id)) }),

      createAssemblyFromChronologicalOrder: (title = 'Chronological draft') => {
        const docs = manuscriptDocuments(get().binder).sort((a, b) => (a.sceneMetadata?.chronologicalOrder ?? Number.MAX_SAFE_INTEGER) - (b.sceneMetadata?.chronologicalOrder ?? Number.MAX_SAFE_INTEGER));
        return get().addManuscriptAssembly({ title, sourceMode: 'chronological', scenes: scenesFromIds(docs.map((scene) => scene.id)) });
      },

      createAssemblyFromRevisionPass: (revisionPassId, title) => {
        const pass = (get().revisionPasses ?? []).find((item) => item.id === revisionPassId);
        const binderOrder = manuscriptDocuments(get().binder).map((scene) => scene.id);
        const passIds = pass?.targetSceneIds ?? [];
        const ordered = binderOrder.filter((id) => passIds.includes(id));
        const extras = passIds.filter((id) => !ordered.includes(id));
        return get().addManuscriptAssembly({ title: title ?? `${pass?.title ?? 'Revision pass'} assembly`, sourceMode: 'revision_pass', sourceConfig: { revisionPassId }, scenes: scenesFromIds([...ordered, ...extras]) });
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

      setAIPanelOpen: (open) => {
        set({ aiPanelOpen: open });
      },

      setPendingAIResult: (result) => {
        set({ pendingAIResult: result });
      },

      setAIContextObject: (obj) => {
        set({ aiContextObject: obj });
      },

      setStoryBrief: (brief) => {
        set({ storyBrief: brief });
      },

      setContinuityReport: (report) => {
        set({ continuityReport: report });
      },

      setTruthMirrorResult: (key, result) => {
        set((s) => {
          const next = { ...s.truthMirrorResults };
          if (result) next[key] = result;
          else delete next[key];
          return { truthMirrorResults: next };
        });
      },

      // ── Editor Appearance ─────────────────────────────────────────────────

      updateEditorSettings: (patch) => {
        set((s) => ({ editorSettings: { ...s.editorSettings, ...patch } }));
      },

      // ── Manuscript Format ─────────────────────────────────────────────────

      updateManuscriptSettings: (patch) => {
        set((s) => ({ manuscriptSettings: { ...s.manuscriptSettings, ...patch } }));
      },

      updateBetaReaderSettings: (patch) => {
        set((s) => ({ betaReaderSettings: { ...s.betaReaderSettings, ...patch } }));
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
          researchEntries: state.researchEntries,
          revisionPasses: state.revisionPasses ?? [],
          manuscriptAssemblies: state.manuscriptAssemblies ?? [],
          projectTags: state.projectTags,
          links: state.links,
          history: state.history,
          savedFilters: state.savedFilters,
          dailyWordCounts: state.dailyWordCounts,
          storyBrief: state.storyBrief,
          continuityReport: state.continuityReport,
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

      importProjectFromCloud: (data: Record<string, unknown>, cloudTimestamp?: string) => {
        set({
          projectTitle: (data.projectTitle as string) ?? 'My Project',
          projectTarget: (data.projectTarget as ProjectTarget) ?? { wordTarget: 80000, deadlineDate: '' },
          binder: (data.binder as BinderItem[]) ?? INITIAL_BINDER,
          fragments: (data.fragments as Fragment[]) ?? [],
          omittedMaterial: (data.omittedMaterial as OmittedMaterial[]) ?? [],
          notebookEntries: (data.notebookEntries as NotebookEntry[]) ?? [],
          codexEntries: (data.codexEntries as CodexEntry[]) ?? [],
          questions: (data.questions as Question[]) ?? [],
          moodboardItems: (data.moodboardItems as MoodboardItem[]) ?? [],
          researchEntries: (data.researchEntries as ResearchEntry[]) ?? [],
          revisionPasses: (data.revisionPasses as RevisionPass[]) ?? [],
          manuscriptAssemblies: (data.manuscriptAssemblies as ManuscriptAssembly[]) ?? [],
          projectTags: (data.projectTags as Tag[]) ?? [],
          links: (data.links as Link[]) ?? [],
          history: (data.history as HistoryEvent[]) ?? [],
          savedFilters: (data.savedFilters as SavedFilter[]) ?? [],
          dailyWordCounts: (data.dailyWordCounts as Record<string, number>) ?? {},
          editorSettings: (data.editorSettings as EditorSettings) ?? undefined,
          manuscriptSettings: (data.manuscriptSettings as ManuscriptSettings) ?? undefined,
          betaReaderSettings: (data.betaReaderSettings as BetaReaderSettings) ?? undefined,
          storyBrief: (data.storyBrief as StoryBrief | null) ?? null,
          continuityReport: (data.continuityReport as ContinuityReport | null) ?? null,
          localLastModified: cloudTimestamp ?? null,
          selectedId: null,
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
            researchEntries: data.researchEntries ?? [],
            revisionPasses: data.revisionPasses ?? [],
            manuscriptAssemblies: data.manuscriptAssemblies ?? [],
            projectTags: data.projectTags ?? [],
            links: data.links ?? [],
            history: data.history ?? [],
            savedFilters: data.savedFilters ?? [],
            dailyWordCounts: data.dailyWordCounts ?? {},
            storyBrief: data.storyBrief ?? null,
            continuityReport: data.continuityReport ?? null,
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
    { name: 'book-bitch-project', storage: createJSONStorage(() => idbStorage) },
  ),
);
