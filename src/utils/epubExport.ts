import JSZip from 'jszip';
import type { BinderItem, ManuscriptSettings } from '../types';
import { gatherChapters } from './manuscriptExport';

// ─── XML/XHTML helpers ────────────────────────────────────────────────────────

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isSceneBreakText(text: string): boolean {
  return text === '#' || text === '***';
}

function inlineToXhtml(node: Node): string {
  let out = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += escapeXml(child.textContent ?? '');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      const inner = inlineToXhtml(el);
      switch (tag) {
        case 'strong':
        case 'b':
          out += `<strong>${inner}</strong>`;
          break;
        case 'em':
        case 'i':
          out += `<em>${inner}</em>`;
          break;
        case 's':
          out += `<s>${inner}</s>`;
          break;
        case 'u':
          out += `<u>${inner}</u>`;
          break;
        case 'code':
          out += `<code>${inner}</code>`;
          break;
        case 'mark':
          out += `<mark>${inner}</mark>`;
          break;
        case 'br':
          out += '<br/>';
          break;
        default:
          out += inner;
      }
    }
  }
  return out;
}

// Converts a single document's tiptap-generated HTML into a sequence of
// block-level XHTML elements suitable for embedding in an EPUB chapter.
function htmlToXhtml(html: string, sceneBreakMark: string): string {
  if (!html?.trim()) return '';
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const parts: string[] = [];

  for (const node of Array.from(dom.body.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'hr') {
      parts.push(`<p class="scene-break">${escapeXml(sceneBreakMark)}</p>`);
      continue;
    }

    if (tag === 'p') {
      const plain = (el.textContent ?? '').trim();
      if (isSceneBreakText(plain)) {
        parts.push(`<p class="scene-break">${escapeXml(sceneBreakMark)}</p>`);
        continue;
      }
      const inner = inlineToXhtml(el);
      parts.push(`<p>${inner || ' '}</p>`);
      continue;
    }

    if (/^h[1-6]$/.test(tag)) {
      parts.push(`<${tag}>${inlineToXhtml(el)}</${tag}>`);
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(el.children)
        .map((li) => `<li>${inlineToXhtml(li)}</li>`)
        .join('');
      parts.push(`<${tag}>${items}</${tag}>`);
      continue;
    }

    if (tag === 'blockquote') {
      parts.push(`<blockquote><p>${inlineToXhtml(el)}</p></blockquote>`);
      continue;
    }

    const inner = inlineToXhtml(el);
    if (inner.trim()) parts.push(`<p>${inner}</p>`);
  }

  return parts.join('\n');
}

