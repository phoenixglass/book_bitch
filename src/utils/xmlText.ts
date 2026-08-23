/**
 * XML-safety for generated documents (.docx, .epub).
 *
 * Both formats are zipped XML, and the XML 1.0 spec only allows tab, newline,
 * carriage return, and #x20 upward as text. Control characters below that range
 * are legal in a JS string but make the resulting document.xml unparseable —
 * Word answers with "Word experienced an error trying to open the file" and
 * offers the Text Recovery converter.
 *
 * Imported manuscripts are the usual source: PDF extraction leaves form feeds
 * at page boundaries, and .docx conversion can carry vertical tabs (Word's own
 * soft line break) into headings and body text. The `docx` package writes run
 * text through verbatim, so the characters have to be removed here.
 */

// XML 1.0 Char production: #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | ...
// Vertical tab and form feed separate words, so they become spaces; the rest
// carry no text and are dropped. Matching control characters is the whole
// point of these two patterns, so no-control-regex is off for them.
/* eslint-disable no-control-regex */
const SPACE_LIKE = /[\u000B\u000C]/g;
const ILLEGAL = /[\u0000-\u0008\u000E-\u001F\uFFFE\uFFFF]/g;
/* eslint-enable no-control-regex */
// A surrogate that isn't half of a valid pair encodes no character and is
// illegal on its own; UTF-8 encoding would turn it into U+FFFD anyway.
const SURROGATE = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;

/**
 * Strips characters that cannot appear in XML text. Returns '' for nullish
 * input so callers can pass through possibly-missing titles and labels.
 */
export function sanitizeXmlText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(SPACE_LIKE, ' ')
    .replace(ILLEGAL, '')
    .replace(SURROGATE, (match) => (match.length === 2 ? match : ''));
}
