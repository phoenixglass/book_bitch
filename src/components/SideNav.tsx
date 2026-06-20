import { useAppStore } from '../store/appStore';
import type { AppArea } from '../types';

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

export function SideNav() {
  const { area, setArea, setSearchOpen, questions, fragments } = useAppStore();

  const openQuestionCount = questions.filter((q) => q.questionStatus === 'open').length;
  const unsortedFragmentCount = fragments.filter((f) => f.status === 'unsorted').length;

  return (
    <div className="w-14 shrink-0 bg-[#0d1117] border-r border-[#0f3460] flex flex-col items-center py-2 gap-1 select-none overflow-y-auto">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.area}
          title={item.label}
          onClick={() => setArea(item.area)}
          className={`relative w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-colors ${
            area === item.area
              ? 'bg-[#6b46c1] text-white'
              : 'text-gray-500 hover:text-gray-200 hover:bg-[#2d3748]'
          }`}
        >
          {item.icon}
          {item.area === 'questions' && openQuestionCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-black text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {openQuestionCount > 9 ? '9+' : openQuestionCount}
            </span>
          )}
          {item.area === 'fragments' && unsortedFragmentCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {unsortedFragmentCount > 9 ? '9+' : unsortedFragmentCount}
            </span>
          )}
        </button>
      ))}

      <div className="flex-1" />

      {/* Search */}
      <button
        title="Global Search (Ctrl+K)"
        onClick={() => setSearchOpen(true)}
        className="w-10 h-10 rounded-lg flex items-center justify-center text-xl text-gray-500 hover:text-gray-200 hover:bg-[#2d3748] transition-colors"
      >
        🔍
      </button>
    </div>
  );
}
