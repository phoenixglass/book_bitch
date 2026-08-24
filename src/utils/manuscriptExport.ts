import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Header,
  AlignmentType,
  LevelFormat,
  LineRuleType,
  BorderStyle,
  SectionType,
  NumberFormat,
  PageNumber,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  WidthType,
  convertInchesToTwip,
} from 'docx';
import type { FileChild, INumberingOptions, ParagraphChild } from 'docx';
import type { BinderItem, ManuscriptSettings, SceneOrder } from '../types';
import { collectScenes, sortScenes, formatTimelineDate } from './timelineOrder';
import { sanitizeXmlText } from './xmlText';
import { downloadVerifiedArchive } from './exportDownload';
import { imageRunFor, loadDocxImages, type DocxImageMap } from './docxImages';

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
    text: sanitizeXmlText(text),
    font: FONT,
    size: FONT_SIZE,
    bold: fmt?.bold || undefined,
    italics: fmt?.italic || undefined,
    strike: fmt?.strike || undefined,
  });
}

export interface ParagraphIndent {
  left?: number;
  firstLine?: number;
  hanging?: number;
}

export interface MakeParagraphOptions {
  center?: boolean;
  noIndent?: boolean;
  singleSpaced?: boolean;
  spaceBefore?: number;
  spaceAfter?: number;
  pageBreakBefore?: boolean;
  /** Alignment carried over from the source document, when it set one. */
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  /** Indentation carried over from the source document, in twips. */
  indent?: ParagraphIndent;
  numbering?: { reference: string; level: number; instance: number };
}

export function makeParagraph(
  children: readonly ParagraphChild[],
  opts?: MakeParagraphOptions,
): Paragraph {
  const doubleSpaceLineVal = 480; // 240 per single line in Word's units
  const singleSpaceLineVal = 240;

  const alignment = opts?.alignment ?? (opts?.center ? AlignmentType.CENTER : AlignmentType.LEFT);

  // A paragraph that carried its own indentation in the source document keeps
  // it; only paragraphs with nothing of their own fall back to the standard
  // manuscript half-inch first line, and a centred or right-aligned line never
  // wants one. List items take their indentation from the numbering definition
  // instead.
  const wantsDefaultIndent =
    !opts?.noIndent &&
    alignment !== AlignmentType.CENTER &&
    alignment !== AlignmentType.RIGHT;
  const defaultIndent = wantsDefaultIndent ? { firstLine: HALF_INCH } : undefined;
  const indent = opts?.numbering ? undefined : (opts?.indent ?? defaultIndent);

  return new Paragraph({
    alignment,
    indent,
    spacing: {
      line: opts?.singleSpaced ? singleSpaceLineVal : doubleSpaceLineVal,
      lineRule: LineRuleType.AUTO,
      before: opts?.spaceBefore ?? 0,
      after: opts?.spaceAfter ?? 0,
    },
    pageBreakBefore: opts?.pageBreakBefore,
    numbering: opts?.numbering,
    children,
  });
}

// ─── Lists ────────────────────────────────────────────────────────────────────

export const BULLET_NUMBERING = 'bb-bullet';
export const ORDERED_NUMBERING = 'bb-ordered';

const LIST_LEVELS = [0, 1, 2, 3];
const BULLET_GLYPHS = ['\u2022', '\u25E6', '\u25AA', '\u2022'];
const ORDERED_FORMATS = [
  LevelFormat.DECIMAL,
  LevelFormat.LOWER_LETTER,
  LevelFormat.LOWER_ROMAN,
  LevelFormat.DECIMAL,
];

function levelIndent(level: number) {
  return {
    indent: {
      left: convertInchesToTwip(0.5 * (level + 1)),
      hanging: convertInchesToTwip(0.25),
    },
  };
}

/**
 * Every document produced by this app registers the same two list definitions,
 * so `htmlToDocxParagraphs` can point list items at them without each caller
 * having to know about numbering.
 */
export const NUMBERING_CONFIG: INumberingOptions = {
  config: [
    {
      reference: BULLET_NUMBERING,
      levels: LIST_LEVELS.map((level) => ({
        level,
        format: LevelFormat.BULLET,
        text: BULLET_GLYPHS[level],
        alignment: AlignmentType.LEFT,
        style: { paragraph: levelIndent(level) },
      })),
    },
    {
      reference: ORDERED_NUMBERING,
      levels: LIST_LEVELS.map((level) => ({
        level,
        format: ORDERED_FORMATS[level],
        text: `%${level + 1}.`,
        alignment: AlignmentType.LEFT,
        style: { paragraph: levelIndent(level) },
      })),
    },
  ],
};

