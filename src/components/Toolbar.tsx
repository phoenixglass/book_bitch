import { useState } from 'react';
import { useAppStore, totalWordCount } from '../store/appStore';
import type { ViewMode, AIMode } from '../types';

const MANUSCRIPT_MODES: { label: string; value: ViewMode; icon: string }[] = [
  { label: 'Editor', value: 'editor', icon: '✏️' },
  { label: 'Cards', value: 'scene-cards', icon: '🃏' },
  { label: 'Corkboard', value: 'corkboard', icon: '📌' },
  { label: 'Outline', value: 'outline', icon: '📋' },
  { label: 'Timeline', value: 'timeline', icon: '📅' },
  { label: 'Map', value: 'structural-map', icon: '📊' },
  { label: 'Dashboard', value: 'dashboard', icon: '📈' },
];

function AISettingsPanel({ onClose }: { onClose: () => void }) {
  const { aiSettings, setAISettings } = useAppStore();

  const modes: { value: AIMode; label: string; desc: string }[] = [
    { value: 'disabled', label: 'Disabled', desc: 'No AI assistance' },
    { value: 'questions_only', label: 'Questions Only', desc: 'Can ask craft questions, never drafts prose' },
    { value: 'analysis_only', label: 'Analysis Only', desc: 'Can analyze text, find patterns, check continuity' },
    { value: 'metadata_assistance', label: 'Metadata Assistance', desc: 'Can suggest tags, metadata, scene summaries' },
    { value: 'continuity_checking', label: 'Continuity Checking', desc: 'Can flag inconsistencies and contradictions' },
    { value: 'summarization', label: 'Summarization', desc: 'Can summarize scenes and entries' },
    { value: 'full', label: 'Full (incl. drafting)', desc: 'All features including prose drafting if enabled below' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/60" onClick={onClose}>
      <div
        className="bg-[#16213e] border border-[#0f3460] rounded-xl p-5 w-[480px] shadow-2xl flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">AI Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <p className="text-xs text-gray-400">
          AI assistance is optional and project-level. The writer remains in control of all text.
          AI outputs are always suggestions, never automatic changes.
        </p>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-500 font-semibold uppercase tracking-wider">AI Mode</label>
          {modes.map(m => (
            <label key={m.value} className="flex items-start gap-2 cursor-pointer group">
              <input
                type="radio"
                name="ai-mode"
                value={m.value}
                checked={aiSettings.mode === m.value}
                onChange={() => setAISettings({ mode: m.value })}
                className="accent-purple-500 mt-0.5"
              />
              <div>
                <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{m.label}</span>
                <p className="text-xs text-gray-500">{m.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {aiSettings.mode === 'full' && (
          <label className="flex items-center gap-2 cursor-pointer border border-amber-700/50 rounded p-2 bg-amber-900/10">
            <input
              type="checkbox"
              checked={aiSettings.allowDrafting}
              onChange={(e) => setAISettings({ allowDrafting: e.target.checked })}
              className="accent-purple-500"
            />
            <div>
              <span className="text-sm text-amber-300">Allow prose drafting</span>
              <p className="text-xs text-gray-500">AI may generate manuscript text when explicitly requested. Off by default.</p>
            </div>
          </label>
        )}

        <div className="border-t border-[#0f3460] pt-3 text-xs text-gray-600">
          <p>• AI analysis uses only your project data — not external content</p>
          <p>• No text is sent anywhere without your explicit action</p>
          <p>• AI drafting is off unless you enable "Allow prose drafting" above</p>
          <p className="mt-1 text-gray-700">Note: AI features require API configuration. Connect in project settings.</p>
        </div>
      </div>
    </div>
  );
}

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
  } = useAppStore();

  const [showAI, setShowAI] = useState(false);

  const totalWords = totalWordCount(binder);
  const pct = projectTarget.wordTarget > 0
    ? Math.min(100, Math.round((totalWords / projectTarget.wordTarget) * 100))
    : 0;

  if (compositionMode) return null;

  return (
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

      {/* AI */}
      <button
        onClick={() => setShowAI(true)}
        title="AI Settings"
        className={`px-2 py-1 rounded text-xs transition-colors ${
          aiSettings.mode !== 'disabled'
            ? 'text-purple-400 hover:text-white hover:bg-[#2d3748]'
            : 'text-gray-600 hover:text-gray-400 hover:bg-[#2d3748]'
        }`}
      >
        {aiSettings.mode !== 'disabled' ? '🤖' : '🤖'}
        <span className="ml-1 hidden sm:inline">AI</span>
      </button>

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

      {showAI && <AISettingsPanel onClose={() => setShowAI(false)} />}
    </div>
  );
}
