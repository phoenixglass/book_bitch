export function stripHTML(html: string): string {
  return html
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
