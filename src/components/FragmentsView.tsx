import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { TagInput } from './TagInput';
import { WritingEditor } from './WritingEditor';
import { ImportPreviewModal } from './ImportPreviewModal';
import { GoogleDriveUpload } from './GoogleDriveUpload';
import { parseFile } from '../utils/documentParser';
import type { ParsedItem, SplitLevel } from '../utils/documentParser';
import type { Fragment, FragmentType, FragmentStatus, ImportSourceMeta } from '../types';

const TYPE_LABELS: Record<FragmentType, string> = {
  line: 'Line',
  paragraph: 'Paragraph',
  scene_fragment: 'Scene Fragment',
  research_note: 'Research Note',
  image_idea: 'Image Idea',
  dialogue_scrap: 'Dialogue Scrap',
  thematic_note: 'Thematic Note',
  memory: 'Memory',
  other: 'Other',
};

const STATUS_COLORS: Record<FragmentStatus, string> = {
  unsorted: '#63b3ed',
  maybe_useful: '#f6ad55',
  attached: '#68d391',
  promoted: '#b794f4',
  discarded: '#4a5568',
};

// ─── Drag helpers ─────────────────────────────────────────────────────────────

const BB_ITEM_TYPE = 'application/x-bb-item';
const BB_TYPE_KEY = 'text/x-bb-type';

function setDragData(
  e: React.DragEvent,
  type: 'fragment' | 'scene' | 'omitted',
  id: string,
  title: string,
) {
  e.dataTransfer.setData(BB_ITEM_TYPE, JSON.stringify({ type, id, title }));
  e.dataTransfer.setData(`${BB_TYPE_KEY}-${type}`, '1');
  e.dataTransfer.setData('text/plain', id);
  e.dataTransfer.effectAllowed = 'move';
}

function getDragType(e: React.DragEvent): 'fragment' | 'scene' | 'omitted' | null {
  if (e.dataTransfer.types.includes(`${BB_TYPE_KEY}-fragment`)) return 'fragment';
  if (e.dataTransfer.types.includes(`${BB_TYPE_KEY}-scene`)) return 'scene';
  if (e.dataTransfer.types.includes(`${BB_TYPE_KEY}-omitted`)) return 'omitted';
  return null;
}

