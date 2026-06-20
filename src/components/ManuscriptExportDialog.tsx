import { useState, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import {
  exportManuscriptDocx,
  detectManuscriptIssues,
  countManuscriptWords,
  type CleanupIssue,
} from '../utils/manuscriptExport';

interface Props {
  onClose: () => void;
}

type Tab = 'author' | 'format' | 'content' | 'cleanup';

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  optional?: boolean;
}) {
  const cls =
    'w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none';
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">
        {label}
        {optional && <span className="text-gray-600 ml-1">(optional)</span>}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className={cls}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
  sublabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sublabel?: string;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-purple-500 mt-0.5"
      />
      <span>
        <span className="text-sm text-gray-300">{label}</span>
        {sublabel && <span className="block text-xs text-gray-500">{sublabel}</span>}
      </span>
    </label>
  );
}

export function ManuscriptExportDialog({ onClose }: Props) {
  const { binder, projectTitle, manuscriptSettings, updateManuscriptSettings } = useAppStore();

  const [activeTab, setActiveTab] = useState<Tab>('author');
  const [exporting, setExporting] = useState(false);
  const [cleanupIssues, setCleanupIssues] = useState<CleanupIssue[] | null>(null);

  const wordCount = countManuscriptWords(binder);
  const roundedCount = Math.round(wordCount / 100) * 100;

  const set = useCallback(
    (patch: Parameters<typeof updateManuscriptSettings>[0]) => updateManuscriptSettings(patch),
    [updateManuscriptSettings],
  );

  async function handleExport() {
    setExporting(true);
    try {
      await exportManuscriptDocx(binder, projectTitle, manuscriptSettings);
    } catch (err) {
      console.error('Manuscript export failed:', err);
      alert('Export failed. Please check the console for details.');
    } finally {
      setExporting(false);
    }
  }

  function handleRunCleanup() {
    const issues = detectManuscriptIssues(binder);
    setCleanupIssues(issues);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'author', label: 'Author & Book' },
    { id: 'format', label: 'Format' },
    { id: 'content', label: 'Content' },
    { id: 'cleanup', label: 'Cleanup Check' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-[#16213e] border border-[#0f3460] rounded-xl shadow-2xl flex flex-col w-[580px] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#0f3460]">
          <div>
            <h2 className="text-base font-semibold text-white">Standard Manuscript Format</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Times New Roman 12pt · double-spaced · 1″ margins · 0.5″ indent · left aligned
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">
            ✕
          </button>
        </div>

        {/* Word count banner */}
        <div className="px-6 py-2 bg-[#1a1a2e] border-b border-[#0f3460] flex items-center gap-3">
          <span className="text-xs text-gray-500">Manuscript word count:</span>
          <span className="text-sm font-medium text-purple-300">
            {wordCount.toLocaleString()} words
            {wordCount >= 1000 && (
              <span className="text-gray-500 ml-1.5">
                (≈ {roundedCount.toLocaleString()} rounded)
              </span>
            )}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#0f3460] px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2.5 px-3 text-sm transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-purple-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {activeTab === 'author' && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-gray-500">
                This information appears in the top-left corner of the title page and in the running header.
              </p>

              <Field
                label="Author Name"
                value={manuscriptSettings.authorName}
                onChange={(v) => set({ authorName: v })}
                placeholder="Your legal name or pen name"
              />
              <Field
                label="Email"
                value={manuscriptSettings.authorEmail}
                onChange={(v) => set({ authorEmail: v })}
                placeholder="author@example.com"
                optional
              />
              <Field
                label="Phone"
                value={manuscriptSettings.authorPhone}
                onChange={(v) => set({ authorPhone: v })}
                placeholder="(555) 000-0000"
                optional
              />
              <Field
                label="Mailing Address"
                value={manuscriptSettings.authorAddress}
                onChange={(v) => set({ authorAddress: v })}
                placeholder="123 Main St, City, State ZIP"
                optional
              />

              <hr className="border-[#0f3460]" />

              <Field
                label="Book Title"
                value={manuscriptSettings.bookTitle}
                onChange={(v) => set({ bookTitle: v })}
                placeholder={projectTitle || 'Leave blank to use project title'}
                optional
              />
              <Field
                label="Subtitle"
                value={manuscriptSettings.subtitle}
                onChange={(v) => set({ subtitle: v })}
                placeholder="Subtitle or tagline"
                optional
              />
              <Field
                label="Genre / Category"
                value={manuscriptSettings.genre}
                onChange={(v) => set({ genre: v })}
                placeholder="e.g. Literary Fiction, Fantasy, Thriller"
                optional
              />
            </div>
          )}

          {activeTab === 'format' && (
            <div className="flex flex-col gap-5">
              <div className="bg-[#1a1a2e] rounded-lg p-4 text-xs text-gray-400 space-y-1.5">
                <p className="text-gray-300 font-medium mb-2">Format rules (fixed for this preset):</p>
                <p>• Font: Times New Roman, 12 pt</p>
                <p>• Manuscript body: double-spaced</p>
                <p>• Margins: 1 inch on all sides</p>
                <p>• First-line indent: 0.5 inches (paragraph formatting, not tabs)</p>
                <p>• Alignment: left / ragged right — not justified</p>
                <p>• One space between sentences</p>
                <p>• Page size: 8.5 × 11 inches (U.S. Letter)</p>
                <p>• Italics preserved as italics (not converted to underline)</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-gray-400">Scene break marker</label>
                <div className="flex gap-3">
                  {(['#', '***'] as const).map((style) => (
                    <label key={style} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="sceneBreakStyle"
                        value={style}
                        checked={manuscriptSettings.sceneBreakStyle === style}
                        onChange={() => set({ sceneBreakStyle: style })}
                        className="accent-purple-500"
                      />
                      <span className="text-sm text-gray-300 font-mono">{style}</span>
                      {style === '#' && (
                        <span className="text-xs text-gray-500">(default)</span>
                      )}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-600">
                  Scene breaks appear as a centered line between scenes. In the editor, create a scene break by placing{' '}
                  <span className="font-mono text-gray-400">#</span> or{' '}
                  <span className="font-mono text-gray-400">***</span> alone on a paragraph, or use a horizontal rule.
                </p>
              </div>

              <hr className="border-[#0f3460]" />

              <div className="flex flex-col gap-3">
                <Checkbox
                  checked={manuscriptSettings.includeTitlePage}
                  onChange={(v) => set({ includeTitlePage: v })}
                  label="Include title page"
                  sublabel="Author contact info top-left, title centered"
                />
                <Checkbox
                  checked={manuscriptSettings.includePageNumbers}
                  onChange={(v) => set({ includePageNumbers: v })}
                  label="Include running header with page numbers"
                  sublabel="LAST NAME / SHORT TITLE / page# — starts on page 1 after title page"
                />
                <Checkbox
                  checked={manuscriptSettings.includeChapterTitles}
                  onChange={(v) => set({ includeChapterTitles: v })}
                  label="Include chapter titles"
                  sublabel="Each chapter folder name appears as a centered heading; each chapter starts on a new page"
                />
                <Checkbox
                  checked={manuscriptSettings.includeEndMarker}
                  onChange={(v) => set({ includeEndMarker: v })}
                  label='Include END marker'
                  sublabel='Adds centered "END" after the final line of the manuscript'
                />
              </div>
            </div>
          )}

          {activeTab === 'content' && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-xs text-gray-400 mb-3">
                  The export always includes the manuscript body. Private project materials are
                  never included automatically.
                </p>

                <div className="bg-[#1a1a2e] rounded p-3 text-xs text-gray-500 mb-4">
                  <p className="text-gray-400 font-medium mb-1">Excluded by default:</p>
                  <p>fragments · omitted material · notebook entries · codex entries · questions · moodboard · research · private notes</p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <Checkbox
                    checked={manuscriptSettings.includeSynopsis}
                    onChange={(v) => set({ includeSynopsis: v })}
                    label="Include synopsis"
                    sublabel="Appended as a separate single-spaced section after the manuscript"
                  />
                  {manuscriptSettings.includeSynopsis && (
                    <div className="mt-3 ml-6">
                      <Field
                        label="Synopsis text"
                        value={manuscriptSettings.synopsisContent}
                        onChange={(v) => set({ synopsisContent: v })}
                        placeholder="Paste or type your synopsis here..."
                        multiline
                      />
                    </div>
                  )}
                </div>

                <div>
                  <Checkbox
                    checked={manuscriptSettings.includeQueryLetter}
                    onChange={(v) => set({ includeQueryLetter: v })}
                    label="Include query letter"
                    sublabel="Appended as a separate single-spaced section"
                  />
                  {manuscriptSettings.includeQueryLetter && (
                    <div className="mt-3 ml-6">
                      <Field
                        label="Query letter text"
                        value={manuscriptSettings.queryLetterContent}
                        onChange={(v) => set({ queryLetterContent: v })}
                        placeholder="Paste or type your query letter here..."
                        multiline
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'cleanup' && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-gray-400">
                Scan your manuscript for common formatting issues before export. These are
                suggestions only — no changes are made automatically.
              </p>

              <button
                onClick={handleRunCleanup}
                className="py-2 px-4 rounded bg-[#2d3748] text-sm text-gray-300 hover:bg-[#3d4a5e] transition-colors self-start"
              >
                Scan manuscript
              </button>

              {cleanupIssues !== null && (
                <div className="flex flex-col gap-2">
                  {cleanupIssues.length === 0 ? (
                    <div className="bg-green-900/30 border border-green-700/40 rounded p-3 text-sm text-green-400">
                      No formatting issues detected.
                    </div>
                  ) : (
                    cleanupIssues.map((issue, i) => (
                      <div
                        key={i}
                        className="bg-amber-900/20 border border-amber-700/30 rounded p-3"
                      >
                        <p className="text-sm text-amber-300">{issue.description}</p>
                        <p className="text-xs text-amber-600 mt-1">
                          {issue.count} instance{issue.count !== 1 ? 's' : ''} found
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              <hr className="border-[#0f3460]" />

              <div className="text-xs text-gray-600 space-y-1">
                <p className="text-gray-500 font-medium">Checks performed:</p>
                <p>• Double spaces after sentence-ending punctuation</p>
                <p>• Tab characters used for indentation</p>
                <p>• Underlined text that may have been intended as italics</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer: export actions */}
        <div className="px-6 py-4 border-t border-[#0f3460] flex items-center gap-3">
          <button
            onClick={onClose}
            className="py-2 px-4 rounded bg-[#2d3748] text-sm text-gray-300 hover:bg-[#3d4a5e] transition-colors"
          >
            Cancel
          </button>
          <div className="flex-1" />
          <button
            onClick={handleExport}
            disabled={exporting}
            className="py-2 px-5 rounded bg-[#6b46c1] text-white text-sm font-medium hover:bg-[#553c9a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {exporting ? (
              <>
                <span className="animate-spin text-xs">⟳</span>
                Exporting…
              </>
            ) : (
              <>⬇ Export .docx</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
