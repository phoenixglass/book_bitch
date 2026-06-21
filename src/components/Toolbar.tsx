import { useState } from 'react';
import { useAppStore, totalWordCount } from '../store/appStore';
import { EditorSettingsDialog } from './EditorSettingsDialog';
import type { ViewMode } from '../types';

const MANUSCRIPT_MODES: { label: string; value: ViewMode; icon: string }[] = [
  { label: 'Editor', value: 'editor', icon: '✏️' },
  { label: 'Cards', value: 'scene-cards', icon: '🃏' },
  { label: 'Corkboard', value: 'corkboard', icon: '📌' },
  { label: 'Outline', value: 'outline', icon: '📋' },
  { label: 'Timeline', value: 'timeline', icon: '📅' },
  { label: 'Map', value: 'structural-map', icon: '📊' },
  { label: 'Dashboard', value: 'dashboard', icon: '📈' },
];

export function Toolbar() {
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
  } = useAppStore();

  const [formatOpen, setFormatOpen] = useState(false);
  const totalWords = totalWordCount(binder);
  const pct = projectTarget.wordTarget > 0
    ? Math.min(100, Math.round((totalWords / projectTarget.wordTarget) * 100))
    : 0;

  if (compositionMode) return null;

  return (
    <>
    {formatOpen && <EditorSettingsDialog onClose={() => setFormatOpen(false)} />}
    <div className="flex items-center gap-2 px-3 h-11 bg-[#16213e] border-b border-[#0f3460] shrink-0 select-none">
      {/* Project title */}
      <input
        value={projectTitle}
        onChange={(e) => setProjectTitle(e.target.value)}
        className="bg-transparent text-white font-semibold text-sm w-40 outline-none border-b border-transparent hover:border-[#6b46c1] focus:border-[#6b46c1] transition-colors"
      />

      <div className="w-px h-6 bg-[#0f3460] mx-1" />

      {/* Manuscript view modes */}
      {area === 'manuscript' && (
        <div className="flex gap-1">
          {MANUSCRIPT_MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setViewMode(m.value)}
              title={m.label}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                viewMode === m.value
                  ? 'bg-[#6b46c1] text-white'
                  : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
              }`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="w-px h-6 bg-[#0f3460] mx-1" />

      {/* Word count */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span>{totalWords.toLocaleString()} words</span>
        {projectTarget.wordTarget > 0 && (
          <div className="flex items-center gap-1">
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

      {/* Split screen */}
      {area === 'manuscript' && viewMode === 'editor' && (
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

      {/* Format settings */}
      {area === 'manuscript' && viewMode === 'editor' && (
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

      {/* Inspector toggle */}
      {area === 'manuscript' && (
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
