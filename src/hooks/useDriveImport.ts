import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { ImportSourceMeta } from '../types';
import { delimitedToHtml, parseDocx, parseXlsx } from '../utils/documentParser';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES =
  'https://www.googleapis.com/auth/drive.readonly ' +
  'https://www.googleapis.com/auth/spreadsheets.readonly ' +
  'https://www.googleapis.com/auth/documents.readonly';

let cachedAccessToken: string | null = null;

export function useDriveImport(targetSection: 'manuscript' | 'fragments' | 'omitted' | 'research' = 'manuscript') {
  const { addItem, updateItem, selectItem } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function findBinderItemByDriveId(driveFileId: string): { id: string; type: string } | null {
    function search(items: any[]): { id: string; type: string } | null {
      for (const item of items) {
        if (item.driveFileId === driveFileId) return { id: item.id, type: item.type };
        const found = search(item.children || []);
        if (found) return found;
      }
      return null;
    }
    return search(useAppStore.getState().binder);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async function getAccessToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!window.google?.accounts?.oauth2) {
        reject(new Error('Google OAuth library not loaded'));
        return;
      }
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.access_token) {
            cachedAccessToken = response.access_token;
            resolve(response.access_token);
          } else {
            reject(new Error('No access token received'));
          }
        },
        error_callback: (error: any) => reject(error),
      });
      client.requestAccessToken();
    });
  }

  async function fetchWithAuth(url: string): Promise<Response> {
    if (!cachedAccessToken) {
      cachedAccessToken = await getAccessToken();
    }
    let res = await fetch(url, {
      headers: { Authorization: `Bearer ${cachedAccessToken}` },
    });
    if (res.status === 401) {
      cachedAccessToken = await getAccessToken();
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${cachedAccessToken}` },
      });
    }
    return res;
  }

  // ── Picker ────────────────────────────────────────────────────────────────

  async function importFromDrive() {
    if (!CLIENT_ID) {
      alert('Google Drive integration not configured. Please set VITE_GOOGLE_CLIENT_ID in .env');
      return;
    }
    try {
      setIsLoading(true);
      if (!window.google?.accounts?.oauth2) {
        throw new Error('Google OAuth library not loaded. Please refresh the page.');
      }
      const accessToken = await getAccessToken();
      await showPicker(accessToken);
    } catch (error) {
      console.error('Google Drive auth error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(`Failed to authenticate with Google Drive: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function showPicker(accessToken: string) {
    return new Promise<void>((resolve) => {
      window.gapi.load('picker', () => {
        const picker = new window.google.picker.PickerBuilder()
          .addView(window.google.picker.ViewId.DOCS)
          .setOAuthToken(accessToken)
          .setCallback(async (data: any) => {
            if (data.action === window.google.picker.Action.PICKED) {
              await handlePickerResult(data);
            }
            resolve();
          })
          .build();
        picker.setVisible(true);
      });
    });
  }

  // Extensions importGenericFile can safely treat as plain text.
  const TEXT_SAFE_EXTENSIONS = /\.(txt|md|markdown|html|htm)$/i;
  const DELIMITED_EXTENSIONS = /\.(csv|tsv)$/i;
  const DOCX_EXTENSIONS = /\.(docx|doc)$/i;
  const XLSX_EXTENSIONS = /\.(xlsx|xls)$/i;
  const PDF_EXTENSIONS = /\.pdf$/i;

  async function handlePickerResult(data: any) {
    const files: any[] = data.docs || [];
    for (const file of files) {
      try {
        if (file.mimeType === 'application/vnd.google-apps.document') {
          await importGoogleDoc(file);
        } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
          await importGoogleSheet(file);
        } else if (DELIMITED_EXTENSIONS.test(file.name) || file.mimeType === 'text/csv' || file.mimeType === 'text/tab-separated-values') {
          await importDelimitedFile(file);
        } else if (TEXT_SAFE_EXTENSIONS.test(file.name) || file.mimeType?.startsWith('text/')) {
          await importGenericFile(file);
        } else if (DOCX_EXTENSIONS.test(file.name) || file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.mimeType === 'application/msword') {
          await importBinaryFile(file, 'docx');
        } else if (XLSX_EXTENSIONS.test(file.name) || file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.mimeType === 'application/vnd.ms-excel') {
          await importBinaryFile(file, 'xlsx');
        } else if (PDF_EXTENSIONS.test(file.name) || file.mimeType === 'application/pdf') {
          await importBinaryFile(file, 'pdf');
        } else {
          alert(
            `"${file.name}" can't be imported from Drive — supported formats are Google Docs/Sheets, Word (.docx), PDF, Excel (.xlsx), plain text, Markdown, HTML, and CSV/TSV.`
          );
        }
      } catch (err) {
        console.error('Failed to import file:', err);
      }
    }
  }

  // Downloads a binary Drive file and parses it server-side (for PDF) or client-side (for DOCX/XLSX).
  async function importBinaryFile(file: any, fileType: 'docx' | 'doc' | 'xlsx' | 'xls' | 'pdf') {
    const res = await fetchWithAuth(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`
    );
    if (!res.ok) throw new Error(`Failed to download file: ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();

    const baseName: string = file.name.replace(/\.[^/.]+$/, '');
    let html = '';

    if (fileType === 'docx' || fileType === 'doc') {
      const items = await parseDocx(arrayBuffer, { fileName: baseName });
      html = items.map((i) => i.content).join('\n');
    } else if (fileType === 'xlsx' || fileType === 'xls') {
      const items = await parseXlsx(arrayBuffer, { fileName: baseName });
      html = items.map((i) => i.content).join('\n');
    } else if (fileType === 'pdf') {
      // Server-side parsing: send as base64
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const parseRes = await fetch('/api/parse/binary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileType: 'pdf', data: base64 }),
      });
      if (!parseRes.ok) {
        const err = await parseRes.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Parse failed: ${parseRes.status}`);
      }
      const parsed = await parseRes.json() as { html: string };
      html = parsed.html;
    }

    const importSource: ImportSourceMeta = {
      fileName: baseName,
      fileType: (fileType === 'docx' || fileType === 'doc') ? 'docx' : (fileType === 'xlsx' || fileType === 'xls') ? 'xlsx' : 'pdf',
      importedAt: Date.now(),
      googleFileId: file.id,
    };

    const isSpreadsheet = fileType === 'xlsx' || (fileType as string) === 'xls';

    if (targetSection !== 'manuscript') {
      const { importToFragments, importToOmitted, importToResearch, setArea } = useAppStore.getState();
      if (targetSection === 'fragments') {
        importToFragments([{ title: baseName, content: html, importSource }]);
        setArea('fragments');
      } else if (targetSection === 'research') {
        importToResearch([{ title: baseName, content: html, researchType: isSpreadsheet ? 'spreadsheet' : 'source', importSource }]);
        setArea('research');
      } else {
        importToOmitted([{ title: baseName, content: html, reason: 'Imported from Google Drive', importSource }]);
        setArea('omitted');
      }
      return;
    }

    addItem(null, 'document');
    const docId = useAppStore.getState().selectedId;
    if (docId) {
      updateItem(docId, { title: baseName, content: html });
      selectItem(docId);
    }
  }

  // ── Google Doc import ─────────────────────────────────────────────────────

  async function fetchDocData(docId: string): Promise<any> {
    const res = await fetchWithAuth(
      `https://docs.googleapis.com/v1/documents/${docId}?includeTabsContent=true`
    );
    if (!res.ok) throw new Error(`Failed to fetch document: ${res.statusText}`);
    return res.json();
  }

  async function importGoogleDoc(file: any) {
    const docData = await fetchDocData(file.id);
    const tabs: any[] = docData.tabs || [];

    if (targetSection !== 'manuscript') {
      await importGoogleDocToSection(file.id, file.name, docData, tabs, targetSection);
      return;
    }

    // If already imported, re-sync to preserve metadata instead of creating duplicates
    const existing = findBinderItemByDriveId(file.id);
    if (existing) {
      if (existing.type === 'folder') {
        await resyncDriveFolder(existing.id, file.id);
      } else {
        await resyncDriveDoc(existing.id, file.id);
      }
      return;
    }

    if (tabs.length > 1) {
      await importByTabs(file.id, file.name, flattenTabs(tabs));
    } else {
      await importByHeadings(file.id, file.name, docData);
    }
  }

  // Imports a Google Doc into Fragments or Omitted Material as flat items.
  // Multi-tab docs: one item per tab. Single-tab docs: one item per H1 heading,
  // or one item for the whole doc if no headings. Tab/chapter names are preserved.
  async function importGoogleDocToSection(
    driveFileId: string,
    docName: string,
    docData: any,
    tabs: any[],
    section: 'fragments' | 'omitted' | 'research',
  ) {
    const { importToFragments, importToOmitted, importToResearch, setArea } = useAppStore.getState();
    const flatTabs = flattenTabs(tabs);

    type ItemInput = { title: string; content: string; importSource: ImportSourceMeta; reason?: string };
    let items: ItemInput[];

    if (flatTabs.length > 1) {
      items = flatTabs.map((tab) => {
        const tabTitle = tab.tabProperties?.title || `Tab ${(tab.tabProperties?.index ?? 0) + 1}`;
        return {
          title: tabTitle,
          content: docElementsToHtml(tab.documentTab?.body?.content || []),
          importSource: {
            fileName: docName,
            fileType: 'google_doc' as const,
            importedAt: Date.now(),
            googleFileId: driveFileId,
            googleTabId: tab.tabProperties?.tabId,
            googleTabTitle: tabTitle,
          },
        };
      });
    } else {
      const bodyContent =
        docData.tabs?.[0]?.documentTab?.body?.content ||
        docData.body?.content ||
        [];
      const chapters = splitByHeading(bodyContent);

      if (chapters.length <= 1) {
        const html = await exportDocAsHtml(driveFileId);
        items = [{
          title: docName,
          content: html,
          importSource: {
            fileName: docName,
            fileType: 'google_doc' as const,
            importedAt: Date.now(),
            googleFileId: driveFileId,
          },
        }];
      } else {
        const fullHtml = await exportDocAsHtml(driveFileId);
        const chapterHtmls = splitHtmlByH1(fullHtml, chapters.map((c) => c.title));
        items = chapters.map((chapter, i) => ({
          title: chapter.title,
          content: chapterHtmls[i] ?? docElementsToHtml(chapter.elements),
          importSource: {
            fileName: docName,
            fileType: 'google_doc' as const,
            sourceHeading: chapter.title,
            importedAt: Date.now(),
            googleFileId: driveFileId,
          },
        }));
      }
    }

    if (section === 'fragments') {
      importToFragments(items);
      setArea('fragments');
    } else if (section === 'research') {
      importToResearch(items.map((i) => ({ ...i, researchType: 'source' as const })));
      setArea('research');
    } else {
      importToOmitted(items.map((i) => ({ ...i, reason: 'Imported from Google Drive' })));
      setArea('omitted');
    }
  }

  // Creates a folder + one document per tab, named by tab title
  async function importByTabs(driveFileId: string, docName: string, tabs: any[]) {
    addItem(null, 'folder');
    const folderId = useAppStore.getState().selectedId;
    if (!folderId) return;

    updateItem(folderId, { title: docName, driveFileId, expanded: true });

    for (const tab of tabs) {
      const tabTitle =
        tab.tabProperties?.title || `Tab ${(tab.tabProperties?.index ?? 0) + 1}`;
      const elements: any[] = tab.documentTab?.body?.content || [];
      const html = docElementsToHtml(elements);

      addItem(folderId, 'document');
      const docId = useAppStore.getState().selectedId;
      if (docId) {
        updateItem(docId, { title: tabTitle, content: html });
      }
    }

    selectItem(folderId);
  }

  // Splits doc body by HEADING_1; uses full HTML export to preserve all formatting
  async function importByHeadings(driveFileId: string, docName: string, docData: any) {
    const bodyContent =
      docData.tabs?.[0]?.documentTab?.body?.content ||
      docData.body?.content ||
      [];

    const chapters = splitByHeading(bodyContent);

    if (chapters.length <= 1) {
      // Single document — use HTML export for full formatting fidelity
      const html = await exportDocAsHtml(driveFileId);
      addItem(null, 'document');
      const docId = useAppStore.getState().selectedId;
      if (docId) {
        updateItem(docId, { title: docName, content: html, driveFileId });
        selectItem(docId);
      }
      return;
    }

    // Multi-chapter: export full HTML then split by <h1> to preserve formatting
    const fullHtml = await exportDocAsHtml(driveFileId);
    const chapterHtmls = splitHtmlByH1(fullHtml, chapters.map((c) => c.title));

    addItem(null, 'folder');
    const folderId = useAppStore.getState().selectedId;
    if (!folderId) return;

    updateItem(folderId, { title: docName, driveFileId, expanded: true });

    for (let i = 0; i < chapters.length; i++) {
      const html = chapterHtmls[i] ?? docElementsToHtml(chapters[i].elements);
      addItem(folderId, 'document');
      const docId = useAppStore.getState().selectedId;
      if (docId) {
        updateItem(docId, { title: chapters[i].title, content: html });
      }
    }

    selectItem(folderId);
  }

  // ── Re-sync ───────────────────────────────────────────────────────────────

  async function resyncDriveFolder(folderId: string, driveFileId: string) {
    try {
      setIsLoading(true);
      const docData = await fetchDocData(driveFileId);
      const tabs: any[] = docData.tabs || [];

      // Update folder title but preserve all children (don't wipe them)
      updateItem(folderId, { title: docData.title || 'Untitled' });

      // Helper: find existing child by title, update its content; create new if not found
      const mergeChapter = (title: string, html: string) => {
        const folder = useAppStore.getState().binder
          .flatMap(function flatten(item: any): any[] { return [item, ...(item.children || []).flatMap(flatten)]; })
          .find((item: any) => item.id === folderId);
        const existing = folder?.children?.find((c: any) => c.title === title);
        if (existing) {
          updateItem(existing.id, { content: html });
        } else {
          addItem(folderId, 'document');
          const newId = useAppStore.getState().selectedId;
          if (newId) updateItem(newId, { title, content: html });
        }
      };

      if (tabs.length > 1) {
        for (const tab of flattenTabs(tabs)) {
          const tabTitle =
            tab.tabProperties?.title || `Tab ${(tab.tabProperties?.index ?? 0) + 1}`;
          const html = docElementsToHtml(tab.documentTab?.body?.content || []);
          mergeChapter(tabTitle, html);
        }
      } else {
        const bodyContent =
          docData.tabs?.[0]?.documentTab?.body?.content ||
          docData.body?.content ||
          [];
        const chapters = splitByHeading(bodyContent);
        const fullHtml = await exportDocAsHtml(driveFileId);
        const chapterHtmls = splitHtmlByH1(fullHtml, chapters.map((c) => c.title));

        for (let i = 0; i < chapters.length; i++) {
          const html = chapterHtmls[i] ?? docElementsToHtml(chapters[i].elements);
          mergeChapter(chapters[i].title, html);
        }
      }

      selectItem(folderId);
    } catch (error) {
      console.error('Re-sync failed:', error);
      alert('Failed to re-sync from Google Drive.');
    } finally {
      setIsLoading(false);
    }
  }

  // ── Google Sheet import ───────────────────────────────────────────────────

  async function importGoogleSheet(file: any) {
    const res = await fetchWithAuth(
      `https://docs.google.com/spreadsheets/d/${file.id}/export?format=csv`
    );
    const csv = await res.text();
    const html = csvToHtml(csv);

    if (targetSection !== 'manuscript') {
      const { importToFragments, importToOmitted, importToResearch, setArea } = useAppStore.getState();
      const importSource: ImportSourceMeta = {
        fileName: file.name,
        fileType: 'google_doc',
        importedAt: Date.now(),
        googleFileId: file.id,
      };
      if (targetSection === 'fragments') {
        importToFragments([{ title: file.name, content: html, importSource }]);
        setArea('fragments');
      } else if (targetSection === 'research') {
        importToResearch([{ title: file.name, content: html, researchType: 'spreadsheet', importSource }]);
        setArea('research');
      } else {
        importToOmitted([{ title: file.name, content: html, reason: 'Imported from Google Drive', importSource }]);
        setArea('omitted');
      }
      return;
    }

    addItem(null, 'document');
    const docId = useAppStore.getState().selectedId;
    if (docId) {
      updateItem(docId, { title: file.name, content: html });
      selectItem(docId);
    }
  }

  // ── Delimited (CSV/TSV) file import ────────────────────────────────────────

  async function importDelimitedFile(file: any) {
    const res = await fetchWithAuth(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`
    );
    if (!res.ok) throw new Error(`Failed to download file: ${res.statusText}`);
    const text = await res.text();
    const delimiter = /\.tsv$/i.test(file.name) || file.mimeType === 'text/tab-separated-values' ? '\t' : ',';
    const html = delimitedToHtml(text, delimiter);

    const { importToFragments, importToOmitted, importToResearch, setArea } = useAppStore.getState();
    const importSource: ImportSourceMeta = {
      fileName: file.name,
      fileType: 'google_doc',
      importedAt: Date.now(),
      googleFileId: file.id,
    };
    if (targetSection === 'fragments') {
      importToFragments([{ title: file.name, content: html, importSource }]);
      setArea('fragments');
    } else if (targetSection === 'research') {
      importToResearch([{ title: file.name, content: html, researchType: 'spreadsheet', importSource }]);
      setArea('research');
    } else if (targetSection === 'omitted') {
      importToOmitted([{ title: file.name, content: html, reason: 'Imported from Google Drive', importSource }]);
      setArea('omitted');
    } else {
      addItem(null, 'document');
      const docId = useAppStore.getState().selectedId;
      if (docId) {
        updateItem(docId, { title: file.name, content: html });
        selectItem(docId);
      }
    }
  }

  // ── Generic file import ───────────────────────────────────────────────────

  async function importGenericFile(file: any) {
    const res = await fetchWithAuth(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`
    );
    if (!res.ok) throw new Error(`Failed to download file: ${res.statusText}`);
    const content = await res.text();

    if (targetSection !== 'manuscript') {
      const { importToFragments, importToOmitted, importToResearch, setArea } = useAppStore.getState();
      const importSource: ImportSourceMeta = {
        fileName: file.name,
        fileType: 'google_doc',
        importedAt: Date.now(),
        googleFileId: file.id,
      };
      if (targetSection === 'fragments') {
        importToFragments([{ title: file.name, content, importSource }]);
        setArea('fragments');
      } else if (targetSection === 'research') {
        importToResearch([{ title: file.name, content, importSource }]);
        setArea('research');
      } else {
        importToOmitted([{ title: file.name, content, reason: 'Imported from Google Drive', importSource }]);
        setArea('omitted');
      }
      return;
    }

    addItem(null, 'document');
    const docId = useAppStore.getState().selectedId;
    if (docId) {
      updateItem(docId, { title: file.name, content });
      selectItem(docId);
    }
  }

  // ── HTML export (preserves all Google Docs formatting) ────────────────────

  async function exportDocAsHtml(docId: string): Promise<string> {
    const res = await fetchWithAuth(
      `https://docs.google.com/feeds/download/documents/export/Export?id=${docId}&exportFormat=html`
    );
    if (!res.ok) throw new Error(`Failed to export doc: ${res.statusText}`);
    const raw = await res.text();
    // Extract body content from the full HTML page
    const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return cleanGoogleDocsHtml(bodyMatch ? bodyMatch[1] : raw);
  }

  // Google's raw HTML export wraps nearly every run of text in its own
  // <span style="..."> carrying a dozen-plus redundant properties (font-family,
  // color, line-height, etc.), often inflating a few-page doc to multiple
  // megabytes of markup. That bloat froze the page when it hit the rich-text
  // editor and the localStorage/cloud sync write. Strip everything except the
  // formatting that actually changes the rendered output.
  const KEEP_STYLE_PROPS = new Set(['font-weight', 'font-style', 'text-decoration', 'vertical-align']);
  function cleanGoogleDocsHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
      const kept: string[] = [];
      for (const prop of Array.from(el.style)) {
        if (!KEEP_STYLE_PROPS.has(prop)) continue;
        const value = el.style.getPropertyValue(prop).trim();
        if (prop === 'font-weight' && (value === 'normal' || value === '400')) continue;
        if (prop === 'font-style' && value === 'normal') continue;
        if (prop === 'text-decoration' && value === 'none') continue;
        if (prop === 'vertical-align' && (value === 'baseline' || value === '')) continue;
        kept.push(`${prop}: ${value}`);
      }
      if (kept.length) {
        el.setAttribute('style', kept.join('; '));
      } else {
        el.removeAttribute('style');
      }
      el.removeAttribute('id');
    });
    // Unwrap spans left with no attributes at all — pure noise wrappers
    doc.querySelectorAll('span:not([style]):not([class])').forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    });
    return doc.body.innerHTML;
  }

  // Split exported HTML at each <h1> tag, returning one chunk per chapter
  function splitHtmlByH1(html: string, titles: string[]): string[] {
    // Split on <h1 ...> tags
    const parts = html.split(/(?=<h1[\s>])/i);
    const results: string[] = [];

    for (let i = 0; i < titles.length; i++) {
      // Match part that starts with this title's h1
      const title = titles[i];
      const matchIdx = parts.findIndex((p) =>
        p.toLowerCase().includes(title.toLowerCase().slice(0, 20))
      );
      if (matchIdx !== -1) {
        results.push(parts[matchIdx]);
      } else if (parts[i + 1]) {
        results.push(parts[i + 1]);
      }
    }

    return results;
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────

  function flattenTabs(tabs: any[]): any[] {
    const out: any[] = [];
    for (const tab of tabs) {
      out.push(tab);
      if (tab.childTabs?.length) out.push(...flattenTabs(tab.childTabs));
    }
    return out;
  }

  function splitByHeading(
    elements: any[]
  ): Array<{ title: string; elements: any[] }> {
    const chapters: Array<{ title: string; elements: any[] }> = [];
    let current: { title: string; elements: any[] } | null = null;

    for (const el of elements) {
      if (el.paragraph?.paragraphStyle?.namedStyleType === 'HEADING_1') {
        if (current) chapters.push(current);
        const title = extractText(el) || 'Untitled Chapter';
        current = { title, elements: [el] };
      } else if (current) {
        current.elements.push(el);
      }
    }
    if (current) chapters.push(current);
    return chapters;
  }

  function extractText(element: any): string {
    return (element.paragraph?.elements || [])
      .map((e: any) => e.textRun?.content || '')
      .join('')
      .trim();
  }

  // Convert Google Docs API elements to HTML with full formatting preserved
  function docElementsToHtml(elements: any[]): string {
    const out: string[] = [];
    let listStack: Array<{ type: 'ul' | 'ol'; nestingLevel: number }> = [];

    for (const el of elements) {
      if (el.paragraph) {
        const p = el.paragraph;
        const bullet = p.bullet;

        if (bullet) {
          // Determine list type from nesting level and list ID
          const nestingLevel = bullet.nestingLevel ?? 0;
          const listType: 'ul' | 'ol' = 'ul'; // Default; could inspect listId for ordered
          if (listStack.length === 0) {
            out.push(`<${listType}>`);
            listStack.push({ type: listType, nestingLevel });
          }
          out.push(`<li>${renderInlines(p.elements || [])}</li>`);
        } else {
          // Close any open lists
          if (listStack.length > 0) {
            while (listStack.length > 0) {
              out.push(`</${listStack.pop()!.type}>`);
            }
          }
          out.push(paragraphToHtml(p));
        }
      } else if (el.table) {
        if (listStack.length > 0) {
          while (listStack.length > 0) out.push(`</${listStack.pop()!.type}>`);
        }
        out.push(tableToHtml(el.table));
      }
    }

    // Close any remaining open lists
    while (listStack.length > 0) out.push(`</${listStack.pop()!.type}>`);

    return out.join('');
  }

  function paragraphToHtml(paragraph: any): string {
    const style = paragraph.paragraphStyle?.namedStyleType || 'NORMAL_TEXT';
    const pStyle = paragraph.paragraphStyle || {};

    // Build paragraph-level CSS
    const cssProps: string[] = [];

    // Text alignment
    if (pStyle.alignment && pStyle.alignment !== 'START') {
      const alignMap: Record<string, string> = {
        CENTER: 'center',
        END: 'right',
        JUSTIFIED: 'justify',
      };
      if (alignMap[pStyle.alignment]) cssProps.push(`text-align:${alignMap[pStyle.alignment]}`);
    }

    // First-line indent (paragraph indent)
    if (pStyle.indentFirstLine?.magnitude) {
      const pt = pStyle.indentFirstLine.magnitude;
      cssProps.push(`text-indent:${pt}pt`);
    }

    // Left indent
    if (pStyle.indentStart?.magnitude) {
      const pt = pStyle.indentStart.magnitude;
      cssProps.push(`margin-left:${pt}pt`);
    }

    // Line spacing
    if (pStyle.lineSpacing) {
      cssProps.push(`line-height:${pStyle.lineSpacing / 100}`);
    }

    // Space before/after
    if (pStyle.spaceAbove?.magnitude) cssProps.push(`margin-top:${pStyle.spaceAbove.magnitude}pt`);
    if (pStyle.spaceBelow?.magnitude) cssProps.push(`margin-bottom:${pStyle.spaceBelow.magnitude}pt`);

    const styleAttr = cssProps.length > 0 ? ` style="${cssProps.join(';')}"` : '';

    const inner = renderInlines(paragraph.elements || []);

    if (style === 'HEADING_1') return `<h1${styleAttr}>${inner}</h1>`;
    if (style === 'HEADING_2') return `<h2${styleAttr}>${inner}</h2>`;
    if (style === 'HEADING_3') return `<h3${styleAttr}>${inner}</h3>`;
    if (style === 'HEADING_4') return `<h4${styleAttr}>${inner}</h4>`;
    if (style === 'HEADING_5') return `<h5${styleAttr}>${inner}</h5>`;
    if (style === 'HEADING_6') return `<h6${styleAttr}>${inner}</h6>`;
    return `<p${styleAttr}>${inner}</p>`;
  }

  function renderInlines(elements: any[]): string {
    let html = '';
    for (const elem of elements) {
      if (elem.textRun) {
        const ts = elem.textRun.textStyle || {};
        let text = escapeHtml(elem.textRun.content);

        // Build inline CSS for text styling
        const css: string[] = [];
        if (ts.fontSize?.magnitude) css.push(`font-size:${ts.fontSize.magnitude}pt`);
        if (ts.weightedFontFamily?.fontFamily) css.push(`font-family:'${ts.weightedFontFamily.fontFamily}',sans-serif`);
        if (ts.foregroundColor?.color?.rgbColor) {
          const { red = 0, green = 0, blue = 0 } = ts.foregroundColor.color.rgbColor;
          const hex = rgbToHex(red, green, blue);
          if (hex !== '#000000') css.push(`color:${hex}`);
        }
        if (ts.backgroundColor?.color?.rgbColor) {
          const { red = 0, green = 0, blue = 0 } = ts.backgroundColor.color.rgbColor;
          css.push(`background-color:${rgbToHex(red, green, blue)}`);
        }

        // Wrap in span if we have CSS
        if (css.length > 0) {
          text = `<span style="${css.join(';')}">${text}</span>`;
        }

        // Semantic formatting (applied after CSS span)
        if (ts.bold) text = `<strong>${text}</strong>`;
        if (ts.italic) text = `<em>${text}</em>`;
        if (ts.underline && !ts.link) text = `<u>${text}</u>`;
        if (ts.strikethrough) text = `<s>${text}</s>`;
        if (ts.baselineOffset === 'SUPERSCRIPT') text = `<sup>${text}</sup>`;
        if (ts.baselineOffset === 'SUBSCRIPT') text = `<sub>${text}</sub>`;
        if (ts.link?.url) text = `<a href="${escapeHtml(ts.link.url)}">${text}</a>`;

        html += text;
      } else if (elem.inlineObjectElement) {
        // Inline images: skip (would need separate handling)
      }
    }
    return html;
  }

  function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function tableToHtml(table: any): string {
    let html = '<table style="border-collapse:collapse;width:100%"><tbody>';
    for (const row of table.tableRows || []) {
      html += '<tr>';
      for (const cell of row.tableCells || []) {
        html += '<td style="border:1px solid #ccc;padding:8px">';
        for (const el of cell.content || []) {
          if (el.paragraph) html += paragraphToHtml(el.paragraph);
        }
        html += '</td>';
      }
      html += '</tr>';
    }
    return html + '</tbody></table>';
  }

  function csvToHtml(csv: string): string {
    const lines = csv.split('\n').filter((l) => l.trim());
    if (!lines.length) return '';
    let html = '<table style="border-collapse:collapse;width:100%"><tbody>';
    lines.forEach((line, idx) => {
      const cells = line.split(',').map((c) => {
        c = c.trim();
        if (c.startsWith('"') && c.endsWith('"')) c = c.slice(1, -1);
        return c;
      });
      html += '<tr>';
      cells.forEach((cell) => {
        const tag = idx === 0 ? 'th' : 'td';
        html += `<${tag} style="border:1px solid #ccc;padding:8px">${escapeHtml(cell)}</${tag}>`;
      });
      html += '</tr>';
    });
    return html + '</tbody></table>';
  }

  function escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  // ── Re-sync single document ───────────────────────────────────────────────

  async function resyncDriveDoc(docId: string, driveFileId: string) {
    try {
      setIsLoading(true);
      const html = await exportDocAsHtml(driveFileId);
      const docData = await fetchDocData(driveFileId);
      updateItem(docId, { title: docData.title || 'Untitled', content: html });
    } catch (error) {
      console.error('Re-sync doc failed:', error);
      alert('Failed to re-sync document from Google Drive.');
    } finally {
      setIsLoading(false);
    }
  }

  return { isLoading, importFromDrive, resyncDriveFolder, resyncDriveDoc };
}
