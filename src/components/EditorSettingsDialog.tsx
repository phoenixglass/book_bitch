import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { EditorSettings } from '../types';

const FONT_FAMILIES = [
  { label: 'Times New Roman', value: 'Times New Roman, Times, serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Garamond', value: 'Garamond, serif' },
  { label: 'Palatino', value: 'Palatino Linotype, Palatino, serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica Neue, Helvetica, sans-serif' },
  { label: 'Courier New', value: 'Courier New, Courier, monospace' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 36, 48, 72];

const LINE_SPACINGS = [
  { label: 'Single (1.0)', value: 1.0 },
  { label: '1.15', value: 1.15 },
  { label: '1.5', value: 1.5 },
  { label: 'Double (2.0)', value: 2.0 },
  { label: '2.5', value: 2.5 },
  { label: 'Triple (3.0)', value: 3.0 },
];

const INDENT_PRESETS = [0, 0.25, 0.5, 0.75, 1.0];

const ALIGN_OPTIONS: { label: string; value: EditorSettings['textAlign']; icon: string }[] = [
  { label: 'Left', value: 'left', icon: '⬛▪▪' },
  { label: 'Center', value: 'center', icon: '▪⬛▪' },
  { label: 'Right', value: 'right', icon: '▪▪⬛' },
  { label: 'Justify', value: 'justify', icon: '≡' },
];

type Tab = 'font' | 'paragraph' | 'page';

interface Props {
  onClose: () => void;
}

export function EditorSettingsDialog({ onClose }: Props) {
  const { editorSettings, updateEditorSettings } = useAppStore();
  const [local, setLocal] = useState<EditorSettings>({ ...editorSettings });
  const [tab, setTab] = useState<Tab>('font');

  function patch(p: Partial<EditorSettings>) {
    setLocal((s) => ({ ...s, ...p }));
  }

  function apply() {
    updateEditorSettings(local);
    onClose();
  }

  const previewStyle: React.CSSProperties = {
    fontFamily: local.fontFamily,
    fontSize: `${(local.fontSize * 4) / 3}px`,
    lineHeight: local.lineHeight,
    textAlign: local.textAlign,
    textIndent: `${local.firstLineIndent}in`,
    color: local.textColor,
    background: local.pageBackground,
    padding: '12px 16px',
    borderRadius: 6,
    border: '1px solid #2d3748',
    marginTop: 12,
    minHeight: 80,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#1a1a2e] border border-[#0f3460] rounded-xl shadow-2xl w-[540px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#0f3460]">
          <span className="text-white font-semibold text-sm">Paragraph & Font Settings</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#0f3460]">
          {(['font', 'paragraph', 'page'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 text-xs capitalize transition-colors ${
                tab === t ? 'border-b-2 border-[#6b46c1] text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t === 'font' ? 'Font' : t === 'paragraph' ? 'Paragraph' : 'Page'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* ── Font tab ─────────────────────────────────────────────────── */}
          {tab === 'font' && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Font</label>
                <select
                  value={local.fontFamily}
                  onChange={(e) => patch({ fontFamily: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#6b46c1]"
                >
                  {FONT_FAMILIES.map((f) => (
                    <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Size (pt)</label>
                <div className="flex items-center gap-2">
                  <select
                    value={local.fontSize}
                    onChange={(e) => patch({ fontSize: Number(e.target.value) })}
                    className="w-24 bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#6b46c1]"
                  >
                    {FONT_SIZES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={6}
                    max={144}
                    value={local.fontSize}
                    onChange={(e) => patch({ fontSize: Math.max(6, Math.min(144, Number(e.target.value))) })}
                    className="w-20 bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#6b46c1]"
                  />
                  <span className="text-xs text-gray-500">pt</span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Text Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={local.textColor}
                    onChange={(e) => patch({ textColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                  />
                  <input
                    type="text"
                    value={local.textColor}
                    onChange={(e) => patch({ textColor: e.target.value })}
                    className="w-28 bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-[#6b46c1]"
                  />
                </div>
              </div>
            </>
          )}

          {/* ── Paragraph tab ────────────────────────────────────────────── */}
          {tab === 'paragraph' && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Alignment</label>
                <div className="flex gap-2">
                  {ALIGN_OPTIONS.map((a) => (
                    <button
                      key={a.value}
                      onClick={() => patch({ textAlign: a.value })}
                      title={a.label}
                      className={`flex-1 py-1.5 rounded text-xs border transition-colors ${
                        local.textAlign === a.value
                          ? 'bg-[#6b46c1] border-[#6b46c1] text-white'
                          : 'border-[#2d3748] text-gray-400 hover:text-white hover:border-[#6b46c1]'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Line Spacing</label>
                <select
                  value={local.lineHeight}
                  onChange={(e) => patch({ lineHeight: Number(e.target.value) })}
                  className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#6b46c1]"
                >
                  {LINE_SPACINGS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">Custom:</span>
                  <input
                    type="number"
                    min={0.5}
                    max={5}
                    step={0.1}
                    value={local.lineHeight}
                    onChange={(e) => patch({ lineHeight: Math.max(0.5, Math.min(5, Number(e.target.value))) })}
                    className="w-20 bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[#6b46c1]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">First Line Indent</label>
                <div className="flex gap-2 flex-wrap mb-1">
                  {INDENT_PRESETS.map((v) => (
                    <button
                      key={v}
                      onClick={() => patch({ firstLineIndent: v })}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                        local.firstLineIndent === v
                          ? 'bg-[#6b46c1] border-[#6b46c1] text-white'
                          : 'border-[#2d3748] text-gray-400 hover:text-white'
                      }`}
                    >
                      {v}"
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={3}
                    step={0.05}
                    value={local.firstLineIndent}
                    onChange={(e) => patch({ firstLineIndent: Math.max(0, Math.min(3, Number(e.target.value))) })}
                    className="w-20 bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#6b46c1]"
                  />
                  <span className="text-xs text-gray-500">inches</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Space Before (pt)</label>
                  <input
                    type="number"
                    min={0}
                    max={72}
                    step={1}
                    value={local.paragraphSpacingBefore}
                    onChange={(e) => patch({ paragraphSpacingBefore: Math.max(0, Number(e.target.value)) })}
                    className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#6b46c1]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Space After (pt)</label>
                  <input
                    type="number"
                    min={0}
                    max={72}
                    step={1}
                    value={local.paragraphSpacingAfter}
                    onChange={(e) => patch({ paragraphSpacingAfter: Math.max(0, Number(e.target.value)) })}
                    className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#6b46c1]"
                  />
                </div>
              </div>
            </>
          )}

          {/* ── Page tab ─────────────────────────────────────────────────── */}
          {tab === 'page' && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Text Column Width (px)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={400}
                    max={1200}
                    step={10}
                    value={local.pageWidth}
                    onChange={(e) => patch({ pageWidth: Number(e.target.value) })}
                    className="flex-1 accent-[#6b46c1]"
                  />
                  <input
                    type="number"
                    min={400}
                    max={1200}
                    value={local.pageWidth}
                    onChange={(e) => patch({ pageWidth: Math.max(400, Math.min(1200, Number(e.target.value))) })}
                    className="w-20 bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#6b46c1]"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {[{ label: 'Narrow', v: 520 }, { label: 'Standard', v: 680 }, { label: 'Wide', v: 860 }, { label: 'Full', v: 1100 }].map((p) => (
                    <button
                      key={p.v}
                      onClick={() => patch({ pageWidth: p.v })}
                      className={`flex-1 py-1 rounded text-xs border transition-colors ${
                        local.pageWidth === p.v
                          ? 'bg-[#6b46c1] border-[#6b46c1] text-white'
                          : 'border-[#2d3748] text-gray-400 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Page Background</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={local.pageBackground}
                    onChange={(e) => patch({ pageBackground: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                  />
                  <input
                    type="text"
                    value={local.pageBackground}
                    onChange={(e) => patch({ pageBackground: e.target.value })}
                    className="w-28 bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-[#6b46c1]"
                  />
                  <div className="flex gap-1 ml-2">
                    {['#1a1a2e', '#ffffff', '#fffef7', '#1c1c1c', '#0d1117'].map((c) => (
                      <button
                        key={c}
                        onClick={() => patch({ pageBackground: c })}
                        title={c}
                        className={`w-6 h-6 rounded border-2 transition-colors ${local.pageBackground === c ? 'border-[#6b46c1]' : 'border-transparent hover:border-gray-500'}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Preview */}
          <div>
            <div className="text-xs text-gray-500 mb-1">Preview</div>
            <div style={previewStyle}>
              The quick brown fox jumps over the lazy dog. This is a sample paragraph to show how your manuscript text will appear with the current settings applied.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#0f3460]">
          <button
            onClick={() => setLocal({ ...editorSettings })}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Reset
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded text-xs text-gray-400 hover:text-white border border-[#2d3748] hover:border-[#6b46c1] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              className="px-4 py-1.5 rounded text-xs bg-[#6b46c1] text-white hover:bg-[#7c3aed] transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
