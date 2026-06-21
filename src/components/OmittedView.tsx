import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { TagInput } from './TagInput';
import { WritingEditor } from './WritingEditor';
import { ImportPreviewModal } from './ImportPreviewModal';
import { GoogleDriveUpload } from './GoogleDriveUpload';
import { parseFile } from '../utils/documentParser';
import type { ParsedItem, SplitLevel } from '../utils/documentParser';
import type { OmittedMaterial, OmissionStatus, ImportSourceMeta } from '../types';

const STATUS_LABELS: Record<OmissionStatus, string> = {
  cut: 'Cut',
  saved_for_later: 'Saved for Later',
  alternate_version: 'Alternate Version',
  duplicate: 'Duplicate',
  research_only: 'Research Only',
  structurally_homeless: 'Structurally Homeless',
  restored: 'Restored',
};

const STATUS_COLORS: Record<OmissionStatus, string> = {
  cut: '#fc8181',
  saved_for_later: '#f6ad55',
  alternate_version: '#b794f4',
  duplicate: '#63b3ed',
  research_only: '#68d391',
  structurally_homeless: '#f6e05e',
  restored: '#68d391',
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

// ─── Omitted Detail ───────────────────────────────────────────────────────────

function OmittedDetail({
  item,
  onClose,
}: {
  item: OmittedMaterial;
  onClose: () => void;
}) {
  const {
    updateOmittedMaterial,
    trashOmitted,
    moveOmittedToFragments,
    restoreOmittedToScene,
    setArea,
  } = useAppStore();

  const [showMoveMenu, setShowMoveMenu] = useState(false);

  const wordCount = useMemo(() => {
    const text = item.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text ? text.split(/\s+/).length : 0;
  }, [item.content]);

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
          value={item.omissionStatus}
          onChange={(e) =>
            updateOmittedMaterial(item.id, {
              omissionStatus: e.target.value as OmissionStatus,
            })
          }
          className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
        >
          {(Object.entries(STATUS_LABELS) as [OmissionStatus, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {/* Move menu */}
        <div className="relative">
          <button
            onClick={() => setShowMoveMenu(!showMoveMenu)}
            className="text-xs bg-[#2d3748] hover:bg-[#3d4a5e] text-gray-300 px-2 py-0.5 rounded transition-colors"
          >
            Restore ▾
          </button>
          {showMoveMenu && (
            <div className="absolute right-0 top-full mt-1 bg-[#1a1a2e] border border-[#2d3748] rounded shadow-xl z-20 min-w-max">
              <button
                onClick={() => {
                  const newId = restoreOmittedToScene(item.id, 'manuscript');
                  if (newId) {
                    setShowMoveMenu(false);
                    onClose();
                    setArea('manuscript');
                  }
                }}
                className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#6b46c1]/30 transition-colors"
              >
                📖 Restore to Manuscript
              </button>
              <button
                onClick={() => {
                  moveOmittedToFragments(item.id);
                  setShowMoveMenu(false);
                  onClose();
                  setArea('fragments');
                }}
                className="block w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-[#6b46c1]/30 transition-colors"
              >
                🧩 Move to Fragments
              </button>
              <div className="border-t border-[#2d3748] my-1" />
              <button
                onClick={() => {
                  trashOmitted(item.id);
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
            value={item.title}
            onChange={(e) => updateOmittedMaterial(item.id, { title: e.target.value })}
            className="w-full text-xl font-semibold text-white bg-transparent border-b border-[#2d3748] pb-1 outline-none focus:border-[#6b46c1] transition-colors"
            placeholder="Title…"
          />
          {item.sourceSceneTitle && (
            <p className="text-xs text-gray-600 mt-1">
              Originally from: <span className="text-gray-400">{item.sourceSceneTitle}</span>
            </p>
          )}
          {item.importSource && (
            <p className="text-xs text-gray-600 mt-1">
              Imported from{' '}
              <span className="text-gray-500 font-mono">{item.importSource.fileName}</span>
              {item.importSource.sourceHeading && (
                <> · heading: <em>{item.importSource.sourceHeading}</em></>
              )}
            </p>
          )}
        </div>

        {/* Reason */}
        <div className="px-4 pb-3 shrink-0">
          <label className="text-xs text-gray-500 block mb-1">Reason for Omission</label>
          <input
            value={item.reason}
            onChange={(e) => updateOmittedMaterial(item.id, { reason: e.target.value })}
            placeholder="Why was this cut?"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
          />
        </div>

        {/* Rich content editor */}
        <div className="flex-1 flex flex-col min-h-[300px] border-t border-b border-[#0f3460]">
          <WritingEditor
            itemId={item.id}
            content={item.content}
            onChange={(html) => updateOmittedMaterial(item.id, { content: html })}
          />
        </div>

        {/* Tags & relations */}
        <div className="px-4 py-4 grid grid-cols-2 gap-3 shrink-0">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Characters</label>
            <TagInput
              tags={item.relatedCharacters}
              onChange={(v) => updateOmittedMaterial(item.id, { relatedCharacters: v })}
              placeholder="Add character…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Themes</label>
            <TagInput
              tags={item.relatedThemes}
              onChange={(v) => updateOmittedMaterial(item.id, { relatedThemes: v })}
              placeholder="Add theme…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Locations</label>
            <TagInput
              tags={item.relatedLocations}
              onChange={(v) => updateOmittedMaterial(item.id, { relatedLocations: v })}
              placeholder="Add location…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Tags</label>
            <TagInput
              tags={item.tags}
              onChange={(v) => updateOmittedMaterial(item.id, { tags: v })}
              placeholder="Add tag…"
            />
          </div>
        </div>

        <div className="px-4 pb-3 shrink-0">
          <label className="text-xs text-gray-500 block mb-1">Notes</label>
          <textarea
            value={item.notes}
            onChange={(e) => updateOmittedMaterial(item.id, { notes: e.target.value })}
            rows={3}
            placeholder="Private notes about this material…"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-3 py-2 text-gray-300 text-xs outline-none focus:border-[#6b46c1] resize-none placeholder-gray-600"
          />
        </div>

        <div className="px-4 pb-4 text-xs text-gray-600 shrink-0">
          Omitted {new Date(item.omissionDate).toLocaleString()} · Updated{' '}
          {new Date(item.updatedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

// ─── Omitted Card ─────────────────────────────────────────────────────────────

function OmittedCard({
  item,
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
  item: OmittedMaterial;
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
    const t = item.content.replace(/<[^>]+>/g, ' ').trim();
    return t ? t.split(/\s+/).length : 0;
  }, [item.content]);

  return (
    <div
      className={`relative border-b border-[#0f3460] transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dropIndicator === 'before' && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-500 z-10" />
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
        <span className="text-gray-600 hover:text-gray-400 text-sm mt-1 shrink-0 cursor-grab active:cursor-grabbing select-none">
          ⠿
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: STATUS_COLORS[item.omissionStatus] }}
            />
            <span className="text-sm text-white truncate">{item.title}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{STATUS_LABELS[item.omissionStatus]}</span>
            {wordCount > 0 && <span>· {wordCount}w</span>}
            {item.sourceSceneTitle && (
              <span className="truncate">· from "{item.sourceSceneTitle}"</span>
            )}
          </div>
          {item.reason && (
            <p className="text-xs text-gray-600 mt-0.5 truncate leading-tight">{item.reason}</p>
          )}
        </div>
      </div>
      {dropIndicator === 'after' && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 z-10" />
      )}
    </div>
  );
}

// ─── Main View ─────────────────────────────────────────────────────────────────

interface PendingImport {
  file: File;
  splitLevel: SplitLevel;
  parsedItems: ParsedItem[];
  defaultSection: 'manuscript' | 'fragments' | 'omitted';
}

export function OmittedView() {
  const {
    omittedMaterial,
    addOmittedMaterial,
    importToOmitted,
    importToFragments,
    importToManuscript,
    sendSceneToOmitted,
    moveFragmentToOmitted,
    reorderOmitted,
    pendingSelectId,
    setPendingSelectId,
    setArea,
    setAIContextObject,
  } = useAppStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setAIContextObject(selectedId ? { type: 'omitted_material', id: selectedId } : null);
  }, [selectedId, setAIContextObject]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterText, setFilterText] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after'>('after');
  const [isExternalDragOver, setIsExternalDragOver] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const externalDragCounter = useRef(0);

  const activeOmitted = useMemo(
    () => omittedMaterial.filter((o) => !o.trashedAt),
    [omittedMaterial],
  );

  const hasFilters = !!(filterStatus || filterText);

  const filtered = useMemo(() => {
    let list = activeOmitted;
    if (filterStatus) list = list.filter((o) => o.omissionStatus === filterStatus);
    if (filterText) {
      const lc = filterText.toLowerCase();
      list = list.filter(
        (o) =>
          o.title.toLowerCase().includes(lc) ||
          o.content.toLowerCase().includes(lc) ||
          o.reason.toLowerCase().includes(lc) ||
          o.tags.some((t) => t.toLowerCase().includes(lc)),
      );
    }
    if (hasFilters) return [...list].sort((a, b) => b.omissionDate - a.omissionDate);
    return list;
  }, [activeOmitted, filterStatus, filterText, hasFilters]);

  const selected = omittedMaterial.find((o) => o.id === selectedId) ?? null;

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

    const splitLevel: SplitLevel = 1;
    const items = await parseFile(file, { splitLevel });

    if (items.length === 1 && !items[0].sourceHeading) {
      importToOmitted([
        {
          title: items[0].title,
          content: items[0].content,
          reason: 'Imported as omitted material',
          importSource: {
            fileName: file.name.replace(/\.[^/.]+$/, ''),
            fileType: file.name.split('.').pop() ?? 'txt',
            importedAt: Date.now(),
          },
        },
      ]);
      return;
    }

    setPendingImport({ file, splitLevel, parsedItems: items, defaultSection: 'omitted' });
  }

  async function handleChangeSplitLevel(level: SplitLevel) {
    if (!pendingImport) return;
    const items = await parseFile(pendingImport.file, { splitLevel: level });
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

    if (section === 'omitted') {
      importToOmitted(
        items.map((i) => ({
          ...i,
          reason: 'Imported as omitted material',
          importSource: { ...importSource, sourceHeading: i.sourceHeading },
        })),
      );
    } else if (section === 'fragments') {
      importToFragments(
        items.map((i) => ({ ...i, importSource: { ...importSource, sourceHeading: i.sourceHeading } })),
      );
      setArea('fragments');
    } else if (section === 'manuscript') {
      importToManuscript(
        items.map((i) => ({ ...i, importSource: { ...importSource, sourceHeading: i.sourceHeading } })),
      );
      setArea('manuscript');
    }
    setPendingImport(null);
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  const handleCardDragStart = useCallback(
    (e: React.DragEvent, item: OmittedMaterial) => {
      setDragData(e, 'omitted', item.id, item.title);
      setDraggingId(item.id);
    },
    [],
  );

  const handleCardDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleCardDragOver = useCallback(
    (e: React.DragEvent, itemId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const dragType = getDragType(e);
      if (!dragType) return;
      if (dragType !== 'omitted') {
        setIsExternalDragOver(true);
        return;
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const pos: 'before' | 'after' =
        (e.clientY - rect.top) / rect.height < 0.5 ? 'before' : 'after';
      setDragOverId(itemId);
      setDragOverPos(pos);
    },
    [],
  );

  const handleCardDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleCardDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const data = parseDragData(e);
      if (!data) return;

      if (data.type === 'omitted') {
        if (data.id !== targetId) {
          reorderOmitted(data.id, targetId, dragOverPos);
        }
      } else if (data.type === 'scene') {
        const reason = prompt('Reason for omitting (optional):') ?? '';
        if (reason !== null) sendSceneToOmitted(data.id, reason);
      } else if (data.type === 'fragment') {
        const reason = prompt('Reason for omitting (optional):') ?? '';
        if (reason !== null) moveFragmentToOmitted(data.id, reason);
      }

      setDragOverId(null);
      setIsExternalDragOver(false);
      externalDragCounter.current = 0;
    },
    [dragOverPos, reorderOmitted, sendSceneToOmitted, moveFragmentToOmitted],
  );

  function handleContainerDragEnter(e: React.DragEvent) {
    e.preventDefault();
    const dragType = getDragType(e);
    if (dragType && dragType !== 'omitted') {
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
      const reason = prompt('Reason for omitting (optional):') ?? '';
      if (reason !== null) sendSceneToOmitted(data.id, reason);
    } else if (data.type === 'fragment') {
      const reason = prompt('Reason for omitting (optional):') ?? '';
      if (reason !== null) moveFragmentToOmitted(data.id, reason);
    }
  }

  return (
    <>
      <div className="flex flex-1 overflow-hidden">
        {/* List panel */}
        <div className="w-72 shrink-0 bg-[#16213e] border-r border-[#0f3460] flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-[#0f3460] shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Omitted Material
              </span>
              <div className="flex gap-1 items-center">
                <label
                  title="Import document into Omitted Material"
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
                <GoogleDriveUpload targetSection="omitted" />
                <button
                  onClick={() => {
                    const id = addOmittedMaterial();
                    setSelectedId(id);
                  }}
                  className="text-xs bg-[#6b46c1] text-white px-2 py-0.5 rounded hover:bg-[#553c9a]"
                >
                  + New
                </button>
              </div>
            </div>
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search omitted…"
              className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] mb-1"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-400 outline-none"
            >
              <option value="">All statuses</option>
              {(Object.entries(STATUS_LABELS) as [OmissionStatus, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {isExternalDragOver && (
            <div className="mx-2 my-2 border-2 border-dashed border-amber-500 rounded p-3 text-center text-xs text-amber-300 bg-amber-900/20 shrink-0">
              Drop here to add to Omitted Material
            </div>
          )}

          <div
            className="flex-1 overflow-y-auto relative"
            onDragEnter={handleContainerDragEnter}
            onDragLeave={handleContainerDragLeave}
            onDragOver={handleContainerDragOver}
            onDrop={handleContainerDrop}
          >
            {filtered.length === 0 && !isExternalDragOver && (
              <div className="p-4 text-center text-gray-600">
                <div className="text-3xl mb-2">🗂️</div>
                <p className="text-xs">No omitted material yet.</p>
                <p className="text-xs mt-1 text-gray-700">
                  Drag scenes or fragments here to archive them.
                </p>
              </div>
            )}

            {filtered.map((item) => (
              <OmittedCard
                key={item.id}
                item={item}
                isSelected={selectedId === item.id}
                isDragging={draggingId === item.id}
                dropIndicator={
                  dragOverId === item.id && !hasFilters ? dragOverPos : null
                }
                onSelect={() => setSelectedId(item.id)}
                onDragStart={(e) => handleCardDragStart(e, item)}
                onDragEnd={handleCardDragEnd}
                onDragOver={(e) => !hasFilters && handleCardDragOver(e, item.id)}
                onDragLeave={handleCardDragLeave}
                onDrop={(e) => handleCardDrop(e, item.id)}
              />
            ))}
          </div>

          {omittedMaterial.filter((o) => o.trashedAt).length > 0 && (
            <button
              onClick={() => setArea('trash')}
              className="px-3 py-2 border-t border-[#0f3460] text-xs text-gray-600 hover:text-gray-400 transition-colors text-left"
            >
              🗑 {omittedMaterial.filter((o) => o.trashedAt).length} in Trash
            </button>
          )}
        </div>

        {/* Detail panel */}
        {selected ? (
          <OmittedDetail
            key={selected.id}
            item={selected}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            <div className="text-center">
              <div className="text-5xl mb-3">🗂️</div>
              <p className="text-sm">Select an item to view or restore it.</p>
              <p className="text-xs mt-1 text-gray-700">
                Drag scenes or fragments here to archive them.
              </p>
            </div>
          </div>
        )}
      </div>

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