// Word continues a numbered list wherever the same numbering instance is
// reused, so each <ol> gets its own instance and restarts at 1. The counter is
// only required to be unique within a document; it never needs resetting.
let numberingInstanceSeq = 0;
function nextNumberingInstance(): number {
  numberingInstanceSeq += 1;
  return numberingInstanceSeq;
}

// ─── Inline CSS carried over from imported documents ─────────────────────────

const CSS_LENGTH = /^(-?[\d.]+)\s*(pt|px|in|cm|mm|em|rem)$/;
const TWIPS_PER_UNIT: Record<string, number> = {
  pt: 20,
  px: 15, // 96 CSS px per inch
  in: 1440,
  cm: 567,
  mm: 56.7,
  em: 240, // relative to the 12pt manuscript body size
  rem: 240,
};

function cssLengthToTwip(value: string): number | undefined {
  const match = value.trim().match(CSS_LENGTH);
  if (!match) return undefined;
  const twips = Math.round(parseFloat(match[1]) * TWIPS_PER_UNIT[match[2]]);
  return Number.isFinite(twips) ? twips : undefined;
}

/**
 * Indentation the author set in the source document (Google Docs and .docx
 * imports both write it as inline CSS, and the editor now preserves it).
 * Returns undefined when the paragraph said nothing about its own indentation,
 * which is what lets the manuscript default apply instead.
 */
function indentFromStyle(el: Element): ParagraphIndent | undefined {
  const style = (el as HTMLElement).style;
  if (!style) return undefined;

  const indent: ParagraphIndent = {};
  const left = style.marginLeft ? cssLengthToTwip(style.marginLeft) : undefined;
  if (left !== undefined) indent.left = left;

  if (style.textIndent) {
    const firstLine = cssLengthToTwip(style.textIndent);
    // A negative text-indent is a hanging indent in Word's model.
    if (firstLine !== undefined && firstLine >= 0) indent.firstLine = firstLine;
    else if (firstLine !== undefined) indent.hanging = Math.abs(firstLine);
  }

  return Object.keys(indent).length > 0 ? indent : undefined;
}

const ALIGNMENTS: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  start: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  end: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

function alignmentFromStyle(el: Element): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  const align = (el as HTMLElement).style?.textAlign;
  return align ? ALIGNMENTS[align.trim().toLowerCase()] : undefined;
}

// ─── HTML → Paragraph conversion ─────────────────────────────────────────────

/** An image whose bytes could not be fetched, so the reader knows one is missing. */
function missingImageRun(): TextRun {
  return new TextRun({
    text: '[Image could not be exported]',
    font: FONT,
    size: FONT_SIZE,
    italics: true,
  });
}

function processInlineNodes(node: Node, fmt: RunFmt, images?: DocxImageMap): ParagraphChild[] {
  const runs: ParagraphChild[] = [];

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

      if (tag === 'img') {
        runs.push(images ? (imageRunFor(el, images) ?? missingImageRun()) : missingImageRun());
        continue;
      }

      const newFmt: RunFmt = { ...fmt };
      if (tag === 'strong' || tag === 'b') newFmt.bold = true;
      if (tag === 'em' || tag === 'i') newFmt.italic = true;
      if (tag === 's') newFmt.strike = true;
      // Preserve italics; do not convert to underline

      runs.push(...processInlineNodes(el, newFmt, images));
    }
  }

  return runs;
}

function isSceneBreakText(text: string): boolean {
  return text === '#' || text === '***';
}

const LIST_TAGS = new Set(['ul', 'ol']);

/**
 * A list item's own text, excluding any nested list, which becomes its own
 * deeper-level items rather than being flattened into the parent's text.
 */
function listItemRuns(li: Element, images?: DocxImageMap): ParagraphChild[] {
  const clone = li.cloneNode(true) as Element;
  clone.querySelectorAll('ul, ol').forEach((nested) => nested.remove());
  return processInlineNodes(clone, {}, images);
}

