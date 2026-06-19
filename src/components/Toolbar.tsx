import { useAppStore, totalWordCount } from '../store/appStore';
import type { ViewMode } from '../types';

export function Toolbar() {
  const {
    projectTitle,
    setProjectTitle,
    viewMode,
    setViewMode,
    compositionMode,
    setCompositionMode,
    inspectorOpen,
    setInspectorOpen,
    binder,
    projectTarget,
  } = useAppStore();

  const totalWords = totalWordCount(binder);
  const pct =
    projectTarget.wordTarget > 0
      ? Math.min(100, Math.round((totalWords / projectTarget.wordTarget) * 100))
      : 0;

  const modes: { label: string; value: ViewMode; icon: string }[] = [
    { label: 'Editor', value: 'editor', icon: '✏️' },
    { label: 'Corkboard', value: 'corkboard', icon: '📌' },
    { label: 'Outline', value: 'outline', icon: '📋' },
  ];

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

      {/* View mode buttons */}
      <div className="flex gap-1">
        {modes.map((m) => (
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

      <div className="w-px h-6 bg-[#0f3460] mx-1" />

      {/* Word count + target */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span>{totalWords.toLocaleString()} words</span>
        {projectTarget.wordTarget > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-20 h-2 bg-[#2d3748] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6b46c1] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span>{pct}%</span>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Composition mode */}
      <button
        onClick={() => setCompositionMode(true)}
        title="Composition Mode (full screen)"
        className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-[#2d3748] transition-colors"
      >
        ⛶ Focus
      </button>

      {/* Inspector toggle */}
      <button
        onClick={() => setInspectorOpen(!inspectorOpen)}
        title="Toggle Inspector"
        className={`px-2 py-1 rounded text-xs transition-colors ${
          inspectorOpen
            ? 'bg-[#6b46c1] text-white'
            : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'
        }`}
      >
        ℹ Inspector
      </button>
    </div>
  );
}
