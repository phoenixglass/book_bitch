import { useState, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { exportBetaReaderPacket, countBetaReaderChapters } from '../utils/betaReaderExport';
import { countManuscriptWords, formatWordCount } from '../utils/manuscriptExport';

interface Props {
  onClose: () => void;
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

export function BetaReaderPacketDialog({ onClose }: Props) {
  const { binder, projectTitle, manuscriptSettings, betaReaderSettings, updateBetaReaderSettings } =
    useAppStore();

  const [exporting, setExporting] = useState(false);

  const wordCount = countManuscriptWords(binder);
  const { chapters, withSynopsis } = countBetaReaderChapters(binder);

  const set = useCallback(
    (patch: Parameters<typeof updateBetaReaderSettings>[0]) => updateBetaReaderSettings(patch),
    [updateBetaReaderSettings],
  );

  async function handleExport() {
    setExporting(true);
    try {
      await exportBetaReaderPacket(binder, projectTitle, betaReaderSettings, manuscriptSettings.sceneBreakStyle);
    } catch (err) {
      console.error('Beta reader packet export failed:', err);
      alert('Export failed. Please check the console for details.');
    } finally {
      setExporting(false);
    }
  }

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
            <h2 className="text-base font-semibold text-white">Beta Reader Packet</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              A reading-friendly copy for sharing outside the app — single-spaced, with an optional
              chapter guide and feedback prompts.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">
            ✕
          </button>
        </div>

        {/* Word count banner */}
        <div className="px-6 py-2 bg-[#1a1a2e] border-b border-[#0f3460] flex items-center gap-3">
          <span className="text-xs text-gray-500">Manuscript word count:</span>
          <span className="text-sm font-medium text-purple-300">{formatWordCount(wordCount)}</span>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">
          <div className="bg-[#1a1a2e] rounded p-3 text-xs text-gray-500">
            <p className="text-gray-400 font-medium mb-1">Always excluded:</p>
            <p>fragments · omitted material · notebook entries · codex entries · questions · moodboard · research · private notes</p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">Note to your readers (optional)</label>
            <textarea
              value={betaReaderSettings.noteToReaders}
              onChange={(e) => set({ noteToReaders: e.target.value })}
              placeholder="e.g. Thanks so much for reading! This is an early draft, so please don't mind typos — I'm mainly looking for feedback on pacing and characters."
              rows={4}
              className="w-full bg-[#0f1626] border border-[#2d3748] rounded px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none"
            />
            <p className="text-xs text-gray-600">Appears on the cover page.</p>
          </div>

          <hr className="border-[#0f3460]" />

          <div>
            <Checkbox
              checked={betaReaderSettings.includeChapterGuide}
              onChange={(v) => set({ includeChapterGuide: v })}
              label="Include chapter guide"
              sublabel={
                chapters > 0
                  ? `${withSynopsis} of ${chapters} chapters have a Corkboard synopsis`
                  : 'No named chapters found in the binder'
              }
            />
          </div>

          <div>
            <Checkbox
              checked={betaReaderSettings.includeFeedbackQuestions}
              onChange={(v) => set({ includeFeedbackQuestions: v })}
              label="Include feedback questions"
              sublabel="Appended as a final page, one question per line, with space to write notes"
            />
            {betaReaderSettings.includeFeedbackQuestions && (
              <div className="mt-3 ml-6">
                <textarea
                  value={betaReaderSettings.feedbackQuestions}
                  onChange={(e) => set({ feedbackQuestions: e.target.value })}
                  placeholder="One question per line"
                  rows={5}
                  className="w-full bg-[#0f1626] border border-[#2d3748] rounded px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
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