function parseDragData(e: React.DragEvent): { type: string; id: string } | null {
  try {
    const raw = e.dataTransfer.getData(BB_ITEM_TYPE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─── Fragment Detail ───────────────────────────────────────────────────────────

function FragmentDetail({
  frag,
  onClose,
}: {
  frag: Fragment;
  onClose: () => void;
}) {
  const {
    updateFragment,
    trashFragment,
    moveFragmentToOmitted,
    moveFragmentToManuscript,
    promoteFragmentToScene,
    attachFragmentToScene,
    binder,
  } = useAppStore();

  const [showAttach, setShowAttach] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);

  function collectScenes(items: typeof binder): { id: string; title: string }[] {
    const scenes: { id: string; title: string }[] = [];
    for (const item of items) {
      if (item.id === 'trash') continue;
      if (item.type === 'document') scenes.push({ id: item.id, title: item.title });
      if (item.children.length) scenes.push(...collectScenes(item.children));
    }
    return scenes;
  }
  const scenes = collectScenes(binder);

  const wordCount = useMemo(() => {
    const text = frag.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text ? text.split(/\s+/).length : 0;
  }, [frag.content]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] shrink-0">
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-xs"
        >
          ← Back
        </button>
        <span className="flex-1" />
        <span className="text-xs text-gray-600">{wordCount.toLocaleString()} words</span>
        <select
          value={frag.status}
          onChange={(e) =>
            updateFragment(frag.id, { status: e.target.value as FragmentStatus })
          }
          className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
        >
          {(Object.keys(STATUS_COLORS) as FragmentStatus[]).map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        {/* Move menu */}
        <div className="relative">
          <button
            onClick={() => setShowMoveMenu(!showMoveMenu)}
            className="text-xs bg-[#2d3748] hover:bg-[#3d4a5e] text-gray-300 px-2 py-0.5 rounded transition-colors"
          >
            Move to ▾
          </button>
          {showMoveMenu && (
            <div className="absolute right-0 top-full mt-1 bg-[#1a1a2e] border border-[#2d3748] rounded shadow-xl z-20 min-w-max">
              <button
                onClick={() => {
                  moveFragmentToManuscript(frag.id, 'manuscript');
                  setShowMoveMenu(false);
                  onClose();
                }}
                className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#6b46c1]/30 transition-colors"
              >
                📖 Move to Manuscript
              </button>
              <button
                onClick={() => {
                  const reason = prompt('Reason for omitting (optional):') ?? '';
                  if (reason !== null) {
                    moveFragmentToOmitted(frag.id, reason);
                    setShowMoveMenu(false);
                    onClose();
                  }
                }}
                className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#6b46c1]/30 transition-colors"
              >
                🗂 Move to Omitted Material
              </button>
              <button
                onClick={() => {
                  const newId = promoteFragmentToScene(frag.id, 'manuscript');
                  if (newId) { setShowMoveMenu(false); }
                }}
                className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#6b46c1]/30 transition-colors"
              >
                ⬆ Promote to Manuscript (keep copy here)
              </button>
              <div className="border-t border-[#2d3748] my-1" />
              <button
                onClick={() => {
                  trashFragment(frag.id);
                  setShowMoveMenu(false);
                  onClose();
                }}
                className="block w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-900/20 transition-colors"
              >
                🗑 Send to Trash
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Title */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <input
            value={frag.title}
            onChange={(e) => updateFragment(frag.id, { title: e.target.value })}
            className="w-full text-xl font-semibold text-white bg-transparent border-b border-[#2d3748] pb-1 outline-none focus:border-[#6b46c1] transition-colors"
            placeholder="Fragment title…"
          />
          {frag.importSource && (
            <p className="text-xs text-gray-600 mt-1">
              Imported from{' '}
              <span className="text-gray-500 font-mono">{frag.importSource.fileName}</span>
              {frag.importSource.sourceHeading && (
                <> · heading: <em>{frag.importSource.sourceHeading}</em></>
              )}
            </p>
          )}
        </div>

        {/* Metadata row */}
        <div className="px-4 pb-3 grid grid-cols-2 gap-3 text-sm shrink-0">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Type</label>
            <select
              value={frag.fragmentType}
              onChange={(e) =>
                updateFragment(frag.id, { fragmentType: e.target.value as FragmentType })
              }
              className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
            >
              {(Object.entries(TYPE_LABELS) as [FragmentType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Source</label>
            <input
              value={frag.source}
              onChange={(e) => updateFragment(frag.id, { source: e.target.value })}
              placeholder="Where did this come from?"
              className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
            />
          </div>
        </div>

        {/* Rich content editor */}
        <div className="flex-1 flex flex-col min-h-[300px] border-t border-b border-[#0f3460]">
          <WritingEditor
            itemId={frag.id}
            content={frag.content}
            onChange={(html) => updateFragment(frag.id, { content: html })}
          />
        </div>

        {/* Tags & relations */}
        <div className="px-4 py-4 grid grid-cols-2 gap-3 shrink-0">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Characters</label>
            <TagInput
              tags={frag.relatedCharacters}
              onChange={(v) => updateFragment(frag.id, { relatedCharacters: v })}
              placeholder="Add character…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Places</label>
            <TagInput
              tags={frag.relatedPlaces}
              onChange={(v) => updateFragment(frag.id, { relatedPlaces: v })}
              placeholder="Add place…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Themes</label>
            <TagInput
              tags={frag.relatedThemes}
              onChange={(v) => updateFragment(frag.id, { relatedThemes: v })}
              placeholder="Add theme…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Tags</label>
            <TagInput
              tags={frag.tags}
              onChange={(v) => updateFragment(frag.id, { tags: v })}
              placeholder="Add tag…"
            />
          </div>
        </div>

        <div className="px-4 pb-3 shrink-0">
          <label className="text-xs text-gray-500 block mb-1">Possible Placement</label>
          <input
            value={frag.possiblePlacement}
            onChange={(e) => updateFragment(frag.id, { possiblePlacement: e.target.value })}
            placeholder="Where might this belong?"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
          />
        </div>

        {/* Attach to scene */}
        <div className="px-4 pb-4 border-t border-[#0f3460] pt-3 shrink-0">
          <button
            onClick={() => setShowAttach(!showAttach)}
            className="w-full py-1.5 rounded bg-[#6b46c1]/20 text-purple-300 hover:bg-[#6b46c1]/40 text-xs transition-colors text-left px-3"
          >
            📎 Attach to Scene (link without moving)
          </button>
          {showAttach && (
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  attachFragmentToScene(frag.id, e.target.value);
                  setShowAttach(false);
                }
              }}
              className="mt-1 w-full bg-[#16213e] border border-[#6b46c1] rounded px-2 py-1 text-gray-300 outline-none text-xs"
            >
              <option value="" disabled>
                Select a scene…
              </option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="px-4 pb-4 text-xs text-gray-600 shrink-0">
          Created {new Date(frag.createdAt).toLocaleString()} · Updated{' '}
          {new Date(frag.updatedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

// ─── Fragment Card ─────────────────────────────────────────────────────────────

function FragmentCard({
  frag,
  isSelected,
  isDragging,
  dropIndicator,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  frag: Fragment;
  isSelected: boolean;
  isDragging: boolean;
  dropIndicator: 'before' | 'after' | null;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const wordCount = useMemo(() => {
    const t = frag.content.replace(/<[^>]+>/g, ' ').trim();
    return t ? t.split(/\s+/).length : 0;
  }, [frag.content]);

  return (
    <div
      className={`relative border-b border-[#0f3460] transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dropIndicator === 'before' && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-purple-500 z-10" />
      )}
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onSelect}
        className={`flex items-start gap-2 px-2 py-2 cursor-pointer transition-colors ${
          isSelected ? 'bg-[#6b46c1]/20' : 'hover:bg-[#2d3748]'
        }`}
      >
        {/* Drag handle */}
        <span
          className="text-gray-600 hover:text-gray-400 text-sm mt-1 shrink-0 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={(e) => e.stopPropagation()}
        >
          ⠿
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: STATUS_COLORS[frag.status] }}
            />
            <span className="text-sm text-white truncate">{frag.title}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{TYPE_LABELS[frag.fragmentType]}</span>
            {wordCount > 0 && <span>· {wordCount}w</span>}
            {frag.tags.length > 0 && (
              <span className="truncate">
                · #{frag.tags[0]}
                {frag.tags.length > 1 ? ` +${frag.tags.length - 1}` : ''}
              </span>
            )}
          </div>
          {frag.content && (
            <p className="text-xs text-gray-600 mt-0.5 truncate leading-tight">
              {frag.content.replace(/<[^>]+>/g, ' ').slice(0, 80)}
            </p>
          )}
        </div>
      </div>
      {dropIndicator === 'after' && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500 z-10" />
      )}
    </div>
  );
}

// ─── Main View ─────────────────────────────────────────────────────────────────

interface PendingImport {
  file: File;
  fileBuffer?: ArrayBuffer;
  splitLevel: SplitLevel;
  parsedItems: ParsedItem[];
  defaultSection: 'manuscript' | 'fragments' | 'omitted';
}

export function FragmentsView() {
  const {
    fragments,
    addFragment,
    importToFragments,
    moveOmittedToFragments,
    sendSceneToFragments,
    reorderFragment,
    pendingSelectId,
    setPendingSelectId,
    setArea,
    setAIContextObject,
  } = useAppStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setAIContextObject(selectedId ? { type: 'fragment', id: selectedId } : null);
  }, [selectedId, setAIContextObject]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterText, setFilterText] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after'>('after');
  const [isExternalDragOver, setIsExternalDragOver] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const externalDragCounter = useRef(0);

  // Active fragments (not trashed)
  const activeFragments = useMemo(
    () => fragments.filter((f) => !f.trashedAt),
    [fragments],
  );

  const hasFilters = !!(filterStatus || filterType || filterText);

  const filtered = useMemo(() => {
    let list = activeFragments;
    if (filterStatus) list = list.filter((f) => f.status === filterStatus);
    if (filterType) list = list.filter((f) => f.fragmentType === filterType);
    if (filterText) {
      const lc = filterText.toLowerCase();
      list = list.filter(
        (f) =>
          f.title.toLowerCase().includes(lc) ||
          f.content.toLowerCase().includes(lc) ||
          f.tags.some((t) => t.toLowerCase().includes(lc)),
      );
    }
    // If filters active, sort by newest; otherwise keep array order
    if (hasFilters) return [...list].sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [activeFragments, filterStatus, filterType, filterText, hasFilters]);

  const selected = fragments.find((f) => f.id === selectedId) ?? null;

  useEffect(() => {
    if (pendingSelectId) {
      setSelectedId(pendingSelectId);
      setPendingSelectId(null);
    }
  }, [pendingSelectId, setPendingSelectId]);

  // ── Import ────────────────────────────────────────────────────────────────

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    e.currentTarget.value = '';

    let fileBuffer: ArrayBuffer | undefined;
    const isDocx = file.name.endsWith('.docx') || file.name.endsWith('.doc');
    if (isDocx) fileBuffer = await file.arrayBuffer();

    const splitLevel: SplitLevel = 1;
    const items = await parseFile(file, { splitLevel });

    if (items.length === 1 && !items[0].sourceHeading) {
      // Single item with no headings - skip preview, just import
      importToFragments([
        {
          title: items[0].title,
          content: items[0].content,
          importSource: {
            fileName: file.name.replace(/\.[^/.]+$/, ''),
            fileType: file.name.split('.').pop() ?? 'txt',
            importedAt: Date.now(),
          },
        },
      ]);
      return;
    }

    setPendingImport({
      file,
      fileBuffer,
      splitLevel,
      parsedItems: items,
      defaultSection: 'fragments',
    });
  }

  async function handleChangeSplitLevel(level: SplitLevel) {
    if (!pendingImport) return;
    const { file } = pendingImport;
    const items = await parseFile(file, { splitLevel: level });
    setPendingImport((prev) => prev ? { ...prev, splitLevel: level, parsedItems: items } : null);
  }

  function handleImportConfirm(
    items: ParsedItem[],
    section: 'manuscript' | 'fragments' | 'omitted',
  ) {
    const { file } = pendingImport!;
    const importSource: ImportSourceMeta = {
      fileName: file.name.replace(/\.[^/.]+$/, ''),
      fileType: file.name.split('.').pop() ?? 'txt',
      importedAt: Date.now(),
    };

    if (section === 'fragments') {
      importToFragments(
        items.map((i) => ({ ...i, importSource: { ...importSource, sourceHeading: i.sourceHeading } })),
      );
    } else if (section === 'omitted') {
      useAppStore.getState().importToOmitted(
        items.map((i) => ({ ...i, importSource: { ...importSource, sourceHeading: i.sourceHeading } })),
      );
      setArea('omitted');
    } else if (section === 'manuscript') {
      useAppStore.getState().importToManuscript(
        items.map((i) => ({ ...i, importSource: { ...importSource, sourceHeading: i.sourceHeading } })),
      );
      setArea('manuscript');
    }
    setPendingImport(null);
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  // Card drag handlers
  const handleCardDragStart = useCallback(
    (e: React.DragEvent, frag: Fragment) => {
      setDragData(e, 'fragment', frag.id, frag.title);
      setDraggingId(frag.id);
    },
    [],
  );

  const handleCardDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleCardDragOver = useCallback(
    (e: React.DragEvent, fragId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const dragType = getDragType(e);
      if (!dragType) return;
      if (dragType !== 'fragment') {
        setIsExternalDragOver(true);
        return;
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const pos: 'before' | 'after' =
        (e.clientY - rect.top) / rect.height < 0.5 ? 'before' : 'after';
      setDragOverId(fragId);
      setDragOverPos(pos);
    },
    [],
  );

  const handleCardDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleCardDrop = useCallback(
    (e: React.DragEvent, targetFragId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const data = parseDragData(e);
      if (!data) return;

      if (data.type === 'fragment') {
        if (data.id !== targetFragId) {
          reorderFragment(data.id, targetFragId, dragOverPos);
        }
      } else if (data.type === 'scene') {
        sendSceneToFragments(data.id);
      } else if (data.type === 'omitted') {
        moveOmittedToFragments(data.id);
      }

      setDragOverId(null);
      setIsExternalDragOver(false);
      externalDragCounter.current = 0;
    },
    [dragOverPos, reorderFragment, sendSceneToFragments, moveOmittedToFragments],
  );

  // Container-level drag handlers (for items dropped outside any card)
  function handleContainerDragEnter(e: React.DragEvent) {
    e.preventDefault();
    const dragType = getDragType(e);
    if (dragType && dragType !== 'fragment') {
      externalDragCounter.current++;
      setIsExternalDragOver(true);
    }
  }

  function handleContainerDragLeave() {
    externalDragCounter.current--;
    if (externalDragCounter.current <= 0) {
      externalDragCounter.current = 0;
      setIsExternalDragOver(false);
    }
  }

  function handleContainerDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleContainerDrop(e: React.DragEvent) {
    e.preventDefault();
    externalDragCounter.current = 0;
    setIsExternalDragOver(false);
    setDragOverId(null);

    const data = parseDragData(e);
    if (!data) return;

    if (data.type === 'scene') {
      sendSceneToFragments(data.id);
    } else if (data.type === 'omitted') {
      moveOmittedToFragments(data.id);
    }
    // fragment drops handled by card handlers
  }

  return (
    <>
      <div className="flex flex-1 overflow-hidden">
        {/* List panel */}
        <div className="w-72 shrink-0 bg-[#16213e] border-r border-[#0f3460] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-[#0f3460] shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Fragments
              </span>
              <div className="flex gap-1 items-center">
                <label
                  title="Import document into Fragments"
                  className="text-xs text-gray-400 hover:text-white px-1 cursor-pointer select-none"
                >
                  📥
                  <input
                    ref={uploadRef}
                    type="file"
                    multiple={false}
                    accept=".txt,.md,.html,.htm,.docx,.doc"
                    onChange={handleUpload}
                    className="hidden"
                  />
                </label>
                <GoogleDriveUpload targetSection="fragments" />
                <button
                  onClick={() => {
                    const id = addFragment();
                    setSelectedId(id);
                  }}
                  className="text-xs bg-[#6b46c1] text-white px-2 py-0.5 rounded hover:bg-[#553c9a] transition-colors"
                >
                  + New
                </button>
              </div>
            </div>

            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search fragments…"
              className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] mb-1"
            />

            <div className="flex gap-1">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 bg-[#1a1a2e] border border-[#2d3748] rounded px-1 py-0.5 text-xs text-gray-400 outline-none"
              >
                <option value="">All statuses</option>
                {(Object.keys(STATUS_COLORS) as FragmentStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="flex-1 bg-[#1a1a2e] border border-[#2d3748] rounded px-1 py-0.5 text-xs text-gray-400 outline-none"
              >
                <option value="">All types</option>
                {(Object.entries(TYPE_LABELS) as [FragmentType, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Drag-over zone for external items */}
          {isExternalDragOver && (
            <div className="mx-2 my-2 border-2 border-dashed border-purple-500 rounded p-3 text-center text-xs text-purple-300 bg-purple-900/20 shrink-0">
              Drop here to add to Fragments
            </div>
          )}

          {/* Fragment list */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto relative"
            onDragEnter={handleContainerDragEnter}
            onDragLeave={handleContainerDragLeave}
            onDragOver={handleContainerDragOver}
            onDrop={handleContainerDrop}
          >
            {filtered.length === 0 && !isExternalDragOver && (
              <div className="p-4 text-center text-gray-600">
                <div className="text-3xl mb-2">🧩</div>
                <p className="text-xs">No fragments yet.</p>
                <p className="text-xs mt-1">
                  Drag items here, click Import, or create a new one.
                </p>
              </div>
            )}

            {filtered.map((frag) => (
              <FragmentCard
                key={frag.id}
                frag={frag}
                isSelected={selectedId === frag.id}
                isDragging={draggingId === frag.id}
                dropIndicator={
                  dragOverId === frag.id && !hasFilters ? dragOverPos : null
                }
                onSelect={() => setSelectedId(frag.id)}
                onDragStart={(e) => handleCardDragStart(e, frag)}
                onDragEnd={handleCardDragEnd}
                onDragOver={(e) => !hasFilters && handleCardDragOver(e, frag.id)}
                onDragLeave={handleCardDragLeave}
                onDrop={(e) => handleCardDrop(e, frag.id)}
              />
            ))}
          </div>

          {/* Trash count hint */}
          {fragments.filter((f) => f.trashedAt).length > 0 && (
            <button
              onClick={() => setArea('trash')}
              className="px-3 py-2 border-t border-[#0f3460] text-xs text-gray-600 hover:text-gray-400 transition-colors text-left"
            >
              🗑 {fragments.filter((f) => f.trashedAt).length} in Trash
            </button>
          )}
        </div>

        {/* Detail panel */}
        {selected ? (
          <FragmentDetail
            key={selected.id}
            frag={selected}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            <div className="text-center">
              <div className="text-5xl mb-3">🧩</div>
              <p className="text-sm">Select a fragment to view and edit it.</p>
              <p className="text-xs mt-1 text-gray-700">
                Or drag scenes/omitted items here to add them.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Import preview modal */}
      {pendingImport && (
        <ImportPreviewModal
          key={pendingImport.splitLevel}
          fileName={pendingImport.file.name}
          fileType={pendingImport.file.name.split('.').pop() ?? 'file'}
          parsedItems={pendingImport.parsedItems}
          splitLevel={pendingImport.splitLevel}
          defaultSection={pendingImport.defaultSection}
          canChangeSplitLevel={
            pendingImport.file.name.endsWith('.docx') ||
            pendingImport.file.name.endsWith('.doc') ||
            pendingImport.file.name.endsWith('.md') ||
            pendingImport.file.name.endsWith('.html') ||
            pendingImport.file.name.endsWith('.htm')
          }
          onChangeSplitLevel={handleChangeSplitLevel}
          onConfirm={handleImportConfirm}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </>
  );
}