function listToParagraphs(
  list: Element,
  singleSpaced: boolean,
  images?: DocxImageMap,
  level = 0,
  instance = nextNumberingInstance(),
): Paragraph[] {
  const ordered = list.tagName.toLowerCase() === 'ol';
  const reference = ordered ? ORDERED_NUMBERING : BULLET_NUMBERING;
  const paragraphs: Paragraph[] = [];

  for (const li of Array.from(list.children)) {
    if (li.tagName.toLowerCase() !== 'li') continue;

    const runs = listItemRuns(li, images);
    paragraphs.push(
      makeParagraph(runs.length ? runs : [makeRun('')], {
        singleSpaced,
        // Word only supports four levels of the definitions registered above;
        // deeper nesting keeps the deepest one rather than falling apart.
        numbering: { reference, level: Math.min(level, LIST_LEVELS.length - 1), instance },
      }),
    );

    for (const child of Array.from(li.children)) {
      if (!LIST_TAGS.has(child.tagName.toLowerCase())) continue;
      // A nested list of the same kind continues the parent's numbering
      // instance so its counters restart per parent item, as Word expects.
      const nestedOrdered = child.tagName.toLowerCase() === 'ol';
      paragraphs.push(
        ...listToParagraphs(
          child,
          singleSpaced,
          images,
          level + 1,
          nestedOrdered === ordered ? instance : nextNumberingInstance(),
        ),
      );
    }
  }

  return paragraphs;
}

// ─── Tables ───────────────────────────────────────────────────────────────────

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '999999' } as const;

// Table cells are always single-spaced and flush left: a double-spaced,
// first-line-indented manuscript paragraph is unreadable in a narrow cell.
function cellChildren(cell: Element, images?: DocxImageMap): Paragraph[] {
  const header = cell.tagName.toLowerCase() === 'th';
  const blocks = Array.from(cell.children).filter((child) =>
    ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div'].includes(child.tagName.toLowerCase()),
  );

  const paragraphs = (blocks.length ? blocks : [cell]).map((block) =>
    makeParagraph(processInlineNodes(block, { bold: header }, images), {
      noIndent: true,
      singleSpaced: true,
    }),
  );

  // Word requires every cell to hold at least one paragraph.
  return paragraphs.length
    ? paragraphs
    : [makeParagraph([makeRun('')], { noIndent: true, singleSpaced: true })];
}

// Usable width inside the 1" page margins, split evenly between columns so the
// table fills the page instead of collapsing to the library's 100-twip default.
const TEXT_WIDTH = convertInchesToTwip(6.5);

function htmlTableToDocx(table: Element, images?: DocxImageMap): Table | null {
  const rows: TableRow[] = [];
  let maxColumns = 0;

  for (const tr of Array.from((table as HTMLTableElement).rows ?? [])) {
    const cells = Array.from(tr.children).filter((c) =>
      ['td', 'th'].includes(c.tagName.toLowerCase()),
    );
    if (cells.length === 0) continue;
    maxColumns = Math.max(maxColumns, cells.length);

    rows.push(
      new TableRow({
        tableHeader: cells.every((c) => c.tagName.toLowerCase() === 'th'),
        children: cells.map(
          (cell) =>
            new TableCell({
              children: cellChildren(cell, images),
              columnSpan: Number((cell as HTMLTableCellElement).colSpan) || undefined,
              rowSpan: Number((cell as HTMLTableCellElement).rowSpan) || undefined,
            }),
        ),
      }),
    );
  }

  if (rows.length === 0) return null;

  return new Table({
    rows,
    layout: TableLayoutType.AUTOFIT,
    columnWidths: Array.from(
      { length: maxColumns },
      () => Math.floor(TEXT_WIDTH / maxColumns),
    ),
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: CELL_BORDER,
      bottom: CELL_BORDER,
      left: CELL_BORDER,
      right: CELL_BORDER,
      insideHorizontal: CELL_BORDER,
      insideVertical: CELL_BORDER,
    },
  });
}

export function htmlToDocxParagraphs(
  html: string,
  sceneBreakStyle: '#' | '***',
  singleSpaced = false,
  images?: DocxImageMap,
): FileChild[] {
  if (!html?.trim()) return [];
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const result: FileChild[] = [];

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

      const runs = processInlineNodes(el, {}, images);
      // Always create the paragraph; empty body paragraphs preserve spacing
      result.push(
        makeParagraph(runs.length ? runs : [makeRun('')], {
          singleSpaced,
          indent: indentFromStyle(el),
          alignment: alignmentFromStyle(el),
        }),
      );
      continue;
    }

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const text = (el.textContent ?? '').trim();
      result.push(
        makeParagraph(
          [new TextRun({ text: sanitizeXmlText(text).toUpperCase(), font: FONT, size: FONT_SIZE, bold: true })],
          {
            center: true,
            noIndent: true,
            singleSpaced,
            spaceBefore: 240,
            spaceAfter: 120,
            alignment: alignmentFromStyle(el),
          },
        ),
      );
      continue;
    }

    if (LIST_TAGS.has(tag)) {
      result.push(...listToParagraphs(el, singleSpaced, images));
      continue;
    }

    // An image the editor left at block level rather than inside a paragraph.
    if (tag === 'img') {
      const run = images ? imageRunFor(el, images) : null;
      result.push(makeParagraph([run ?? missingImageRun()], { noIndent: true, singleSpaced }));
      continue;
    }

    if (tag === 'table') {
      const table = htmlTableToDocx(el, images);
      if (table) {
        result.push(table);
        // Word needs a paragraph after a table, and two adjacent tables would
        // otherwise be merged into one.
        result.push(makeParagraph([makeRun('')], { noIndent: true, singleSpaced }));
      }
      continue;
    }

    // Default: treat as body paragraph
    const runs = processInlineNodes(el, {}, images);
    if (runs.length) {
      result.push(
        makeParagraph(runs, {
          singleSpaced,
          indent: indentFromStyle(el),
          alignment: alignmentFromStyle(el),
        }),
      );
    }
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
  /** Timeline date label, set only for chronologically ordered exports. */
  timelineLabel?: string;
}

