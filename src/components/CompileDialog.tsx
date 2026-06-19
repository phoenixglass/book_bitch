import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { BinderItem } from '../types';

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .trim();
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    .replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<mark[^>]*>(.*?)<\/mark>/gi, '==$1==')
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) =>
      c
        .replace(/<[^>]+>/g, '')
        .split('\n')
        .map((l: string) => `> ${l}`)
        .join('\n'),
    )
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?(ul|ol|li)[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectDocuments(items: BinderItem[]): BinderItem[] {
  const docs: BinderItem[] = [];
  for (const item of items) {
    if (item.type === 'document' && item.id !== 'trash') {
      docs.push(item);
    }
    if (item.type === 'folder' && item.id !== 'trash') {
      docs.push(...collectDocuments(item.children));
    }
  }
  return docs;
}

interface CompileDialogProps {
  onClose: () => void;
}

export function CompileDialog({ onClose }: CompileDialogProps) {
  const { binder, projectTitle } = useAppStore();
  const [format, setFormat] = useState<'txt' | 'html' | 'md'>('txt');
  const [includeTitle, setIncludeTitle] = useState(true);
  const [includeSynopsis, setIncludeSynopsis] = useState(false);
  const [separatorLine, setSeparatorLine] = useState(true);

  const docs = collectDocuments(binder);

  function buildContent(): string {
    const parts: string[] = [];

    if (includeTitle) {
      if (format === 'html') {
        parts.push(`<h1>${projectTitle}</h1>`);
      } else if (format === 'md') {
        parts.push(`# ${projectTitle}\n`);
      } else {
        parts.push(`${projectTitle}\n${'='.repeat(projectTitle.length)}\n`);
      }
    }

    for (const doc of docs) {
      if (format === 'html') {
        parts.push(`<h2>${doc.title}</h2>`);
        if (includeSynopsis && doc.synopsis) {
          parts.push(`<p class="synopsis"><em>${doc.synopsis}</em></p>`);
        }
        parts.push(doc.content || '<p></p>');
        if (separatorLine) parts.push('<hr />');
      } else if (format === 'md') {
        parts.push(`## ${doc.title}\n`);
        if (includeSynopsis && doc.synopsis) {
          parts.push(`*${doc.synopsis}*\n`);
        }
        parts.push(htmlToMarkdown(doc.content));
        if (separatorLine) parts.push('\n---\n');
      } else {
        parts.push(doc.title);
        parts.push('-'.repeat(doc.title.length));
        if (includeSynopsis && doc.synopsis) {
          parts.push(`[${doc.synopsis}]\n`);
        }
        parts.push(stripHtml(doc.content));
        if (separatorLine) parts.push('\n* * *\n');
      }
    }

    if (format === 'html') {
      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${projectTitle}</title>
<style>
  body { font-family: Georgia, serif; max-width: 700px; margin: 4rem auto; line-height: 1.7; color: #333; }
  h1 { font-size: 2em; margin-bottom: 0.5em; }
  h2 { font-size: 1.4em; margin-top: 2em; }
  .synopsis { color: #666; font-style: italic; margin-bottom: 1em; }
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
    const content = buildContent();
    const ext = format;
    const mime =
      format === 'html'
        ? 'text/html'
        : format === 'md'
        ? 'text/markdown'
        : 'text/plain';
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectTitle.replace(/\s+/g, '_')}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-[#16213e] border border-[#0f3460] rounded-xl p-6 w-[480px] flex flex-col gap-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Compile</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors text-xl"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3 text-sm">
          <div>
            <label className="text-xs text-gray-400 block mb-1">
              Export Format
            </label>
            <div className="flex gap-2">
              {(['txt', 'html', 'md'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`flex-1 py-2 rounded text-sm transition-colors ${
                    format === f
                      ? 'bg-[#6b46c1] text-white'
                      : 'bg-[#1a1a2e] text-gray-400 hover:text-white border border-[#2d3748]'
                  }`}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTitle}
              onChange={(e) => setIncludeTitle(e.target.checked)}
              className="accent-purple-500"
            />
            <span className="text-gray-300">Include project title</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSynopsis}
              onChange={(e) => setIncludeSynopsis(e.target.checked)}
              className="accent-purple-500"
            />
            <span className="text-gray-300">Include document synopses</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={separatorLine}
              onChange={(e) => setSeparatorLine(e.target.checked)}
              className="accent-purple-500"
            />
            <span className="text-gray-300">Section separators</span>
          </label>

          <div className="bg-[#1a1a2e] rounded p-3 text-xs text-gray-500">
            <p className="mb-1 font-semibold text-gray-400">
              Documents to export ({docs.length}):
            </p>
            {docs.slice(0, 8).map((d) => (
              <p key={d.id} className="truncate">
                • {d.title}
              </p>
            ))}
            {docs.length > 8 && (
              <p className="italic">…and {docs.length - 8} more</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded bg-[#2d3748] text-gray-300 hover:bg-[#3d4a5e] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={download}
            className="flex-1 py-2 rounded bg-[#6b46c1] text-white hover:bg-[#553c9a] transition-colors font-medium"
          >
            ⬇ Download
          </button>
        </div>
      </div>
    </div>
  );
}
