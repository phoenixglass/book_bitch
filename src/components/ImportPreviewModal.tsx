import { useState, useCallback } from 'react';
import type { ParsedItem, SplitLevel } from '../utils/documentParser';

type TargetSection = 'manuscript' | 'fragments' | 'omitted' | 'research';

interface Props {
  fileName: string;
  fileType: string;
  parsedItems: ParsedItem[];
  splitLevel: SplitLevel;
  defaultSection: TargetSection;
  canChangeSplitLevel: boolean;
  onChangeSplitLevel: (level: SplitLevel) => Promise<void>;
  onConfirm: (items: ParsedItem[], section: TargetSection) => void;
  onCancel: () => void;
}

const SECTION_LABELS: Record<TargetSection, string> = {
  manuscript: '📖 Main Manuscript',
  fragments: '🧩 Fragments',
  omitted: '🗂️ Omitted Material',
  research: '🔬 Research',
};

export function ImportPreviewModal({
  fileName,
  fileType,
  parsedItems,
  splitLevel,
  defaultSection,
  canChangeSplitLevel,
  onChangeSplitLevel,
  onConfirm,
  onCancel,
}: Props) {
  const [section, setSection] = useState<TargetSection>(defaultSection);
  const [items, setItems] = useState<ParsedItem[]>(parsedItems);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(parsedItems.map((i) => i.id)));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reparsing, setReparsing] = useState(false);
  const [currentSplitLevel, setCurrentSplitLevel] = useState<SplitLevel>(splitLevel);

  const selectedItems = items.filter((i) => selected.has(i.id));

  const toggleAll = useCallback(() => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  }, [selected, items]);

  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const updateTitle = useCallback((id: string, title: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, title } : i)));
  }, []);

  async function handleChangeSplitLevel(level: SplitLevel) {
    if (level === currentSplitLevel || reparsing) return;
    setReparsing(true);
    try {
      await onChangeSplitLevel(level);
      setCurrentSplitLevel(level);
    } finally {
      setReparsing(false);
    }
  }

  // When parent updates parsedItems (after reparse), sync
  const handleConfirm = () => {
    if (selectedItems.length === 0) return;
    onConfirm(selectedItems, section);
  };

  function stripHtml(html: string, maxLen = 200): string {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#16213e] border border-[#0f3460] rounded-xl shadow-2xl w-[780px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#0f3460] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Import Preview</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                <span className="bg-[#2d3748] px-1.5 py-0.5 rounded text-gray-300 font-mono">
                  {fileName}
                </span>
                <span className="ml-2 text-gray-500 uppercase text-[10px]">{fileType}</span>
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-500 hover:text-white text-xl leading-none mt-0.5"
            >
              ✕
            </button>
          </div>

          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {/* Split level */}
            {canChangeSplitLevel && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Split at:</span>
                {(['1', '2', '3', 'any'] as const).map((lvl) => {
                  const label = lvl === 'any' ? 'Any heading' : `H${lvl}`;
                  const val: SplitLevel = lvl === 'any' ? 'any' : (parseInt(lvl) as SplitLevel);
                  return (
                    <button
                      key={lvl}
                      disabled={reparsing}
                      onClick={() => handleChangeSplitLevel(val)}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        currentSplitLevel === val
                          ? 'bg-[#6b46c1] text-white'
                          : 'bg-[#2d3748] text-gray-400 hover:text-white'
                      } disabled:opacity-50`}
                    >
                      {label}
                    </button>
                  );
                })}
                {reparsing && (
                  <span className="text-xs text-gray-500 animate-pulse">Reparsing…</span>
                )}
              </div>
            )}

            {/* Target section */}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs text-gray-500">Import into:</span>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value as TargetSection)}
                className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-200 outline-none focus:border-[#6b46c1]"
              >
                {(Object.entries(SECTION_LABELS) as [TargetSection, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Summary bar */}
        <div className="px-5 py-2 bg-[#0d1117]/50 border-b border-[#0f3460] shrink-0 flex items-center gap-3 text-xs">
          <span className="text-gray-400">
            <strong className="text-white">{items.length}</strong> items detected
          </span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-400">
            <strong className="text-white">{selectedItems.length}</strong> selected
          </span>
          <span className="text-gray-600">·</span>
          <span className="text-gray-400">
            <strong className="text-white">
              {selectedItems.reduce((s, i) => s + i.wordCount, 0).toLocaleString()}
            </strong>{' '}
            words total
          </span>
          <button
            onClick={toggleAll}
            className="ml-auto text-xs text-[#6b46c1] hover:text-purple-300"
          >
            {selected.size === items.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#0f3460]">
          {items.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">
              No items could be parsed. Try a different split level.
            </div>
          )}
          {items.map((item, idx) => {
            const isExpanded = expandedId === item.id;
            const isChecked = selected.has(item.id);
            return (
              <div
                key={item.id}
                className={`px-5 py-3 transition-colors ${isChecked ? 'bg-[#1a1a2e]' : 'bg-transparent opacity-50'}`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleItem(item.id)}
                    className="mt-1 accent-[#6b46c1] cursor-pointer"
                  />

                  {/* Number */}
                  <span className="text-xs text-gray-600 mt-1 w-5 shrink-0 text-right">{idx + 1}</span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Title editor */}
                    <input
                      value={item.title}
                      onChange={(e) => updateTitle(item.id, e.target.value)}
                      className="w-full bg-transparent text-sm text-white font-medium outline-none border-b border-transparent focus:border-[#6b46c1] pb-0.5 transition-colors"
                      placeholder="Item title…"
                    />

                    {/* Meta */}
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      {item.headingLevel && (
                        <span className="bg-[#2d3748] px-1 rounded text-[10px]">
                          H{item.headingLevel}
                        </span>
                      )}
                      <span>{item.wordCount.toLocaleString()} words</span>
                      {item.content && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="text-[#6b46c1] hover:text-purple-300"
                        >
                          {isExpanded ? '▲ hide' : '▼ preview'}
                        </button>
                      )}
                    </div>

                    {/* Content preview */}
                    {isExpanded && (
                      <div className="mt-2 p-2 bg-[#0d1117] rounded text-xs text-gray-400 leading-relaxed max-h-32 overflow-y-auto">
                        {stripHtml(item.content, 400)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#0f3460] shrink-0 flex items-center gap-3">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded bg-[#2d3748] text-gray-300 hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
          <div className="flex-1" />
          <span className="text-xs text-gray-500">
            {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} →{' '}
            {SECTION_LABELS[section]}
          </span>
          <button
            disabled={selectedItems.length === 0}
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded bg-[#6b46c1] text-white text-sm font-medium hover:bg-[#553c9a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import {selectedItems.length > 0 ? selectedItems.length : ''} Item
            {selectedItems.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
