import mammoth from 'mammoth';

export interface ParsedItem {
  id: string;
  title: string;
  content: string; // HTML
  wordCount: number;
  headingLevel?: number;
  sourceHeading?: string;
}

export type SplitLevel = 1 | 2 | 3 | 'any';

export interface ParseOptions {
  splitLevel?: SplitLevel;
  fileName?: string;
}

function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function nodesToHtml(nodes: Node[]): string {
  const div = document.createElement('div');
  for (const n of nodes) div.appendChild(n.cloneNode(true));
  return div.innerHTML;
}

export function parseHtmlByHeadings(
  html: string,
  splitLevel: SplitLevel = 1,
  fileName?: string,
): ParsedItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;

  const maxLevel = splitLevel === 'any' ? 6 : (splitLevel as number);

  const items: ParsedItem[] = [];
  let currentTitle = '';
  let currentNodes: Node[] = [];
  let foundAnyHeading = false;
  let currentLevel = 1;

  function isHeading(el: Element): boolean {
    const tag = el.tagName ?? '';
    if (!tag.match(/^H[1-6]$/)) return false;
    const level = parseInt(tag[1]);
    return level >= 1 && level <= maxLevel;
  }

  for (const node of Array.from(body.childNodes)) {
    const el = node as Element;
    if (el.tagName && isHeading(el)) {
      if (foundAnyHeading) {
        const contentHtml = nodesToHtml(currentNodes).trim();
        items.push({
          id: crypto.randomUUID(),
          title: currentTitle,
          content: contentHtml,
          wordCount: countWords(contentHtml),
          headingLevel: currentLevel,
          sourceHeading: currentTitle,
        });
      } else if (currentNodes.length > 0) {
        const contentHtml = nodesToHtml(currentNodes).trim();
        if (contentHtml) {
          items.push({
            id: crypto.randomUUID(),
            title: fileName ? `${fileName} — intro` : 'Introduction',
            content: contentHtml,
            wordCount: countWords(contentHtml),
          });
        }
      }
      currentTitle = el.textContent?.trim() ?? 'Untitled';
      currentLevel = parseInt(el.tagName[1]);
      currentNodes = [];
      foundAnyHeading = true;
    } else {
      currentNodes.push(node);
    }
  }

  // Last section
  const lastHtml = nodesToHtml(currentNodes).trim();
  if (foundAnyHeading || lastHtml) {
    items.push({
      id: crypto.randomUUID(),
      title: currentTitle || (fileName ?? 'Imported Document'),
      content: lastHtml,
      wordCount: countWords(lastHtml),
      headingLevel: foundAnyHeading ? currentLevel : undefined,
      sourceHeading: currentTitle || undefined,
    });
  }

  return items;
}

export async function parseDocx(
  arrayBuffer: ArrayBuffer,
  options: ParseOptions = {},
): Promise<ParsedItem[]> {
  const { splitLevel = 1, fileName } = options;
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;

  const items = parseHtmlByHeadings(html, splitLevel, fileName);

  if (items.length === 0) {
    return [
      {
        id: crypto.randomUUID(),
        title: fileName ?? 'Imported Document',
        content: html,
        wordCount: countWords(html),
      },
    ];
  }

  return items;
}

export function parseMarkdown(text: string, options: ParseOptions = {}): ParsedItem[] {
  const { splitLevel = 1, fileName } = options;
  const maxLevel = splitLevel === 'any' ? 6 : (splitLevel as number);

  const lines = text.split('\n');
  const items: ParsedItem[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];
  let foundHeading = false;
  let currentLevel = 1;

  function mdLinesToHtml(ls: string[]): string {
    const paragraphs: string[] = [];
    let cur = '';
    for (const line of ls) {
      if (line.trim() === '') {
        if (cur.trim()) paragraphs.push(`<p>${cur.trim()}</p>`);
        cur = '';
      } else {
        cur += (cur ? '\n' : '') + line;
      }
    }
    if (cur.trim()) paragraphs.push(`<p>${cur.trim()}</p>`);
    return paragraphs.join('');
  }

  for (const line of lines) {
    const m = line.match(/^(#{1,6}) (.*)/);
    if (m) {
      const level = m[1].length;
      if (level <= maxLevel) {
        if (foundHeading || currentLines.length > 0) {
          const html = mdLinesToHtml(currentLines);
          items.push({
            id: crypto.randomUUID(),
            title: currentTitle || (fileName ?? 'Untitled'),
            content: html,
            wordCount: countWords(html),
            headingLevel: currentLevel,
            sourceHeading: currentTitle,
          });
        }
        currentTitle = m[2].trim();
        currentLevel = level;
        currentLines = [];
        foundHeading = true;
        continue;
      }
    }
    currentLines.push(line);
  }

  // Last
  if (foundHeading || currentLines.length > 0) {
    const html = mdLinesToHtml(currentLines);
    items.push({
      id: crypto.randomUUID(),
      title: currentTitle || (fileName ?? 'Imported Document'),
      content: html,
      wordCount: countWords(html),
      headingLevel: foundHeading ? currentLevel : undefined,
    });
  }

  if (items.length === 0) {
    const html = mdLinesToHtml(lines);
    return [
      {
        id: crypto.randomUUID(),
        title: fileName ?? 'Imported Document',
        content: html,
        wordCount: countWords(html),
      },
    ];
  }

  return items;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

export function delimitedToHtml(text: string, delimiter: string): string {
  const lines = text.split(/\r\n|\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return '';
  let html = '<table><tbody>';
  lines.forEach((line, idx) => {
    const cells = parseDelimitedLine(line, delimiter);
    const tag = idx === 0 ? 'th' : 'td';
    html += '<tr>' + cells.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join('') + '</tr>';
  });
  return html + '</tbody></table>';
}

export function parseDelimited(
  text: string,
  delimiter: string,
  options: ParseOptions = {},
): ParsedItem[] {
  const { fileName } = options;
  const html = delimitedToHtml(text, delimiter);
  const rowCount = Math.max(0, text.split(/\r\n|\n/).filter((l) => l.trim() !== '').length - 1);
  return [
    {
      id: crypto.randomUUID(),
      title: fileName ?? 'Imported Spreadsheet',
      content: html,
      wordCount: rowCount,
    },
  ];
}

export function parsePlainText(text: string, options: ParseOptions = {}): ParsedItem[] {
  const { fileName } = options;
  const html = `<p>${text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>')}</p>`;
  return [
    {
      id: crypto.randomUUID(),
      title: fileName ?? 'Imported Document',
      content: html,
      wordCount: countWords(text),
    },
  ];
}

export async function parseFile(
  file: File,
  options: ParseOptions = {},
): Promise<ParsedItem[]> {
  const opts = { ...options, fileName: options.fileName ?? file.name.replace(/\.[^/.]+$/, '') };

  if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
    const buf = await file.arrayBuffer();
    return parseDocx(buf, opts);
  }

  if (file.name.endsWith('.csv')) {
    const text = await file.text();
    return parseDelimited(text, ',', opts);
  }

  if (file.name.endsWith('.tsv')) {
    const text = await file.text();
    return parseDelimited(text, '\t', opts);
  }

  const text = await file.text();

  if (file.name.endsWith('.md') || file.name.endsWith('.markdown')) {
    return parseMarkdown(text, opts);
  }

  if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
    return parseHtmlByHeadings(text, opts.splitLevel, opts.fileName);
  }

  return parsePlainText(text, opts);
}
