import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Header,
  AlignmentType,
  LineRuleType,
  SectionType,
  NumberFormat,
  PageNumber,
  convertInchesToTwip,
} from 'docx';
import type { BinderItem, ManuscriptSettings } from '../types';

export const FONT = 'Times New Roman';
export const FONT_SIZE = 24; // half-points: 24 = 12pt
const INCH = convertInchesToTwip(1);
const HALF_INCH = convertInchesToTwip(0.5);

export const PAGE_PROPS = {
  size: {
    width: convertInchesToTwip(8.5),
    height: convertInchesToTwip(11),
  },
  margin: {
    top: INCH,
    right: INCH,
    bottom: INCH,
    left: INCH,
  },
};

// ─── Text/paragraph helpers ───────────────────────────────────────────────────

interface RunFmt {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
}

export function makeRun(text: string, fmt?: RunFmt): TextRun {
  return new TextRun({
    text,
    font: FONT,
    size: FONT_SIZE,
    bold: fmt?.bold || undefined,
    italics: fmt?.italic || undefined,
    strike: fmt?.strike || undefined,
  });
}

export function makeParagraph(
  children: TextRun[],
  opts?: {
    center?: boolean;
    noIndent?: boolean;
    singleSpaced?: boolean;
    spaceBefore?: number;
    spaceAfter?: number;
    pageBreakBefore?: boolean;
  },
): Paragraph {
  const doubleSpaceLineVal = 480; // 240 per single line in Word's units
  const singleSpaceLineVal = 240;

  return new Paragraph({
    alignment: opts?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    indent: !opts?.noIndent && !opts?.center ? { firstLine: HALF_INCH } : undefined,
    spacing: {
      line: opts?.singleSpaced ? singleSpaceLineVal : doubleSpaceLineVal,
      lineRule: LineRuleType.AUTO,
      before: opts?.spaceBefore ?? 0,
      after: opts?.spaceAfter ?? 0,
    },
    pageBreakBefore: opts?.pageBreakBefore,
    children,
  });
}

// ─── HTML → Paragraph conversion ─────────────────────────────────────────────

function processInlineNodes(node: Node, fmt: RunFmt): TextRun[] {
  const runs: TextRun[] = [];

  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const raw = child.textContent ?? '';
      // Normalize multiple spaces to single space
      const text = raw.replace(/  +/g, ' ');
      if (text) runs.push(makeRun(text, fmt));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();

      if (tag === 'br') {
        // Soft line break inside paragraph
        runs.push(new TextRun({ text: '', break: 1 }));
        continue;
      }

      const newFmt: RunFmt = { ...fmt };
      if (tag === 'strong' || tag === 'b') newFmt.bold = true;
      if (tag === 'em' || tag === 'i') newFmt.italic = true;
      if (tag === 's') newFmt.strike = true;
      // Preserve italics; do not convert to underline

      runs.push(...processInlineNodes(el, newFmt));
    }
  }

  return runs;
}

function isSceneBreakText(text: string): boolean {
  return text === '#' || text === '***';
}

export function htmlToDocxParagraphs(
  html: string,
  sceneBreakStyle: '#' | '***',
  singleSpaced = false,
): Paragraph[] {
  if (!html?.trim()) return [];
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const result: Paragraph[] = [];

  for (const node of dom.body.childNodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    // <hr> → scene break
    if (tag === 'hr') {
      result.push(
        makeParagraph([makeRun(sceneBreakStyle)], { center: true, singleSpaced }),
      );
      continue;
    }

    if (tag === 'p') {
      const plainText = (el.textContent ?? '').trim();

      // Paragraph containing only # or *** → scene break
      if (isSceneBreakText(plainText)) {
        result.push(
          makeParagraph([makeRun(sceneBreakStyle)], { center: true, singleSpaced }),
        );
        continue;
      }

      const runs = processInlineNodes(el, {});
      // Always create the paragraph; empty body paragraphs preserve spacing
      result.push(makeParagraph(runs.length ? runs : [makeRun('')], { singleSpaced }));
      continue;
    }

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const text = (el.textContent ?? '').trim();
      result.push(
        makeParagraph(
          [new TextRun({ text: text.toUpperCase(), font: FONT, size: FONT_SIZE, bold: true })],
          { center: true, noIndent: true, singleSpaced, spaceBefore: 240, spaceAfter: 120 },
        ),
      );
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      for (const liNode of el.childNodes) {
        if (liNode.nodeType !== Node.ELEMENT_NODE) continue;
        const runs = processInlineNodes(liNode, {});
        result.push(makeParagraph(runs, { singleSpaced }));
      }
      continue;
    }

    // Default: treat as body paragraph
    const runs = processInlineNodes(el, {});
    if (runs.length) result.push(makeParagraph(runs, { singleSpaced }));
  }

  return result;
}

