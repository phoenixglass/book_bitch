import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { ManuscriptExportDialog } from './ManuscriptExportDialog';
import { BetaReaderPacketDialog } from './BetaReaderPacketDialog';
import type { BinderItem } from '../types';

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, br').forEach((el) => {
    el.after(document.createTextNode('\n'));
  });
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  function nodeToMd(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const inner = Array.from(el.childNodes).map(nodeToMd).join('');
    switch (tag) {
      case 'h1': return `# ${inner}\n\n`;
      case 'h2': return `## ${inner}\n\n`;
      case 'h3': return `### ${inner}\n\n`;
      case 'strong': case 'b': return `**${inner}**`;
      case 'em': case 'i': return `*${inner}*`;
      case 's': return `~~${inner}~~`;
      case 'code': return `\`${inner}\``;
      case 'mark': return `==${inner}==`;
      case 'blockquote': return inner.split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
      case 'li': return `- ${inner}\n`;
      case 'ul': case 'ol': return inner + '\n';
      case 'p': return `${inner}\n\n`;
      case 'br': return '\n';
      default: return inner;
    }
  }

  return nodeToMd(doc.body).replace(/\n{3,}/g, '\n\n').trim();
}

function collectDocuments(items: BinderItem[]): BinderItem[] {
  const docs: BinderItem[] = [];
  for (const item of items) {
    if (item.type === 'document' && item.id !== 'trash') docs.push(item);
    if (item.type === 'folder' && item.id !== 'trash') docs.push(...collectDocuments(item.children));
  }
  return docs;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface CompileDialogProps {
  onClose: () => void;
}

type ExportFormat = 'txt' | 'html' | 'md' | 'json-backup';

export function CompileDialog({ onClose }: CompileDialogProps) {
  const {
    binder, projectTitle, fragments, omittedMaterial, notebookEntries,
    codexEntries, questions,
    exportProjectBackup, importProjectBackup,
  } = useAppStore();

  const [showManuscriptExport, setShowManuscriptExport] = useState(false);
  const [showBetaReaderPacket, setShowBetaReaderPacket] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('txt');
  const [includeTitle, setIncludeTitle] = useState(true);
  const [includeSynopsis, setIncludeSynopsis] = useState(false);
  const [separatorLine, setSeparatorLine] = useState(true);
  const [includeSceneMeta, setIncludeSceneMeta] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const docs = collectDocuments(binder.filter(b => b.id !== 'research'));

  function buildManuscriptContent(): string {
    const parts: string[] = [];
    const safeTitle = escapeHtml(projectTitle);

    if (includeTitle) {
      if (format === 'html') parts.push(`<h1>${safeTitle}</h1>`);
      else if (format === 'md') parts.push(`# ${projectTitle}\n`);
      else parts.push(`${projectTitle}\n${'='.repeat(projectTitle.length)}\n`);
    }

    for (const doc of docs) {
      const safeDocTitle = escapeHtml(doc.title);
      const meta = doc.sceneMetadata ?? {};

      if (format === 'html') {
        parts.push(`<h2>${safeDocTitle}</h2>`);
        if (includeSynopsis && doc.synopsis) parts.push(`<p class="synopsis"><em>${escapeHtml(doc.synopsis)}</em></p>`);
        if (includeSceneMeta && meta.povCharacter) parts.push(`<p class="meta"><small>POV: ${escapeHtml(meta.povCharacter)}</small></p>`);
        parts.push(doc.content || '<p></p>');
        if (includeNotes && doc.notes) parts.push(`<div class="notes"><p><em>Notes: ${escapeHtml(doc.notes)}</em></p></div>`);
        if (separatorLine) parts.push('<hr />');
      } else if (format === 'md') {
        parts.push(`## ${doc.title}\n`);
        if (includeSynopsis && doc.synopsis) parts.push(`*${doc.synopsis}*\n`);
        if (includeSceneMeta && meta.povCharacter) parts.push(`> POV: ${meta.povCharacter}\n`);
        parts.push(htmlToMarkdown(doc.content));
        if (includeNotes && doc.notes) parts.push(`\n> Notes: ${doc.notes}\n`);
        if (separatorLine) parts.push('\n---\n');
      } else {
        parts.push(doc.title);
        parts.push('-'.repeat(doc.title.length));
        if (includeSynopsis && doc.synopsis) parts.push(`[${doc.synopsis}]\n`);
        if (includeSceneMeta && meta.povCharacter) parts.push(`POV: ${meta.povCharacter}`);
        parts.push(stripHtml(doc.content));
        if (includeNotes && doc.notes) parts.push(`\n[Notes: ${doc.notes}]`);
        if (separatorLine) parts.push('\n* * *\n');
      }
    }

    if (format === 'html') {
      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${safeTitle}</title>
<style>
  body { font-family: Georgia, serif; max-width: 700px; margin: 4rem auto; line-height: 1.7; color: #333; }
  h1 { font-size: 2em; margin-bottom: 0.5em; }
  h2 { font-size: 1.4em; margin-top: 2em; }
  .synopsis { color: #666; font-style: italic; margin-bottom: 1em; }
  .meta { color: #999; font-size: 0.85em; }
  .notes { background: #f9f9f9; border-left: 3px solid #ccc; padding: 0.5em 1em; margin: 1em 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
</style>
</head>
<body>
${parts.join('\n')}
</body>
</html>`;
    }

    return parts.join('\n\n');
  }

  function download() {
    if (format === 'json-backup') {
      exportProjectBackup();
      return;
    }

    const content = buildManuscriptContent();
    const ext = format;
    const mime = format === 'html' ? 'text/html' : format === 'md' ? 'text/markdown' : 'text/plain';

    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectTitle.replace(/\s+/g, '_')}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const json = ev.target?.result as string;
      if (window.confirm('This will replace your current project with the backup. Continue?')) {
        importProjectBackup(json);
        onClose();
      }
    };
    reader.readAsText(file);
    e.currentTarget.value = '';
  }

  if (showManuscriptExport) {
    return <ManuscriptExportDialog onClose={() => setShowManuscriptExport(false)} />;
  }

  if (showBetaReaderPacket) {
    return <BetaReaderPacketDialog onClose={() => setShowBetaReaderPacket(false)} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#16213e] border border-[#0f3460] rounded-xl p-6 w-[520px] max-h-[85vh] overflow-y-auto flex flex-col gap-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Compile & Export</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        {/* Standard Manuscript Format — primary export */}
        <button
          onClick={() => setShowManuscriptExport(true)}
          className="flex items-center justify-between w-full bg-[#1e1b4b] border border-purple-700/50 hover:border-purple-500 rounded-lg px-4 py-3 text-left transition-colors group"
        >
          <div>
            <p className="text-sm font-semibold text-purple-300 group-hover:text-white transition-colors">
              Standard Manuscript Format
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Times New Roman 12pt · double-spaced · 1″ margins · exports as .docx or .epub
            </p>
          </div>
          <span className="text-purple-500 group-hover:text-white transition-colors text-lg">→</span>
        </button>

        <button
          onClick={() => setShowBetaReaderPacket(true)}
          className="flex items-center justify-between w-full bg-[#1e1b4b] border border-purple-700/50 hover:border-purple-500 rounded-lg px-4 py-3 text-left transition-colors group"
        >
          <div>
            <p className="text-sm font-semibold text-purple-300 group-hover:text-white transition-colors">
              Beta Reader Packet
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Reading copy with an optional chapter guide and feedback questions · exports as .docx
            </p>
          </div>
          <span className="text-purple-500 group-hover:text-white transition-colors text-lg">→</span>
        </button>

        <div className="border-t border-[#0f3460] pt-2">
          <p className="text-xs text-gray-600 mb-3">Other export formats</p>
        </div>

        <div className="flex flex-col gap-3 text-sm">
          {/* Format */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Format</label>
            <div className="flex gap-2 flex-wrap">
              {([
                ['txt', 'Plain Text'],
                ['html', 'HTML'],
                ['md', 'Markdown'],
                ['json-backup', '💾 Full Backup (JSON)'],
              ] as [ExportFormat, string][]).map(([f, label]) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`py-1.5 px-3 rounded text-sm transition-colors ${
                    format === f
                      ? 'bg-[#6b46c1] text-white'
                      : 'bg-[#1a1a2e] text-gray-400 hover:text-white border border-[#2d3748]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {format === 'json-backup' && (
            <div className="bg-[#1a1a2e] rounded p-3 text-xs text-gray-400">
              <p className="font-semibold text-gray-300 mb-1">Full project backup includes:</p>
              <p>• {docs.length} manuscript documents</p>
              <p>• {fragments.length} fragments</p>
              <p>• {omittedMaterial.length} omitted material items</p>
              <p>• {notebookEntries.length} notebook entries</p>
              <p>• {codexEntries.length} codex entries</p>
              <p>• {questions.length} questions</p>
              <p>• All tags, links, history, and saved filters</p>
            </div>
          )}

          {format !== 'json-backup' && (
            <>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeTitle} onChange={(e) => setIncludeTitle(e.target.checked)} className="accent-purple-500" />
                <span className="text-gray-300">Include project title</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeSynopsis} onChange={(e) => setIncludeSynopsis(e.target.checked)} className="accent-purple-500" />
                <span className="text-gray-300">Include synopses</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeSceneMeta} onChange={(e) => setIncludeSceneMeta(e.target.checked)} className="accent-purple-500" />
                <span className="text-gray-300">Include scene metadata (POV, etc.)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} className="accent-purple-500" />
                <span className="text-gray-300">Include document notes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={separatorLine} onChange={(e) => setSeparatorLine(e.target.checked)} className="accent-purple-500" />
                <span className="text-gray-300">Section separators</span>
              </label>

              <div className="bg-[#1a1a2e] rounded p-3 text-xs text-gray-500">
                <p className="mb-1 font-semibold text-gray-400">Documents to export ({docs.length}):</p>
                {docs.slice(0, 8).map((d) => (
                  <p key={d.id} className="truncate">• {d.title}</p>
                ))}
                {docs.length > 8 && <p className="italic">…and {docs.length - 8} more</p>}
              </div>
            </>
          )}

          {/* Import backup */}
          <div className="border-t border-[#0f3460] pt-3">
            <button
              onClick={() => setShowImport(!showImport)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showImport ? '▼' : '▶'} Import project backup
            </button>
            {showImport && (
              <div className="mt-2">
                <p className="text-xs text-gray-600 mb-2">Select a .json backup file to restore. This will replace your current project.</p>
                <label className="cursor-pointer text-xs bg-[#2d3748] text-gray-300 hover:bg-[#3d4a5e] px-3 py-1.5 rounded transition-colors inline-block">
                  Choose backup file
                  <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded bg-[#2d3748] text-gray-300 hover:bg-[#3d4a5e] transition-colors">
            Cancel
          </button>
          <button
            onClick={download}
            className="flex-1 py-2 rounded bg-[#6b46c1] text-white hover:bg-[#553c9a] transition-colors font-medium"
          >
            {format === 'json-backup' ? '💾 Export Backup' : '⬇ Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
