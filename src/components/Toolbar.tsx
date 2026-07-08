import { useState, useRef } from 'react';
import { useAppStore, totalWordCount } from '../store/appStore';
import { EditorSettingsDialog } from './EditorSettingsDialog';
import { FindReplaceDialog } from './FindReplaceDialog';
import { useSyncContext } from '../hooks/useSyncContext';
import { ProjectSwitcher } from './ProjectSwitcher';
import { VersionHistoryDialog } from './VersionHistoryDialog';
import { useIsMobile } from '../hooks/useIsMobile';
import type { ViewMode } from '../types';
import type { MouseEvent } from 'react';

const MANUSCRIPT_MODES: { label: string; value: ViewMode; icon: string }[] = [
  { label: 'Editor', value: 'editor', icon: '✏️' },
  { label: 'Cards', value: 'scene-cards', icon: '🃏' },
  { label: 'Corkboard', value: 'corkboard', icon: '📌' },
  { label: 'Outline', value: 'outline', icon: '📋' },
  { label: 'Timeline', value: 'timeline', icon: '📅' },
  { label: 'Map', value: 'structural-map', icon: '📊' },
  { label: 'Dashboard', value: 'dashboard', icon: '📈' },
];

interface ToolbarProps {
  onOpenBinder?: () => void;
}

