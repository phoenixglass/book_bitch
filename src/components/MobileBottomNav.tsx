import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { AppArea } from '../types';

const PRIMARY_NAV: { area: AppArea; icon: string; label: string }[] = [
  { area: 'manuscript', icon: '📖', label: 'Write' },
  { area: 'fragments', icon: '🧩', label: 'Clips' },
  { area: 'notebook', icon: '📓', label: 'Notes' },
  { area: 'codex', icon: '📚', label: 'Codex' },
  { area: 'questions', icon: '❓', label: 'Q&A' },
];

const MORE_NAV: { area: AppArea; icon: string; label: string }[] = [
  { area: 'omitted', icon: '🗂️', label: 'Omitted' },
  { area: 'moodboard', icon: '🖼️', label: 'Moodboard' },
  { area: 'research', icon: '🔬', label: 'Research' },
  { area: 'revision', icon: '🧵', label: 'Revision' },
  { area: 'assembly', icon: '📚', label: 'Assembly' },
  { area: 'history', icon: '🕰️', label: 'History' },
  { area: 'trash', icon: '🗑️', label: 'Trash' },
];

export function MobileBottomNav() {
  const { area, setArea, setSearchOpen, questions, fragments } = useAppStore();
  const [showMore, setShowMore] = useState(false);

  const openQuestionCount = questions.filter((q) => q.questionStatus === 'open').length;
  const unsortedCount = fragments.filter((f) => f.status === 'unsorted' && !f.trashedAt).length;
  const isMoreActive = MORE_NAV.some((n) => n.area === area);

  function handleAreaChange(a: AppArea) {
    setArea(a);
    setShowMore(false);
  }

  return (
    <>
      {/* More sheet overlay */}
      {showMore && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMore(false)}
        >
          <div
            className="absolute bottom-16 left-0 right-0 bg-[#16213e] border-t border-[#0f3460] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-4 gap-2 mb-3">
              {MORE_NAV.map((item) => (
                <button
                  key={item.area}
                  onClick={() => handleAreaChange(item.area)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl transition-colors ${
                    area === item.area
                      ? 'bg-[#6b46c1]/20 text-[#6b46c1]'
                      : 'text-gray-400 hover:bg-[#2d3748]'
                  }`}
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-xs">{item.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setSearchOpen(true); setShowMore(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-[#2d3748] transition-colors"
            >
              <span className="text-xl">🔍</span>
              <span className="text-sm">Search</span>
            </button>
          </div>
        </div>
      )}

      <nav className="flex border-t border-[#0f3460] bg-[#0d1117] shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {PRIMARY_NAV.map((item) => (
          <button
            key={item.area}
            onClick={() => handleAreaChange(item.area)}
            className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
              area === item.area ? 'text-[#6b46c1]' : 'text-gray-500'
            }`}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="text-[10px]">{item.label}</span>
            {item.area === 'questions' && openQuestionCount > 0 && (
              <span className="absolute top-1.5 left-[calc(50%+8px)] bg-amber-500 text-black text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {openQuestionCount > 9 ? '9+' : openQuestionCount}
              </span>
            )}
            {item.area === 'fragments' && unsortedCount > 0 && (
              <span className="absolute top-1.5 left-[calc(50%+8px)] bg-blue-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {unsortedCount > 9 ? '9+' : unsortedCount}
              </span>
            )}
          </button>
        ))}

        {/* More button */}
        <button
          onClick={() => setShowMore(!showMore)}
          className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
            showMore || isMoreActive ? 'text-[#6b46c1]' : 'text-gray-500'
          }`}
        >
          <span className="text-xl leading-none">···</span>
          <span className="text-[10px]">More</span>
        </button>
      </nav>
    </>
  );
}