// ─── Binder traversal ─────────────────────────────────────────────────────────

export interface SceneItem {
  title: string;
  content: string;
}

export interface Chapter {
  title: string;
  isNamedChapter: boolean; // true when a folder gives the chapter its name
  synopsis: string;
  scenes: SceneItem[];
}

export function gatherChapters(items: BinderItem[]): Chapter[] {
  const chapters: Chapter[] = [];

  for (const item of items) {
    if (item.id === 'trash') continue;

    if (item.type === 'folder') {
      const scenes = item.children
        .filter((c) => c.type === 'document' && c.id !== 'trash')
        .map((c) => ({ title: c.title, content: c.content ?? '' }));

      if (scenes.length > 0) {
        chapters.push({ title: item.title, isNamedChapter: true, synopsis: item.synopsis ?? '', scenes });
      }
      // Recurse into sub-folders
      chapters.push(...gatherChapters(item.children.filter((c) => c.type === 'folder')));
    } else if (item.type === 'document') {
      // Top-level document becomes its own single-scene chapter
      chapters.push({
        title: item.title,
        isNamedChapter: false,
        synopsis: item.synopsis ?? '',
        scenes: [{ title: item.title, content: item.content ?? '' }],
      });
    }
  }

  return chapters;
}

function countAllWords(items: BinderItem[]): number {
  let total = 0;
  for (const item of items) {
    if (item.id === 'trash' || item.id === 'research') continue;
    if (item.type === 'document' && item.content) {
      const dom = new DOMParser().parseFromString(item.content, 'text/html');
      const text = dom.body.textContent ?? '';
      total += text.trim().split(/\s+/).filter(Boolean).length;
    }
    total += countAllWords(item.children);
  }
  return total;
}

export function formatWordCount(n: number): string {
  if (n < 1000) return `${n} words`;
  const rounded = Math.round(n / 100) * 100;
  return `Approximately ${rounded.toLocaleString()} words`;
}

// ─── Main export function ─────────────────────────────────────────────────────

