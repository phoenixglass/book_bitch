// Shared text-analysis helpers for word counting and self-editing aids
// (repeated-word / filter-word detection). Pure functions, no store dependency.

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(html: string): number {
  const text = stripHtml(html);
  return text ? text.split(' ').filter(Boolean).length : 0;
}

// ─── Filter / crutch words ────────────────────────────────────────────────────
// Common words and phrases that dilute prose — flagged for the writer to review,
// not automatically removed.

export const FILTER_WORDS: string[] = [
  'very', 'just', 'really', 'quite', 'rather', 'somewhat', 'actually',
  'basically', 'literally', 'totally', 'completely', 'absolutely',
  'definitely', 'certainly', 'probably', 'perhaps', 'maybe', 'simply',
  'suddenly', 'immediately', 'extremely', 'incredibly', 'especially',
  'particularly', 'generally', 'essentially', 'virtually', 'practically',
  'seemingly', 'apparently', 'obviously', 'clearly', 'somehow', 'anyway',
  'nearly', 'almost', 'slightly', 'fairly', 'pretty', 'honestly',
  'sort of', 'kind of', 'a bit', 'a lot', 'in order to', 'started to',
  'began to', 'seemed to', 'tried to', 'decided to', 'managed to',
  'was able to', 'in fact', 'of course',
];

export interface FilterWordHit {
  word: string;
  count: number;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function analyzeFilterWords(plainText: string): FilterWordHit[] {
  const hits: FilterWordHit[] = [];
  for (const phrase of FILTER_WORDS) {
    const regex = new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'gi');
    const matches = plainText.match(regex);
    if (matches && matches.length > 0) {
      hits.push({ word: phrase, count: matches.length });
    }
  }
  return hits.sort((a, b) => b.count - a.count);
}

// ─── Repeated / overused words ────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for',
  'with', 'as', 'by', 'from', 'is', 'was', 'were', 'are', 'be', 'been',
  'being', 'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she',
  'they', 'him', 'her', 'them', 'his', 'hers', 'their', 'i', 'you', 'we',
  'my', 'your', 'our', 'me', 'us', 'not', 'no', 'so', 'if', 'then', 'than',
  'when', 'while', 'because', 'about', 'into', 'over', 'after', 'before',
  'through', 'up', 'down', 'out', 'off', 'again', 'further', 'once', 'here',
  'there', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'only', 'own', 'same', 'too', 'can', 'will', 'just',
  'also', 'had', 'have', 'has', 'did', 'does', 'do', 'would', 'could',
  'should', 'what', 'which', 'who', 'whom', 'said',
]);

export interface RepeatedWordHit {
  word: string;
  count: number;
  closeRepeats: number;
}

export function analyzeRepeatedWords(
  plainText: string,
  opts: { minLength?: number; window?: number; topN?: number } = {},
): RepeatedWordHit[] {
  const { minLength = 4, window = 60, topN = 20 } = opts;
  const rawWords = plainText.toLowerCase().match(/[a-z']+/g) ?? [];

  const freq = new Map<string, number>();
  const lastSeenIndex = new Map<string, number>();
  const closeRepeats = new Map<string, number>();

  rawWords.forEach((word, idx) => {
    if (word.length < minLength || STOPWORDS.has(word)) return;
    freq.set(word, (freq.get(word) ?? 0) + 1);
    const last = lastSeenIndex.get(word);
    if (last !== undefined && idx - last <= window) {
      closeRepeats.set(word, (closeRepeats.get(word) ?? 0) + 1);
    }
    lastSeenIndex.set(word, idx);
  });

  const results: RepeatedWordHit[] = [];
  for (const [word, count] of freq.entries()) {
    if (count < 2) continue;
    results.push({ word, count, closeRepeats: closeRepeats.get(word) ?? 0 });
  }

  results.sort((a, b) => b.closeRepeats - a.closeRepeats || b.count - a.count);
  return results.slice(0, topN);
}
