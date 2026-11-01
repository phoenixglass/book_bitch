/**
 * Tolerant readers for scene metadata.
 *
 * The types say list fields are string[] and text fields are strings, but
 * stored projects don't always agree: AI output is written into scenes as the
 * model returned it, and older imports predate some fields. A list might
 * arrive as "Mara, Ilya", contain nulls, or hold {name: "Mara"} objects; a
 * text field might be a number or null. Anything that iterates or trims these
 * values should go through here instead of trusting the type.
 */

function textOf(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['name', 'label', 'title', 'value']) {
      if (typeof o[k] === 'string') return (o[k] as string).trim();
    }
  }
  return '';
}

/** A single text value; '' when missing or unusable. */
export function toText(v: unknown): string {
  return textOf(v);
}

/** A list of non-empty strings. A bare string is treated as a comma-separated list. */
export function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  const one = textOf(v);
  return one ? [one] : [];
}

/** A 1–10 scale value; null when unset, zero or not a number ("7" is accepted). */
export function toScale(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}
