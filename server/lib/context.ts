export function stripHTML(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text: string, maxChars = 24000): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: text.slice(0, maxChars) + '\n\n[Content truncated — too long for a single AI call]',
    truncated: true,
  };
}

// Story Briefs are written with '## HEADING' sections (see generate-brief route).
// Pulling a section out by name lets us hand the model a short, concrete list
// (e.g. character names) instead of relying on it to mine specifics out of a
// long prose Brief, which models tend to skim past in favor of vaguer phrasing.
export function extractBriefSection(brief: string, heading: string): string {
  const re = new RegExp(`##\\s*${heading}\\b([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const match = brief.match(re);
  return match ? match[1].trim() : '';
}

export function modePreamble(mode: string, allowDrafting: boolean): string {
  const lines: string[] = [];

  if (mode === 'questions_only') {
    lines.push(
      'STRICT MODE — QUESTIONS ONLY: You must ONLY ask questions.',
      'Never write prose, dialogue, scene content, or narrative summaries.',
      'If asked for a summary, produce bullet points only — no flowing prose.',
    );
  } else if (!allowDrafting) {
    lines.push(
      'DO NOT DRAFT PROSE: Do not write new manuscript content, dialogue, scene continuations, or narrative text.',
      'Your output is analytical only.',
    );
  }

  return lines.join('\n');
}
