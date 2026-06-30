import { useState, useMemo, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { TagInput } from './TagInput';
import { WritingEditor } from './WritingEditor';
import { ImportPreviewModal } from './ImportPreviewModal';
import { GoogleDriveUpload } from './GoogleDriveUpload';
import { parseFile } from '../utils/documentParser';
import type { ParsedItem, SplitLevel } from '../utils/documentParser';
import type { ResearchEntry, ResearchType, ImportSourceMeta } from '../types';

const TYPE_LABELS: Record<ResearchType, string> = {
  note: 'Note',
  source: 'Source',
  spreadsheet: 'Spreadsheet',
  link: 'Link',
  other: 'Other',
};

const TYPE_ICONS: Record<ResearchType, string> = {
  note: '📝',
  source: '📰',
  spreadsheet: '📊',
  link: '🔗',
  other: '🔬',
};

function ResearchDetail({ entry, onClose }: { entry: ResearchEntry; onClose: () => void }) {
  const { updateResearchEntry, deleteResearchEntry } = useAppStore();

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] shrink-0">
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs">← Back</button>
        <span className="flex-1" />
        {entry.importSource && (
          <span className="text-xs text-gray-600" title="Imported file">
            📥 {entry.importSource.fileName}.{entry.importSource.fileType}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <input
          value={entry.title}
          onChange={(e) => updateResearchEntry(entry.id, { title: e.target.value })}
          className="text-xl font-semibold text-white bg-transparent border-b border-[#2d3748] pb-1 outline-none focus:border-[#6b46c1]"
          placeholder="Research title…"
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Type</label>
            <select
              value={entry.researchType}
              onChange={(e) => updateResearchEntry(entry.id, { researchType: e.target.value as ResearchType })}
              className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
            >
              {(Object.entries(TYPE_LABELS) as [ResearchType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Source</label>
            <input
              value={entry.source}
              onChange={(e) => updateResearchEntry(entry.id, { source: e.target.value })}
              placeholder="Where did this come from?"
              className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Tags</label>
          <TagInput
            tags={entry.tags}
            onChange={(v) => updateResearchEntry(entry.id, { tags: v })}
            placeholder="Add tag…"
          />
        </div>

        {/* Rich content editor — supports HTML tables from spreadsheet imports */}
        <div className="flex-1 flex flex-col min-h-[300px] border-t border-b border-[#0f3460]">
          <WritingEditor
            itemId={entry.id}
            content={entry.content}
            onChange={(html) => updateResearchEntry(entry.id, { content: html })}
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Notes</label>
          <textarea
            value={entry.notes}
            onChange={(e) => updateResearchEntry(entry.id, { notes: e.target.value })}
            rows={4}
            placeholder="Additional notes about this research…"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-3 py-2 text-gray-200 text-sm outline-none focus:border-[#6b46c1] resize-y leading-relaxed placeholder-gray-600"
          />
        </div>

        <div className="border-t border-[#0f3460] pt-3">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">Linked Objects</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Related Scenes</label>
              <TagInput
                tags={entry.relatedSceneIds}
                onChange={(v) => updateResearchEntry(entry.id, { relatedSceneIds: v })}
                placeholder="Add scene…"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Related Codex Entries</label>
              <TagInput
                tags={entry.relatedCodexIds}
                onChange={(v) => updateResearchEntry(entry.id, { relatedCodexIds: v })}
                placeholder="Add codex entry…"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Related Questions</label>
              <TagInput
                tags={entry.relatedQuestionIds}
                onChange={(v) => updateResearchEntry(entry.id, { relatedQuestionIds: v })}
                placeholder="Add question…"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Related Fragments</label>
              <TagInput
                tags={entry.relatedFragmentIds}
                onChange={(v) => updateResearchEntry(entry.id, { relatedFragmentIds: v })}
                placeholder="Add fragment…"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-[#0f3460] pt-3">
          <button
            onClick={() => {
              if (window.confirm('Delete this research entry permanently?')) {
                deleteResearchEntry(entry.id);
                onClose();
              }
            }}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            🗑 Delete Entry
          </button>
        </div>

        <div className="text-xs text-gray-600">
          Created {new Date(entry.createdAt).toLocaleString()} · Updated {new Date(entry.updatedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

interface PendingImport {
  file: File;
  splitLevel: SplitLevel;
  parsedItems: ParsedItem[];
  defaultSection: 'research';
}

export function ResearchView() {
  const {
    researchEntries,
    addResearchEntry,
    importToResearch,
    pendingSelectId,
    setPendingSelectId,
    setAIContextObject,
    setArea,
  } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [filterType, setFilterType] = useState('');
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAIContextObject(selectedId ? { type: 'research_item', id: selectedId } : null);
  }, [selectedId, setAIContextObject]);

  useEffect(() => {
    if (pendingSelectId) {
      setSelectedId(pendingSelectId);
      setPendingSelectId(null);
    }
  }, [pendingSelectId, setPendingSelectId]);

  const filtered = useMemo(() => {
    let list = researchEntries;
    if (filterType) list = list.filter((e) => e.researchType === filterType);
    if (filterText) {
      const lc = filterText.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(lc) ||
          e.content.toLowerCase().includes(lc) ||
          e.tags.some((t) => t.toLowerCase().includes(lc)),
      );
    }
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [researchEntries, filterText, filterType]);

  const selected = researchEntries.find((e) => e.id === selectedId) ?? null;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    e.currentTarget.value = '';

    const splitLevel: SplitLevel = 1;
    const items = await parseFile(file, { splitLevel });
    const isSpreadsheet = /\.(csv|tsv)$/i.test(file.name);

    if (items.length === 1 && !items[0].sourceHeading) {
      importToResearch([
        {
          title: items[0].title,
          content: items[0].content,
          researchType: isSpreadsheet ? 'spreadsheet' : 'source',
          importSource: {
            fileName: file.name.replace(/\.[^/.]+$/, ''),
            fileType: file.name.split('.').pop() ?? 'txt',
            importedAt: Date.now(),
          },
        },
      ]);
      return;
    }

    setPendingImport({ file, splitLevel, parsedItems: items, defaultSection: 'research' });
  }

  async function handleChangeSplitLevel(level: SplitLevel) {
    if (!pendingImport) return;
    const { file } = pendingImport;
    const items = await parseFile(file, { splitLevel: level });
    setPendingImport((prev) => (prev ? { ...prev, splitLevel: level, parsedItems: items } : null));
  }

  function handleImportConfirm(
    items: ParsedItem[],
    section: 'manuscript' | 'fragments' | 'omitted' | 'research',
  ) {
    const { file } = pendingImport!;
    const isSpreadsheet = /\.(csv|tsv)$/i.test(file.name);
    const importSource: ImportSourceMeta = {
      fileName: file.name.replace(/\.[^/.]+$/, ''),
      fileType: file.name.split('.').pop() ?? 'txt',
      importedAt: Date.now(),
    };
    const withSource = items.map((i) => ({
      title: i.title,
      content: i.content,
      importSource: { ...importSource, sourceHeading: i.sourceHeading },
    }));

    if (section === 'research') {
      importToResearch(withSource.map((i) => ({ ...i, researchType: isSpreadsheet ? ('spreadsheet' as ResearchType) : ('source' as ResearchType) })));
    } else if (section === 'fragments') {
      useAppStore.getState().importToFragments(withSource);
      setArea('fragments');
    } else if (section === 'omitted') {
      useAppStore.getState().importToOmitted(withSource);
      setArea('omitted');
    } else if (section === 'manuscript') {
      useAppStore.getState().importToManuscript(withSource);
      setArea('manuscript');
    }
    setPendingImport(null);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-72 shrink-0 bg-[#16213e] border-r border-[#0f3460] flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-[#0f3460]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Research</span>
            <div className="flex items-center gap-1">
              <label
                title="Upload document or spreadsheet into Research"
                className="text-xs text-gray-400 hover:text-white px-1 cursor-pointer select-none"
              >
                📥
                <input
                  ref={uploadRef}
                  type="file"
                  multiple={false}
                  accept=".txt,.md,.html,.htm,.docx,.doc,.csv,.tsv"
                  onChange={handleUpload}
                  className="hidden"
                />
              </label>
              <GoogleDriveUpload targetSection="research" />
              <button
                onClick={() => {
                  const id = addResearchEntry();
                  setSelectedId(id);
                }}
                className="text-xs bg-[#6b46c1] text-white px-2 py-0.5 rounded hover:bg-[#553c9a]"
              >
                + Entry
              </button>
            </div>
          </div>
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search research…"
            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] mb-1"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
          >
            <option value="">All types</option>
            {(Object.entries(TYPE_LABELS) as [ResearchType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-4 text-center text-gray-600">
              <div className="text-3xl mb-2">🔬</div>
              <p className="text-xs">No research yet.</p>
              <p className="text-xs mt-1 text-gray-700">
                Upload documents, spreadsheets, or sync from Google Drive to collect research material here.
              </p>
            </div>
          )}
          {filtered.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setSelectedId(entry.id)}
              className={`w-full text-left px-3 py-2 border-b border-[#0f3460] transition-colors ${
                selectedId === entry.id ? 'bg-[#6b46c1]/20' : 'hover:bg-[#2d3748]'
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs" title={TYPE_LABELS[entry.researchType]}>
                  {TYPE_ICONS[entry.researchType]}
                </span>
                <span className="text-sm text-white truncate">{entry.title}</span>
              </div>
              {entry.source && <div className="text-xs text-gray-500 truncate">{entry.source}</div>}
              {entry.tags.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {entry.tags.slice(0, 3).map((t) => (
                    <span key={t} className="text-[10px] bg-[#6b46c1]/20 text-purple-400 rounded px-1">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <ResearchDetail key={selected.id} entry={selected} onClose={() => setSelectedId(null)} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center">
            <div className="text-5xl mb-3">🔬</div>
            <p className="text-sm">Select a research entry, or upload a document or spreadsheet.</p>
          </div>
        </div>
      )}

      {pendingImport && (
        <ImportPreviewModal
          key={pendingImport.splitLevel}
          fileName={pendingImport.file.name}
          fileType={pendingImport.file.name.split('.').pop() ?? 'file'}
          parsedItems={pendingImport.parsedItems}
          splitLevel={pendingImport.splitLevel}
          defaultSection="research"
          canChangeSplitLevel={
            pendingImport.file.name.endsWith('.docx') ||
            pendingImport.file.name.endsWith('.doc') ||
            pendingImport.file.name.endsWith('.md') ||
            pendingImport.file.name.endsWith('.html') ||
            pendingImport.file.name.endsWith('.htm')
          }
          onChangeSplitLevel={handleChangeSplitLevel}
          onConfirm={handleImportConfirm}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}