/**
 * Chronological export: the binder's folder grouping no longer describes the
 * reading order, so every scene becomes its own titled section, sorted exactly
 * as the Timeline view's Chronological mode sorts them (scenes with no
 * timeline placement keep their binder order and fall at the end).
 */
function gatherChronologicalChapters(items: BinderItem[]): Chapter[] {
  return sortScenes(collectScenes(items), 'chronological').map((scene) => ({
    title: scene.title,
    isNamedChapter: true,
    synopsis: scene.synopsis ?? '',
    scenes: [{ title: scene.title, content: scene.content ?? '' }],
    timelineLabel: formatTimelineDate(scene.sceneMetadata) ?? undefined,
  }));
}

export function gatherChapters(
  items: BinderItem[],
  order: SceneOrder = 'manuscript',
): Chapter[] {
  if (order === 'chronological') return gatherChronologicalChapters(items);

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

  // Projects saved before chronological export existed have no exportOrder.
  const exportOrder: SceneOrder = settings.exportOrder ?? 'manuscript';
  const includeTimelineDates = settings.includeTimelineDates ?? false;

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
                text: sanitizeXmlText(`${authorLastName} / ${shortTitle} / `),
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
        children: [new TextRun({ text: sanitizeXmlText(text), font: FONT, size: FONT_SIZE })],
      });

    const centerLine = (text: string, bold = false) =>
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 240, lineRule: LineRuleType.AUTO },
        children: [new TextRun({ text: sanitizeXmlText(text), font: FONT, size: FONT_SIZE, bold: bold || undefined })],
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
  const bodyChildren: FileChild[] = [];
  const chapters = gatherChapters(manuscriptItems, exportOrder);
  let isFirstChapter = true;

  // Every image in the export, fetched once up front: the HTML→docx conversion
  // itself is synchronous, and Word needs the bytes, not the URL.
  const images = await loadDocxImages([
    ...chapters.flatMap((chapter) => chapter.scenes.map((scene) => scene.content)),
    synopsisContent,
    queryLetterContent,
  ]);

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
            new TextRun({ text: sanitizeXmlText(chapter.title).toUpperCase(), font: FONT, size: FONT_SIZE }),
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

    // Timeline date line, under the scene title in chronological exports
    if (includeTimelineDates && chapter.timelineLabel) {
      bodyChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: convertInchesToTwip(0.25), line: 480, lineRule: LineRuleType.AUTO },
          children: [
            new TextRun({
              text: sanitizeXmlText(chapter.timelineLabel),
              font: FONT,
              size: FONT_SIZE,
              italics: true,
            }),
          ],
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
      const sceneParagraphs = htmlToDocxParagraphs(
        chapter.scenes[i].content,
        sceneBreakStyle,
        false,
        images,
      );
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
    const synopsisChildren: FileChild[] = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 480, line: 240, lineRule: LineRuleType.AUTO },
        children: [
          new TextRun({
            text: sanitizeXmlText(`${bookTitle.toUpperCase()} — SYNOPSIS`),
            font: FONT,
            size: FONT_SIZE,
            bold: true,
          }),
        ],
      }),
      ...htmlToDocxParagraphs(synopsisContent, sceneBreakStyle, true, images),
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
    const queryChildren: FileChild[] = [
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
      ...htmlToDocxParagraphs(queryLetterContent, sceneBreakStyle, true, images),
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
  const doc = new Document({ numbering: NUMBERING_CONFIG, sections: docSections });
  const blob = await Packer.toBlob(doc);
  const orderSuffix = exportOrder === 'chronological' ? '_chronological' : '';
  await downloadVerifiedArchive(
    blob,
    `${sanitizeXmlText(bookTitle).replace(/\s+/g, '_')}_manuscript${orderSuffix}.docx`,
  );
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