function xhtmlDocument(title: string, bodyHtml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

const STYLESHEET = `body { font-family: Georgia, "Times New Roman", serif; line-height: 1.5; margin: 1em; }
h1 { text-align: center; font-size: 1.5em; margin: 2em 0 1em; }
p { margin: 0 0 0.6em; text-indent: 1.5em; }
p.scene-break { text-align: center; text-indent: 0; margin: 1.5em 0; }
.title-page { text-align: center; margin-top: 30%; }
.title-page h1 { font-size: 2em; margin-bottom: 0.3em; }
.title-page .subtitle { font-size: 1.2em; font-style: italic; margin-bottom: 1.5em; text-indent: 0; }
.title-page .byline { font-size: 1.1em; margin-top: 2em; text-indent: 0; }
.title-page .genre { color: #555; text-indent: 0; }
blockquote { margin: 1em 2em; font-style: italic; }
blockquote p { text-indent: 0; }`;

// ─── Main export function ─────────────────────────────────────────────────────

export async function exportManuscriptEpub(
  binder: BinderItem[],
  projectTitle: string,
  settings: ManuscriptSettings,
): Promise<void> {
  const {
    authorName,
    bookTitle: settingsTitle,
    subtitle,
    genre,
    sceneBreakStyle,
    includeEndMarker,
    includeChapterTitles,
    includeTitlePage,
    includeSynopsis,
    synopsisContent,
    includeQueryLetter,
    queryLetterContent,
  } = settings;

  const bookTitle = settingsTitle.trim() || projectTitle || 'Untitled';
  const author = authorName.trim() || 'Unknown Author';

  const manuscriptItems = binder.filter((b) => b.id !== 'research' && b.id !== 'trash');
  const chapters = gatherChapters(manuscriptItems);

  interface EpubItem {
    id: string;
    href: string;
    body: string;
    navLabel?: string; // present => listed in nav/toc
  }

  const items: EpubItem[] = [];

  if (includeTitlePage) {
    const titleBody = `<div class="title-page">
<h1>${escapeXml(bookTitle)}</h1>
${subtitle ? `<p class="subtitle">${escapeXml(subtitle)}</p>` : ''}
<p class="byline">by ${escapeXml(author)}</p>
${genre ? `<p class="genre">${escapeXml(genre)}</p>` : ''}
</div>`;
    items.push({ id: 'title', href: 'title.xhtml', body: titleBody, navLabel: 'Title Page' });
  }

  chapters.forEach((chapter, idx) => {
    const showHeading = includeChapterTitles && chapter.isNamedChapter;
    const sceneParts: string[] = [];
    chapter.scenes.forEach((scene, i) => {
      if (i > 0) sceneParts.push(`<p class="scene-break">${escapeXml(sceneBreakStyle)}</p>`);
      sceneParts.push(htmlToXhtml(scene.content, sceneBreakStyle));
    });

    const isLastChapter = idx === chapters.length - 1;
    if (includeEndMarker && isLastChapter) {
      sceneParts.push('<p class="scene-break">END</p>');
    }

    const body = `${showHeading ? `<h1>${escapeXml(chapter.title)}</h1>` : ''}\n${sceneParts.join('\n')}`;
    items.push({
      id: `chapter${idx + 1}`,
      href: `chapter${idx + 1}.xhtml`,
      body,
      navLabel: chapter.title,
    });
  });

  if (includeSynopsis && synopsisContent.trim()) {
    const body = `<h1>Synopsis</h1>\n${htmlToXhtml(synopsisContent, sceneBreakStyle)}`;
    items.push({ id: 'synopsis', href: 'synopsis.xhtml', body, navLabel: 'Synopsis' });
  }

  if (includeQueryLetter && queryLetterContent.trim()) {
    const body = `<h1>Query Letter</h1>\n${htmlToXhtml(queryLetterContent, sceneBreakStyle)}`;
    items.push({ id: 'query-letter', href: 'query-letter.xhtml', body, navLabel: 'Query Letter' });
  }

  const bookId = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const manifestItems = items
    .map((item) => `    <item id="${item.id}" href="${item.href}" media-type="application/xhtml+xml" />`)
    .join('\n');
  const spineItems = items.map((item) => `    <itemref idref="${item.id}" />`).join('\n');
  const navListItems = items
    .filter((item) => item.navLabel)
    .map((item) => `      <li><a href="${item.href}">${escapeXml(item.navLabel!)}</a></li>`)
    .join('\n');
  const navPoints = items
    .filter((item) => item.navLabel)
    .map(
      (item, i) =>
        `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">\n      <navLabel><text>${escapeXml(
          item.navLabel!,
        )}</text></navLabel>\n      <content src="${item.href}" />\n    </navPoint>`,
    )
    .join('\n');

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${bookId}</dc:identifier>
    <dc:title>${escapeXml(bookTitle)}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator id="creator">${escapeXml(author)}</dc:creator>
    ${genre ? `<dc:subject>${escapeXml(genre)}</dc:subject>\n    ` : ''}<meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    <item id="css" href="styles.css" media-type="text/css" />
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
<meta charset="utf-8" />
<title>Table of Contents</title>
<link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body>
<nav epub:type="toc" id="toc">
<h1>Table of Contents</h1>
<ol>
${navListItems}
</ol>
</nav>
</body>
</html>`;

  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle><text>${escapeXml(bookTitle)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;

  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`,
  );
  zip.file('OEBPS/content.opf', contentOpf);
  zip.file('OEBPS/nav.xhtml', navXhtml);
  zip.file('OEBPS/toc.ncx', tocNcx);
  zip.file('OEBPS/styles.css', STYLESHEET);
  for (const item of items) {
    zip.file(`OEBPS/${item.href}`, xhtmlDocument(item.navLabel ?? bookTitle, item.body));
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${bookTitle.replace(/\s+/g, '_')}.epub`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
