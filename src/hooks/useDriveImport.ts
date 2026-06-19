import { useState } from 'react';
import { useAppStore, findItem } from '../store/appStore';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES =
  'https://www.googleapis.com/auth/drive.readonly ' +
  'https://www.googleapis.com/auth/spreadsheets.readonly ' +
  'https://www.googleapis.com/auth/documents.readonly';

let cachedAccessToken: string | null = null;

export function useDriveImport() {
  const { addItem, updateItem, selectItem } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

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

  async function handlePickerResult(data: any) {
    const files: any[] = data.docs || [];
    for (const file of files) {
      try {
        if (file.mimeType === 'application/vnd.google-apps.document') {
          await importGoogleDoc(file);
        } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
          await importGoogleSheet(file);
        } else {
          await importGenericFile(file);
        }
      } catch (err) {
        console.error('Failed to import file:', err);
      }
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

    if (tabs.length > 1) {
      await importByTabs(file.id, file.name, flattenTabs(tabs));
    } else {
      await importByHeadings(file.id, file.name, docData);
    }
  }

  // Creates a folder + one document per tab, named by tab title
  async function importByTabs(driveFileId: string, docName: string, tabs: any[]) {
    addItem(null, 'folder');
    const binderSnap = useAppStore.getState().binder;
    const folder = binderSnap[binderSnap.length - 1];
    if (!folder || folder.id === 'trash') return;

    updateItem(folder.id, { title: docName, driveFileId, expanded: true });

    for (const tab of tabs) {
      const tabTitle =
        tab.tabProperties?.title || `Tab ${(tab.tabProperties?.index ?? 0) + 1}`;
      const elements: any[] = tab.documentTab?.body?.content || [];
      const html = docElementsToHtml(elements);

      addItem(folder.id, 'document');
      const parent = findItem(useAppStore.getState().binder, folder.id);
      if (parent && parent.children.length > 0) {
        const newDoc = parent.children[parent.children.length - 1];
        updateItem(newDoc.id, { title: tabTitle, content: html });
      }
    }

    selectItem(folder.id);
  }

  // Splits doc body by HEADING_1 and creates one document per chapter
  async function importByHeadings(driveFileId: string, docName: string, docData: any) {
    // When tabs API is used, body content lives inside tabs[0].documentTab.body
    const bodyContent =
      docData.tabs?.[0]?.documentTab?.body?.content ||
      docData.body?.content ||
      [];

    const chapters = splitByHeading(bodyContent);

    if (chapters.length <= 1) {
      // Single document — no splitting
      const html = await exportDocAsHtml(driveFileId);
      addItem(null, 'document');
      const binderSnap = useAppStore.getState().binder;
      const lastDoc = binderSnap[binderSnap.length - 1];
      if (lastDoc && lastDoc.id !== 'trash') {
        updateItem(lastDoc.id, { title: docName, content: html, driveFileId });
        selectItem(lastDoc.id);
      }
      return;
    }

    addItem(null, 'folder');
    const binderSnap = useAppStore.getState().binder;
    const folder = binderSnap[binderSnap.length - 1];
    if (!folder || folder.id === 'trash') return;

    updateItem(folder.id, { title: docName, driveFileId, expanded: true });

    for (const chapter of chapters) {
      const html = docElementsToHtml(chapter.elements);
      addItem(folder.id, 'document');
      const parent = findItem(useAppStore.getState().binder, folder.id);
      if (parent && parent.children.length > 0) {
        const newDoc = parent.children[parent.children.length - 1];
        updateItem(newDoc.id, { title: chapter.title, content: html });
      }
    }

    selectItem(folder.id);
  }

  // ── Re-sync ───────────────────────────────────────────────────────────────

  async function resyncDriveFolder(folderId: string, driveFileId: string) {
    try {
      setIsLoading(true);
      const docData = await fetchDocData(driveFileId);
      const tabs: any[] = docData.tabs || [];

      // Clear existing children before re-populating
      updateItem(folderId, { children: [], title: docData.title || 'Untitled' });

      if (tabs.length > 1) {
        for (const tab of flattenTabs(tabs)) {
          const tabTitle =
            tab.tabProperties?.title || `Tab ${(tab.tabProperties?.index ?? 0) + 1}`;
          const html = docElementsToHtml(tab.documentTab?.body?.content || []);
          addItem(folderId, 'document');
          const parent = findItem(useAppStore.getState().binder, folderId);
          if (parent && parent.children.length > 0) {
            const newDoc = parent.children[parent.children.length - 1];
            updateItem(newDoc.id, { title: tabTitle, content: html });
          }
        }
      } else {
        const bodyContent =
          docData.tabs?.[0]?.documentTab?.body?.content ||
          docData.body?.content ||
          [];
        for (const chapter of splitByHeading(bodyContent)) {
          const html = docElementsToHtml(chapter.elements);
          addItem(folderId, 'document');
          const parent = findItem(useAppStore.getState().binder, folderId);
          if (parent && parent.children.length > 0) {
            const newDoc = parent.children[parent.children.length - 1];
            updateItem(newDoc.id, { title: chapter.title, content: html });
          }
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

    addItem(null, 'document');
    const binderSnap = useAppStore.getState().binder;
    const lastDoc = binderSnap[binderSnap.length - 1];
    if (lastDoc && lastDoc.id !== 'trash') {
      updateItem(lastDoc.id, { title: file.name, content: html });
      selectItem(lastDoc.id);
    }
  }

  // ── Generic file import ───────────────────────────────────────────────────

  async function importGenericFile(file: any) {
    const res = await fetchWithAuth(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`
    );
    if (!res.ok) throw new Error(`Failed to download file: ${res.statusText}`);
    const content = await res.text();

    addItem(null, 'document');
    const binderSnap = useAppStore.getState().binder;
    const lastDoc = binderSnap[binderSnap.length - 1];
    if (lastDoc && lastDoc.id !== 'trash') {
      updateItem(lastDoc.id, { title: file.name, content });
      selectItem(lastDoc.id);
    }
  }

  // ── HTML export fallback ──────────────────────────────────────────────────

  async function exportDocAsHtml(docId: string): Promise<string> {
    const res = await fetchWithAuth(
      `https://docs.google.com/feeds/download/documents/export/Export?id=${docId}&exportFormat=html`
    );
    if (!res.ok) throw new Error(`Failed to export doc: ${res.statusText}`);
    return res.text();
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

  function docElementsToHtml(elements: any[]): string {
    return elements
      .map((el) => {
        if (el.paragraph) return paragraphToHtml(el.paragraph);
        if (el.table) return tableToHtml(el.table);
        return '';
      })
      .join('');
  }

  function paragraphToHtml(paragraph: any): string {
    const style = paragraph.paragraphStyle?.namedStyleType || 'NORMAL_TEXT';
    let inner = '';
    for (const elem of paragraph.elements || []) {
      if (elem.textRun) {
        let text = escapeHtml(elem.textRun.content);
        const ts = elem.textRun.textStyle || {};
        if (ts.bold) text = `<strong>${text}</strong>`;
        if (ts.italic) text = `<em>${text}</em>`;
        if (ts.underline) text = `<u>${text}</u>`;
        inner += text;
      }
    }
    if (style === 'HEADING_1') return `<h1>${inner}</h1>`;
    if (style === 'HEADING_2') return `<h2>${inner}</h2>`;
    if (style === 'HEADING_3') return `<h3>${inner}</h3>`;
    return `<p>${inner}</p>`;
  }

  function tableToHtml(table: any): string {
    let html = '<table style="border-collapse:collapse;width:100%"><tbody>';
    for (const row of table.tableRows || []) {
      html += '<tr>';
      for (const cell of row.tableCells || []) {
        html += '<td style="border:1px solid #ccc;padding:8px">';
        for (const el of cell.content || []) {
          if (el.paragraph) html += escapeHtml(extractText(el));
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

  return { isLoading, importFromDrive, resyncDriveFolder };
}