export async function exportManuscriptDocx(
  binder: BinderItem[],
  projectTitle: string,
  settings: ManuscriptSettings,
): Promise<void> {
  const {
    authorName,
    authorEmail,
    authorPhone,
    authorAddress,
    bookTitle: settingsTitle,
    subtitle,
    genre,
    sceneBreakStyle,
    includeEndMarker,
    includeChapterTitles,
    includeTitlePage,
    includePageNumbers,
    includeSynopsis,
    synopsisContent,
    includeQueryLetter,
    queryLetterContent,
  } = settings;

  const bookTitle = settingsTitle.trim() || projectTitle;
  const authorLastName =
    authorName.trim().split(/\s+/).pop()?.toUpperCase() ?? authorName.toUpperCase();
  const shortTitle = bookTitle.split(/\s+/).slice(0, 3).join(' ').toUpperCase();

  // Manuscript items: exclude research and trash at root level
  const manuscriptItems = binder.filter(
    (b) => b.id !== 'research' && b.id !== 'trash',
  );

  const totalWords = countAllWords(manuscriptItems);
  const wordCountLabel = formatWordCount(totalWords);

  // ── Running header ────────────────────────────────────────────────────────
  const runningHeader = includePageNumbers
    ? new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
            children: [
              new TextRun({
                text: `${authorLastName} / ${shortTitle} / `,
                font: FONT,
                size: FONT_SIZE,
              }),
              new TextRun({
                children: [PageNumber.CURRENT],
                font: FONT,
                size: FONT_SIZE,
              }),
            ],
          }),
        ],
      })
    : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docSections: any[] = [];

  // ── Section 1: Title Page ─────────────────────────────────────────────────
  if (includeTitlePage) {
    const titlePageChildren: Paragraph[] = [];

    const singleLine = (text: string) =>
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
        children: [new TextRun({ text, font: FONT, size: FONT_SIZE })],
      });

    const centerLine = (text: string, bold = false) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
        children: [new TextRun({ text, font: FONT, size: FONT_SIZE, bold: bold || undefined })],
      });

    // Author contact block — top left
    if (authorName) titlePageChildren.push(singleLine(authorName));
    if (authorAddress) titlePageChildren.push(singleLine(authorAddress));
    if (authorPhone) titlePageChildren.push(singleLine(authorPhone));
    if (authorEmail) titlePageChildren.push(singleLine(authorEmail));
    titlePageChildren.push(singleLine(wordCountLabel));

    // Blank lines to push title to roughly 1/3 of the way down the page
    for (let i = 0; i < 9; i++) {
      titlePageChildren.push(
        new Paragraph({
          spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
          children: [new TextRun({ text: '', font: FONT, size: FONT_SIZE })],
        }),
      );
    }

    // Book title (centered, all caps)
    titlePageChildren.push(centerLine(bookTitle.toUpperCase()));

    if (subtitle) titlePageChildren.push(centerLine(subtitle));
    if (genre) titlePageChildren.push(centerLine(genre));

    // "by"
    titlePageChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 240, line: 240, lineRule: LineRuleType.AUTO },
        children: [new TextRun({ text: 'by', font: FONT, size: FONT_SIZE })],
      }),
    );

    if (authorName) titlePageChildren.push(centerLine(authorName));

    docSections.push({
      properties: { page: PAGE_PROPS },
      children: titlePageChildren,
    });
  }

  // ── Section 2: Manuscript Body ────────────────────────────────────────────
  const bodyChildren: Paragraph[] = [];
  const chapters = gatherChapters(manuscriptItems);
  let isFirstChapter = true;

  for (const chapter of chapters) {
    const needsPageBreak = !isFirstChapter;
    isFirstChapter = false;

    if (includeChapterTitles && chapter.isNamedChapter) {
      bodyChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          pageBreakBefore: needsPageBreak,
          spacing: {
            before: needsPageBreak ? 0 : convertInchesToTwip(2),
            after: convertInchesToTwip(0.5),
            line: 480,
            lineRule: LineRuleType.AUTO,
          },
          children: [
            new TextRun({ text: chapter.title.toUpperCase(), font: FONT, size: FONT_SIZE }),
          ],
        }),
      );
    } else if (needsPageBreak) {
      bodyChildren.push(
        new Paragraph({
          pageBreakBefore: true,
          spacing: { before: 0, after: 0, line: 480, lineRule: LineRuleType.AUTO },
          children: [],
        }),
      );
    }

    // Scenes within this chapter
    for (let i = 0; i < chapter.scenes.length; i++) {
      if (i > 0) {
        // Scene break between scenes (not before first scene)
        bodyChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 240, line: 480, lineRule: LineRuleType.AUTO },
            children: [new TextRun({ text: sceneBreakStyle, font: FONT, size: FONT_SIZE })],
          }),
        );
      }
      const sceneParagraphs = htmlToDocxParagraphs(chapter.scenes[i].content, sceneBreakStyle);
      bodyChildren.push(...sceneParagraphs);
    }
  }

  // Optional END marker
  if (includeEndMarker && bodyChildren.length > 0) {
    bodyChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 480, after: 0, line: 480, lineRule: LineRuleType.AUTO },
        children: [new TextRun({ text: 'END', font: FONT, size: FONT_SIZE })],
      }),
    );
  }

  docSections.push({
    properties: {
      type: includeTitlePage ? SectionType.NEXT_PAGE : undefined,
      page: {
        ...PAGE_PROPS,
        pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
      },
    },
    headers: runningHeader ? { default: runningHeader } : undefined,
    children: bodyChildren,
  });

  // ── Section 3: Synopsis (optional, single-spaced) ─────────────────────────
  if (includeSynopsis && synopsisContent.trim()) {
    const synopsisChildren: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 480, line: 240, lineRule: LineRuleType.AUTO },
        children: [
          new TextRun({
            text: `${bookTitle.toUpperCase()} — SYNOPSIS`,
            font: FONT,
            size: FONT_SIZE,
            bold: true,
          }),
        ],
      }),
      ...htmlToDocxParagraphs(synopsisContent, sceneBreakStyle, true),
    ];

    docSections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: PAGE_PROPS,
      },
      headers: runningHeader ? { default: runningHeader } : undefined,
      children: synopsisChildren,
    });
  }

  // ── Section 4: Query Letter (optional, single-spaced) ─────────────────────
  if (includeQueryLetter && queryLetterContent.trim()) {
    const queryChildren: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 480, line: 240, lineRule: LineRuleType.AUTO },
        children: [
          new TextRun({
            text: 'QUERY LETTER',
            font: FONT,
            size: FONT_SIZE,
            bold: true,
          }),
        ],
      }),
      ...htmlToDocxParagraphs(queryLetterContent, sceneBreakStyle, true),
    ];

    docSections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: PAGE_PROPS,
      },
      headers: runningHeader ? { default: runningHeader } : undefined,
      children: queryChildren,
    });
  }

  // ── Build and download ────────────────────────────────────────────────────
  const doc = new Document({ sections: docSections });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${bookTitle.replace(/\s+/g, '_')}_manuscript.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Cleanup detection ────────────────────────────────────────────────────────

