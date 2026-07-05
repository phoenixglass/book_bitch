import { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import type { HistoryEvent, HistoryEventType, ObjectType } from '../types';

const EVENT_ICONS: Record<HistoryEventType, string> = {
  created: '✨', updated: '✏️', deleted: '🗑', moved: '↔️', renamed: '✏️',
  status_changed: '🔄', snapshot_created: '📸', snapshot_restored: '↩',
  promoted: '⬆️', attached: '📎', restored: '↩', linked: '🔗',
  exported: '⬇️', imported: '⬆️',
};

const TYPE_ICONS: Record<ObjectType, string> = {
  scene: '📄', fragment: '🧩', omitted_material: '🗂️', notebook_entry: '📓',
  codex_entry: '📚', question: '❓', moodboard_item: '🖼️', research_item: '🔬', revision_pass: '🧵', manuscript_assembly: '📚',
};

export function HistoryView() {
  const { history } = useAppStore();
  const [filterType, setFilterType] = useState<string>('');
  const [filterObjectType, setFilterObjectType] = useState<string>('');
  const [filterText, setFilterText] = useState('');

  const filtered = useMemo(() => {
    let list = [...history].reverse(); // most recent first
    if (filterType) list = list.filter(e => e.eventType === filterType);
    if (filterObjectType) list = list.filter(e => e.objectType === filterObjectType);
    if (filterText) {
      const lc = filterText.toLowerCase();
      list = list.filter(e =>
        e.description.toLowerCase().includes(lc) ||
        e.objectTitle.toLowerCase().includes(lc),
      );
    }
    return list;
  }, [history, filterType, filterObjectType, filterText]);

  const grouped = useMemo(() => {
    const groups: Record<string, HistoryEvent[]> = {};
    for (const event of filtered) {
      const day = new Date(event.timestamp).toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      if (!groups[day]) groups[day] = [];
      groups[day].push(event);
    }
    return groups;
  }, [filtered]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] bg-[#1a1a2e] shrink-0 flex-wrap">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Draft Archaeology</span>
        <span className="text-xs text-gray-600">— {history.length} events recorded</span>

        <div className="flex-1" />

        <input
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Search history…"
          className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1] w-40"
        />
        <select
          value={filterObjectType}
          onChange={(e) => setFilterObjectType(e.target.value)}
          className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
        >
          <option value="">All types</option>
          {(['scene','fragment','omitted_material','notebook_entry','codex_entry','question'] as ObjectType[]).map(t => (
            <option key={t} value={t}>{TYPE_ICONS[t]} {t.replace('_', ' ')}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
        >
          <option value="">All events</option>
          {(['created','updated','deleted','moved','snapshot_created','snapshot_restored','promoted','attached','restored','linked','exported','imported'] as HistoryEventType[]).map(t => (
            <option key={t} value={t}>{EVENT_ICONS[t]} {t.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 && (
          <div className="text-center text-gray-600 mt-16">
            <div className="text-4xl mb-3">🕰️</div>
            <p className="text-sm">No history events yet.</p>
            <p className="text-xs mt-1">History is recorded as you work—creates, edits, snapshots, promotions, and more.</p>
          </div>
        )}

        {Object.entries(grouped).map(([day, events]) => (
          <div key={day} className="mb-6">
            <div className="text-xs text-gray-500 font-semibold mb-2 sticky top-0 bg-[#0d1117] py-1">
              {day}
            </div>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-[#0f3460]" />
              {events.map(event => (
                <div key={event.id} className="flex items-start gap-3 mb-2 pl-1">
                  <div className="relative z-10 w-8 h-8 rounded-full bg-[#16213e] border border-[#0f3460] flex items-center justify-center shrink-0 text-sm">
                    {EVENT_ICONS[event.eventType]}
                  </div>
                  <div className="flex-1 bg-[#16213e] border border-[#0f3460] rounded-lg px-3 py-2 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-gray-300 leading-snug">{event.description}</p>
                      <span className="text-[10px] text-gray-600 shrink-0 mt-0.5">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] text-gray-600">
                        {TYPE_ICONS[event.objectType]} {event.objectType.replace('_', ' ')}
                      </span>
                      {event.relatedObjectType && (
                        <>
                          <span className="text-[10px] text-gray-700">→</span>
                          <span className="text-[10px] text-gray-600">
                            {TYPE_ICONS[event.relatedObjectType]} {event.relatedObjectTitle}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
