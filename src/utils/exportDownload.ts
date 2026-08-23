import JSZip from 'jszip';
import { findIllegalXmlChar } from './xmlText';

/**
 * Hands a generated file to the browser.
 *
 * The object URL is revoked on a timer rather than immediately after click().
 * Revoking synchronously races the browser's download pipeline: it has only
 * been handed a URL at that point, and for anything larger than a few hundred
 * kilobytes it may still be reading the blob when the URL is pulled out from
 * under it. The download then lands truncated, which for a .docx or .epub —
 * both zip archives that keep their index at the end of the file — means Word
 * or the reader refuses to open it. The delay costs nothing but the blob's
 * memory for a minute.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** Parts of a .docx/.epub archive whose contents have to be well-formed XML. */
const XML_PART = /\.(xml|rels|xhtml|opf|ncx)$/;

/**
 * Reads a finished .docx/.epub back and confirms every XML part in it is
 * something Word (or an ebook reader) can actually parse.
 *
 * Manuscript text arrives from PDF and .docx import, and a single character
 * XML has no way to represent — a form feed left at a page boundary, a
 * vertical tab from a Word soft line break — makes the whole archive
 * unreadable. Everything is sanitized on the way in, so this should never
 * fire; if it does, the export stops with a message naming the character
 * instead of producing a file that opens as "Word experienced an error
 * trying to open the file".
 */
export async function assertReadableArchive(blob: Blob): Promise<void> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const parser = new DOMParser();

  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir || !XML_PART.test(name)) continue;

    const xml = await entry.async('string');

    const illegal = findIllegalXmlChar(xml);
    if (illegal) {
      throw new Error(
        `The export contains a character that Word cannot read (${illegal.codePoint}), ` +
          `near: "${illegal.context.trim()}". This usually comes from imported PDF or ` +
          `Word text — please report it so the importer can be fixed.`,
      );
    }

    if (parser.parseFromString(xml, 'application/xml').querySelector('parsererror')) {
      throw new Error(
        `The export produced a damaged ${name}, so Word would refuse to open it. ` +
          `Please report this along with what you were exporting.`,
      );
    }
  }
}

/** Verifies a generated archive, then downloads it. Throws instead of saving a broken file. */
export async function downloadVerifiedArchive(blob: Blob, filename: string): Promise<void> {
  await assertReadableArchive(blob);
  downloadBlob(blob, filename);
}
