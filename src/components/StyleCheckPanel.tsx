import { useMemo } from 'react';
import { useAppStore, findItem } from '../store/appStore';
import { stripHtml, analyzeFilterWords, analyzeRepeatedWords } from '../utils/textStats';

export function StyleCheckPanel() {
  const { binder, selectedId, setStyleCheckOpen } = useAppStore();
  const selectedItem = selectedId ? findItem(binder, selectedId) : null;

  const analysis = useMemo(() => {
    if (!selectedItem || selectedItem.type !== 'document') return null;
    const text = stripHtml(selectedItem.content);
    return {
      filterWords: analyzeFilterWords(text),
      repeatedWords: analyzeRepeatedWords(text),
      wordCount: text ? text.split(' ').filter(Boolean).length : 0,
    };
  }, [selectedItem]);

  return (
    <div className="w-72 shrink-0 bg-[#16213e] border-l border-[#0f3460] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#0f3460] shrink-0">
        <span className="text-sm font-semibold text-white">🩺 Style Check</span>
        <button
          onClick={() => setStyleCheckOpen(false)}
          className="text-gray-400 hover:text-white text-sm"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {!selectedItem || selectedItem.type !== 'document' ? (
          <p className="text-xs text-gray-500">Select a document to check its prose for filter words and repeated words.</p>
        ) : !analysis || analysis.wordCount === 0 ? (
          <p className="text-xs text-gray-500">This document is empty.</p>
        ) : (
          <>
            <div>
              <p className="text-xs text-gray-400 font-semibold mb-2">
                Filter Words {analysis.filterWords.length > 0 && `(${analysis.filterWords.reduce((a, f) => a + f.count, 0)})`}
              </p>
              {analysis.filterWords.length === 0 ? (
                <p className="text-xs text-gray-600">No common filter/crutch words found. 🎉</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {analysis.filterWords.map((f) => (
                    <span
                      key={f.word}
                      title={`"${f.word}" appears ${f.count} time${f.count === 1 ? '' : 's'}`}
                      className="text-[11px] bg-amber-900/30 text-amber-300 border border-amber-900/50 rounded px-1.5 py-0.5"
                    >
                      {f.word} <span className="text-amber-500/80">×{f.count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-gray-400 font-semibold mb-2">Repeated / Overused Words</p>
              {analysis.repeatedWords.length === 0 ? (
                <p className="text-xs text-gray-600">No notably repeated words.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {analysis.repeatedWords.map((w) => (
                    <div
                      key={w.word}
                      className="flex items-center justify-between text-xs bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1"
                    >
                      <span className="text-gray-300">{w.word}</span>
                      <span className="text-gray-500 flex gap-2">
                        {w.closeRepeats > 0 && (
                          <span
                            className="text-red-400"
                            title="Times this word repeats within ~60 words of a previous use"
                          >
                            {w.closeRepeats} close
                          </span>
                        )}
                        <span>{w.count}× total</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-600 mt-2">
                "Close" repeats are the same word used twice within about 60 words — often worth varying.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