export interface CleanupIssue {
  type: 'double_space' | 'missing_indent' | 'tab_indent' | 'extra_blank' | 'underline_as_italic';
  description: string;
  count: number;
}

export function detectManuscriptIssues(binder: BinderItem[]): CleanupIssue[] {
  const issues: CleanupIssue[] = [];
  let doubleSpaces = 0;
  let tabIndents = 0;
  let underlines = 0;

  function scanItem(item: BinderItem) {
    if (item.id === 'trash' || item.id === 'research') return;
    if (item.type === 'document' && item.content) {
      const dom = new DOMParser().parseFromString(item.content, 'text/html');
      const text = dom.body.textContent ?? '';

      // Double spaces after sentence-ending punctuation
      const ds = (text.match(/[.!?]  +/g) ?? []).length;
      // Also catch double spaces anywhere
      const ds2 = (text.match(/  +/g) ?? []).length;
      doubleSpaces += Math.max(ds, ds2);

      // Tab indentation
      const tabs = (text.match(/\t/g) ?? []).length;
      tabIndents += tabs;

      // Underline used (u element in HTML)
      const uEls = dom.body.querySelectorAll('u').length;
      underlines += uEls;
    }
    for (const child of item.children) scanItem(child);
  }

  for (const item of binder) scanItem(item);

  if (doubleSpaces > 0) {
    issues.push({
      type: 'double_space',
      description: 'Double spaces detected — manuscript format requires single spaces between sentences.',
      count: doubleSpaces,
    });
  }
  if (tabIndents > 0) {
    issues.push({
      type: 'tab_indent',
      description: 'Tab characters detected — paragraph indentation should use paragraph formatting, not tabs.',
      count: tabIndents,
    });
  }
  if (underlines > 0) {
    issues.push({
      type: 'underline_as_italic',
      description: 'Underlined text detected — check whether underlining was intended as italics. Manuscript format preserves actual italics.',
      count: underlines,
    });
  }

  return issues;
}

export function countManuscriptWords(binder: BinderItem[]): number {
  const manuscriptItems = binder.filter(
    (b) => b.id !== 'research' && b.id !== 'trash',
  );
  return countAllWords(manuscriptItems);
}
