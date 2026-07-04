import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  LineRuleType,
  SectionType,
} from 'docx';
import type { BinderItem, BetaReaderSettings } from '../types';
import {
  FONT,
  FONT_SIZE,
  PAGE_PROPS,
  makeRun,
  htmlToDocxParagraphs,
  gatherChapters,
  formatWordCount,
  countManuscriptWords,
} from './manuscriptExport';

const SINGLE_LINE = 240;

function centerLine(
  text: string,
  opts?: { bold?: boolean; spaceBefore?: number; spaceAfter?: number },
): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: {
      before: opts?.spaceBefore ?? 0,
      after: opts?.spaceAfter ?? 0,
      line: SINGLE_LINE,
      lineRule: LineRuleType.AUTO,
    },
    children: [new TextRun({ text, font: FONT, size: FONT_SIZE, bold: opts?.bold || undefined })],
  });
}

function blankLine(): Paragraph {
  return new Paragraph({
    spacing: { line: SINGLE_LINE, lineRule: LineRuleType.AUTO },
    children: [makeRun('')],
  });
}

/** Splits plain, non-HTML text (e.g. a textarea value) into left-aligned single-spaced paragraphs. */
function plainTextParagraphs(text: string): Paragraph[] {
  return text
    .split('\n')
    .map((line) =>
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 120, line: SINGLE_LINE, lineRule: LineRuleType.AUTO },
        children: [makeRun(line)],
      }),
    );
}

export async function exportBetaReaderPacket(
  binder: BinderItem[],
  projectTitle: string,
  settings: BetaReaderSettings,
  sceneBreakStyle: '#' | '***' = '#',
): Promise<void> {
  const { noteToReaders, includeChapterGuide, includeFeedbackQuestions, feedbackQuestions } = settings;

  const manuscriptItems = binder.filter((b) => b.id !== 'research' && b.id !== 'trash');
  const chapters = gatherChapters(manuscriptItems);
  const totalWords = countManuscriptWords(binder);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docSections: any[] = [];

  // ── Section 1: Title page ─────────────────────────────────────────────────
  const titleChildren: Paragraph[] = [];
  for (let i = 0; i < 8; i++) titleChildren.push(blankLine());
  titleChildren.push(centerLine(projectTitle.toUpperCase(), { bold: true }));
  titleChildren.push(centerLine('Beta Reader Draft', { spaceBefore: 120 }));
  titleChildren.push(centerLine(formatWordCount(totalWords), { spaceBefore: 240 }));

  if (noteToReaders.trim()) {
    titleChildren.push(blankLine());
    titleChildren.push(blankLine());
    titleChildren.push(...plainTextParagraphs(noteToReaders.trim()));
  }

  docSections.push({
    properties: { page: PAGE_PROPS },
    children: titleChildren,
  });

  // ── Section 2: Chapter guide (optional) ───────────────────────────────────
  if (includeChapterGuide && chapters.some((c) => c.isNamedChapter)) {
    const guideChildren: Paragraph[] = [
      centerLine('CHAPTER GUIDE', { bold: true, spaceAfter: 240 }),
    ];

    for (const chapter of chapters) {
      if (!chapter.isNamedChapter) continue;
      guideChildren.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 240, after: 60, line: SINGLE_LINE, lineRule: LineRuleType.AUTO },
          children: [new TextRun({ text: chapter.title, font: FONT, size: FONT_SIZE, bold: true })],
        }),
      );
      if (chapter.synopsis.trim()) {
        guideChildren.push(
          new Paragraph({
            alignment: AlignmentType.LEFT,
            indent: undefined,
            spacing: { before: 0, after: 0, line: SINGLE_LINE, lineRule: LineRuleType.AUTO },
            children: [new TextRun({ text: chapter.synopsis.trim(), font: FONT, size: FONT_SIZE, italics: true })],
          }),
        );
      }
    }

    docSections.push({
      properties: { type: SectionType.NEXT_PAGE, page: PAGE_PROPS },
      children: guideChildren,
    });
  }

  // ── Section 3: Manuscript body (single-spaced reading copy) ───────────────
  const bodyChildren: Paragraph[] = [];
  let isFirstChapter = true;

  for (const chapter of chapters) {
    const needsPageBreak = !isFirstChapter;
    isFirstChapter = false;

    if (chapter.isNamedChapter) {
      bodyChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          pageBreakBefore: needsPageBreak,
          spacing: { before: needsPageBreak ? 0 : 240, after: 240, line: SINGLE_LINE, lineRule: LineRuleType.AUTO },
          children: [new TextRun({ text: chapter.title.toUpperCase(), font: FONT, size: FONT_SIZE, bold: true })],
        }),
      );
    } else if (needsPageBreak) {
      bodyChildren.push(
        new Paragraph({
          pageBreakBefore: true,
          spacing: { before: 0, after: 0, line: SINGLE_LINE, lineRule: LineRuleType.AUTO },
          children: [],
        }),
      );
    }

    for (let i = 0; i < chapter.scenes.length; i++) {
      if (i > 0) {
        bodyChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 120, line: SINGLE_LINE, lineRule: LineRuleType.AUTO },
            children: [makeRun(sceneBreakStyle)],
          }),
        );
      }
      bodyChildren.push(...htmlToDocxParagraphs(chapter.scenes[i].content, sceneBreakStyle, true));
    }
  }

  docSections.push({
    properties: { type: SectionType.NEXT_PAGE, page: PAGE_PROPS },
    children: bodyChildren,
  });

  // ── Section 4: Feedback questions (optional) ──────────────────────────────
  const questionList = feedbackQuestions
    .split('\n')
    .map((q) => q.trim())
    .filter(Boolean);

  if (includeFeedbackQuestions && questionList.length > 0) {
    const feedbackChildren: Paragraph[] = [
      centerLine('A FEW QUESTIONS FOR YOU', { bold: true, spaceAfter: 240 }),
    ];

    questionList.forEach((question, i) => {
      feedbackChildren.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 240, after: 60, line: SINGLE_LINE, lineRule: LineRuleType.AUTO },
          children: [makeRun(`${i + 1}. ${question}`)],
        }),
      );
      // Blank lines for handwritten/typed notes
      for (let j = 0; j < 3; j++) feedbackChildren.push(blankLine());
    });

    docSections.push({
      properties: { type: SectionType.NEXT_PAGE, page: PAGE_PROPS },
      children: feedbackChildren,
    });
  }

  const doc = new Document({ sections: docSections });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectTitle.replace(/\s+/g, '_')}_beta_reader_packet.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function countBetaReaderChapters(binder: BinderItem[]): { chapters: number; withSynopsis: number } {
  const manuscriptItems = binder.filter((b) => b.id !== 'research' && b.id !== 'trash');
  const chapters = gatherChapters(manuscriptItems).filter((c) => c.isNamedChapter);
  return { chapters: chapters.length, withSynopsis: chapters.filter((c) => c.synopsis.trim()).length };
}
