import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { AppArea } from '../types';

const BB_ITEM_TYPE = 'application/x-bb-item';
const BB_TYPE_KEY = 'text/x-bb-type';

const NAV_ITEMS: { area: AppArea; icon: string; label: string }[] = [
  { area: 'manuscript', icon: '📖', label: 'Manuscript' },
  { area: 'fragments', icon: '🧩', label: 'Fragments' },
  { area: 'omitted', icon: '🗂️', label: 'Omitted' },
  { area: 'notebook', icon: '📓', label: 'Notebook' },
  { area: 'codex', icon: '📚', label: 'Codex' },
  { area: 'questions', icon: '❓', label: 'Questions' },
  { area: 'moodboard', icon: '🖼️', label: 'Moodboard' },
  { area: 'history', icon: '🕰️', label: 'History' },
];

// Which drag types each nav area accepts as a drop target
const NAV_DROP_ACCEPTS: Partial<Record<AppArea, string[]>> = {
  manuscript: ['fragment', 'omitted'],
  fragments: ['scene', 'omitted'],
  omitted: ['scene', 'fragment'],
};

function parseDragData(e: React.DragEvent): { type: string; id: string } | null {
  try {
    const raw = e.dataTransfer.getData(BB_ITEM_TYPE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getDragTypeFromEvent(e: React.DragEvent): string | null {
  for (const t of ['fragment', 'scene', 'omitted']) {
    if (e.dataTransfer.types.includes(`${BB_TYPE_KEY}-${t}`)) return t;
  }
  return null;
}

export function SideNav() {
  const {
    area,
    setArea,
    setSearchOpen,
    questions,
    fragments,
    omittedMaterial,
    trashFragment,
    trashOmitted,
    removeItem,
    sendSceneToFragments,
    sendSceneToOmitted,
    moveFragmentToManuscript,
    moveFragmentToOmitted,
    moveOmittedToManuscript,
    moveOmittedToFragments,
  } = useAppStore();

  const [trashDragOver, setTrashDragOver] = useState(false);
  const [dragOverArea, setDragOverArea] = useState<AppArea | null>(null);

  const openQuestionCount = questions.filter((q) => q.questionStatus === 'open').length;
  const unsortedFragmentCount = fragments.filter(
    (f) => f.status === 'unsorted' && !f.trashedAt,
  ).length;
  const totalTrashCount =
    (useAppStore.getState().binder.find((b) => b.id === 'trash')?.children.length ?? 0) +
    fragments.filter((f) => f.trashedAt).length +
    omittedMaterial.filter((o) => o.trashedAt).length;

  function handleTrashDragEnter(e: React.DragEvent) {
    e.preventDefault();
    const type = getDragTypeFromEvent(e);
    if (type) setTrashDragOver(true);
  }

  function handleTrashDragLeave() {
    setTrashDragOver(false);
  }

  function handleTrashDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleTrashDrop(e: React.DragEvent) {
    e.preventDefault();
    setTrashDragOver(false);
    const data = parseDragData(e);
    if (!data) {
      // Fallback: text/plain = binder item ID
      const id = e.dataTransfer.getData('text/plain');
      if (id) removeItem(id);
      return;
    }
    if (data.type === 'fragment') {
      trashFragment(data.id);
    } else if (data.type === 'omitted') {
      trashOmitted(data.id);
    } else if (data.type === 'scene') {
      removeItem(data.id);
    }
  }

  function handleNavDragEnter(e: React.DragEvent, navArea: AppArea) {
    const accepted = NAV_DROP_ACCEPTS[navArea];
    if (!accepted) return;
    const type = getDragTypeFromEvent(e);
    if (type && accepted.includes(type)) {
      e.preventDefault();
      setDragOverArea(navArea);
    }
  }

  function handleNavDragOver(e: React.DragEvent, navArea: AppArea) {
    const accepted = NAV_DROP_ACCEPTS[navArea];
    if (!accepted) return;
    const type = getDragTypeFromEvent(e);
    if (type && accepted.includes(type)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }

  function handleNavDragLeave() {
    setDragOverArea(null);
  }

  function handleNavDrop(e: React.DragEvent, navArea: AppArea) {
    e.preventDefault();
    setDragOverArea(null);
    const data = parseDragData(e);
    if (!data) return;

    if (navArea === 'fragments') {
      if (data.type === 'scene') {
        sendSceneToFragments(data.id);
        setArea('fragments');
      } else if (data.type === 'omitted') {
        moveOmittedToFragments(data.id);
        setArea('fragments');
      }
    } else if (navArea === 'omitted') {
      if (data.type === 'scene') {
        sendSceneToOmitted(data.id, '');
        setArea('omitted');
      } else if (data.type === 'fragment') {
        moveFragmentToOmitted(data.id, '');
        setArea('omitted');
      }
    } else if (navArea === 'manuscript') {
      if (data.type === 'fragment') {
        moveFragmentToManuscript(data.id, 'manuscript');
        setArea('manuscript');
      } else if (data.type === 'omitted') {
        moveOmittedToManuscript(data.id, 'manuscript');
        setArea('manuscript');
      }
    }
  }

  return (
    <div className="w-14 shrink-0 bg-[#0d1117] border-r border-[#0f3460] flex flex-col items-center py-2 gap-1 select-none overflow-y-auto">
      {NAV_ITEMS.map((navItem) => {
        const isDropTarget = !!NAV_DROP_ACCEPTS[navItem.area];
        const isDragOver = dragOverArea === navItem.area;
        return (
          <button
            key={navItem.area}
            title={navItem.label}
            onClick={() => setArea(navItem.area)}
            onDragEnter={isDropTarget ? (e) => handleNavDragEnter(e, navItem.area) : undefined}
            onDragOver={isDropTarget ? (e) => handleNavDragOver(e, navItem.area) : undefined}
            onDragLeave={isDropTarget ? handleNavDragLeave : undefined}
            onDrop={isDropTarget ? (e) => handleNavDrop(e, navItem.area) : undefined}
            className={`relative w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-colors ${
              isDragOver
                ? 'bg-purple-700 text-white ring-2 ring-purple-400'
                : area === navItem.area
                ? 'bg-[#6b46c1] text-white'
                : 'text-gray-500 hover:text-gray-200 hover:bg-[#2d3748]'
            }`}
          >
            {navItem.icon}
            {navItem.area === 'questions' && openQuestionCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-black text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {openQuestionCount > 9 ? '9+' : openQuestionCount}
              </span>
            )}
            {navItem.area === 'fragments' && unsortedFragmentCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {unsortedFragmentCount > 9 ? '9+' : unsortedFragmentCount}
              </span>
            )}
          </button>
        );
      })}

      <div className="flex-1" />

      {/* Search */}
      <button
        title="Global Search (Ctrl+K)"
        onClick={() => setSearchOpen(true)}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-xl text-gray-500 hover:text-gray-200 hover:bg-[#2d3748] transition-colors"
      >
        🔍
      </button>

      {/* Trash drop target */}
      <button
        title="Trash — drag items here to trash them"
        onClick={() => setArea('trash')}
        onDragEnter={handleTrashDragEnter}
        onDragLeave={handleTrashDragLeave}
        onDragOver={handleTrashDragOver}
        onDrop={handleTrashDrop}
        className={`relative w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-colors ${
          area === 'trash'
            ? 'bg-[#6b46c1] text-white'
            : trashDragOver
            ? 'bg-red-900/60 text-red-300 ring-2 ring-red-500'
            : 'text-gray-500 hover:text-gray-200 hover:bg-[#2d3748]'
        }`}
      >
        🗑
        {totalTrashCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {totalTrashCount > 9 ? '9+' : totalTrashCount}
          </span>
        )}
      </button>
    </div>
  );
}