export function Toolbar({ onOpenBinder }: ToolbarProps) {
  const {
    projectTitle, setProjectTitle,
    viewMode, setViewMode,
    area,
    compositionMode, setCompositionMode,
    inspectorOpen, setInspectorOpen,
    splitScreenOpen, setSplitScreen,
    binder, projectTarget,
    setSearchOpen,
    aiSettings,
    aiPanelOpen, setAIPanelOpen,
    exportProjectBackup,
    importProjectBackup,
    styleCheckOpen, setStyleCheckOpen,
  } = useAppStore();

  const { user, syncStatus, cloudError, signOut, forceReloadFromCloud } = useSyncContext();
  const [formatOpen, setFormatOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  function handleImportBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const json = ev.target?.result as string;
      if (json) importProjectBackup(json);
    };
    reader.readAsText(file);
    e.target.value = '';
  }
  const totalWords = totalWordCount(binder.filter(b => b.id !== 'research' && b.id !== 'trash'));
  const pct = projectTarget.wordTarget > 0
    ? Math.min(100, Math.round((totalWords / projectTarget.wordTarget) * 100))
    : 0;

  if (compositionMode) return null;

  return (
    <>
    {formatOpen && <EditorSettingsDialog onClose={() => setFormatOpen(false)} />}
    {replaceOpen && <FindReplaceDialog onClose={() => setReplaceOpen(false)} />}
    {historyOpen && <VersionHistoryDialog onClose={() => setHistoryOpen(false)} />}
    <div className="flex items-center gap-2 px-3 h-11 bg-[#16213e] border-b border-[#0f3460] shrink-0 select-none overflow-x-auto">
      {/* Mobile: binder toggle */}
      {isMobile && area === 'manuscript' && onOpenBinder && (
        <button
          onClick={onOpenBinder}
          title="Open Binder"
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors text-lg"
        >
          ☰
        </button>
      )}

      {/* Project switcher — desktop only, requires cloud sign-in */}
      {!isMobile && <ProjectSwitcher />}

      {/* Project title */}
      <input
        value={projectTitle}
        onChange={(e) => setProjectTitle(e.target.value)}
        className="bg-transparent text-white font-semibold text-sm w-32 shrink-0 outline-none border-b border-transparent hover:border-[#6b46c1] focus:border-[#6b46c1] transition-colors"
      />

      <div className="w-px h-6 bg-[#0f3460] mx-1 shrink-0" />

      {/* Manuscript view modes */}
      {area === 'manuscript' && (
        <div className="flex gap-1 shrink-0">
          {MANUSCRIPT_MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setViewMode(m.value)}
              title={m.label}
              className={`px-2 py-1 rounded text-xs transition-colors whitespace-nowrap ${
                viewMode === m.value
                  ? 'bg-[#6b46c1] text-white'
                  : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
              }`}
            >
              {m.icon}<span className="hidden sm:inline ml-1">{m.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="w-px h-6 bg-[#0f3460] mx-1 shrink-0" />

      {/* Word count */}
      <div className="flex items-center gap-2 text-xs text-gray-400 shrink-0">
        <span>{totalWords.toLocaleString()} words</span>
        {projectTarget.wordTarget > 0 && (
          <div className="hidden sm:flex items-center gap-1">
            <div className="w-20 h-2 bg-[#2d3748] rounded-full overflow-hidden">
              <div className="h-full bg-[#6b46c1] transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span>{pct}%</span>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Search */}
      <button
        onClick={() => setSearchOpen(true)}
        title="Global Search (Ctrl+K)"
        className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
      >
        🔍
      </button>

      {/* Find & Replace — desktop only */}
      {!isMobile && (
        <button
          onClick={() => setReplaceOpen(true)}
          title="Find & Replace across the whole binder"
          className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
        >
          🔁
        </button>
      )}

      {/* Style check toggle — desktop only, manuscript editor */}
      {!isMobile && area === 'manuscript' && viewMode === 'editor' && (
        <button
          onClick={() => setStyleCheckOpen(!styleCheckOpen)}
          title={styleCheckOpen ? 'Close Style Check' : 'Style Check (filter words & repeats)'}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            styleCheckOpen ? 'bg-[#6b46c1] text-white' : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
          }`}
        >
          🩺
        </button>
      )}

      {/* Split screen — desktop only */}
      {!isMobile && area === 'manuscript' && viewMode === 'editor' && (
        <button
          onClick={() => setSplitScreen(!splitScreenOpen)}
          title="Split-screen reference mode"
          className={`px-2 py-1 rounded text-xs transition-colors ${
            splitScreenOpen ? 'bg-[#6b46c1] text-white' : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
          }`}
        >
          ⎇ Split
        </button>
      )}

      {/* AI panel toggle */}
      <button
        onClick={() => setAIPanelOpen(!aiPanelOpen)}
        title={aiPanelOpen ? 'Close AI panel' : 'Open AI Assistant'}
        className={`px-2 py-1 rounded text-xs transition-colors ${
          aiPanelOpen
            ? 'bg-purple-700 text-white'
            : aiSettings.mode !== 'disabled'
            ? 'text-purple-400 hover:text-white hover:bg-[#2d3748]'
            : 'text-gray-600 hover:text-gray-400 hover:bg-[#2d3748]'
        }`}
      >
        ✦<span className="ml-1 hidden sm:inline">AI</span>
      </button>

      {/* Format settings — desktop only */}
      {!isMobile && ((area === 'manuscript' && viewMode === 'editor') || area === 'fragments' || area === 'omitted') && (
        <button
          onClick={() => setFormatOpen(true)}
          title="Paragraph & Font Settings"
          className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
        >
          Aa Format
        </button>
      )}

      {/* Composition mode */}
      {area === 'manuscript' && (
        <button
          onClick={() => setCompositionMode(true)}
          title="Focus mode (full screen)"
          className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
        >
          ⛶ Focus
        </button>
      )}

      {/* Sync status + sign out — desktop only */}
      {!isMobile && user && (
        <div className="flex items-center gap-2 text-xs">
          {syncStatus === 'saving' && <span className="text-yellow-400 animate-pulse">↑ Saving…</span>}
          {syncStatus === 'saved' && <span className="text-green-400">✓ Saved</span>}
          {syncStatus === 'error' && (
            <button
              onClick={(e: MouseEvent) => {
                e.preventDefault();
                forceReloadFromCloud();
              }}
              title={`Sync error: ${cloudError ?? 'unknown'}. Click to retry.`}
              className="text-red-400 hover:text-red-300 underline cursor-pointer"
            >
              ⚠ Sync error — retry
            </button>
          )}
          <button
            onClick={signOut}
            title={`Signed in as ${user.email}`}
            className="px-2 py-1 rounded text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
          >
            {user.email?.split('@')[0]} ↩
          </button>
        </div>
      )}

      {/* Mobile: compact sync indicator */}
      {isMobile && user && (
        <div className="text-xs shrink-0">
          {syncStatus === 'saving' && <span className="text-yellow-400">↑</span>}
          {syncStatus === 'saved' && <span className="text-green-400">✓</span>}
          {syncStatus === 'error' && (
            <button
              onClick={(e: MouseEvent) => { e.preventDefault(); forceReloadFromCloud(); }}
              title="Sync error — tap to retry"
              className="text-red-400"
            >
              ⚠
            </button>
          )}
        </div>
      )}

      {/* Backup import/export — desktop only */}
      {!isMobile && (
        <>
          <input
            ref={backupInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportBackup}
          />
          <button
            onClick={() => backupInputRef.current?.click()}
            title="Import project from JSON backup"
            className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
          >
            ↑ Import
          </button>
          <button
            onClick={exportProjectBackup}
            title="Export project as JSON backup"
            className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
          >
            ↓ Export
          </button>
          {user && (
            <button
              onClick={() => setHistoryOpen(true)}
              title="Restore a previous version of this project"
              className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
            >
              🕓 History
            </button>
          )}
        </>
      )}

      {/* Inspector toggle — desktop only */}
      {!isMobile && area === 'manuscript' && (
        <button
          onClick={() => setInspectorOpen(!inspectorOpen)}
          title="Toggle Inspector"
          className={`px-2 py-1 rounded text-xs transition-colors ${
            inspectorOpen ? 'bg-[#6b46c1] text-white' : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
          }`}
        >
          ℹ Inspector
        </button>
      )}
    </div>
    </>
  );
}
