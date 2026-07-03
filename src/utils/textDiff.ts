import { diffWordsWithSpace, type Change } from 'diff';

/**
 * Converts scene HTML into plain text for diffing, preserving paragraph
 * breaks so word-level diffs don't run whole documents onto one line.
 */
export function htmlToDiffText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, br').forEach((el) => {
    el.after(document.createTextNode('\n'));
  });
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export interface DiffStat {
  added: number;
  removed: number;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export function computeWordDiff(oldHtml: string, newHtml: string): { parts: Change[]; stat: DiffStat } {
  const parts = diffWordsWithSpace(htmlToDiffText(oldHtml), htmlToDiffText(newHtml));
  const stat = parts.reduce<DiffStat>(
    (acc, part) => {
      if (part.added) acc.added += countWords(part.value);
      if (part.removed) acc.removed += countWords(part.value);
      return acc;
    },
    { added: 0, removed: 0 },
  );
  return { parts, stat };
}
