import { useState } from 'react';
import { useAppStore } from '../store/appStore';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/documents.readonly';

export function GoogleDriveUpload() {
  const { addItem, updateItem, selectItem } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

  async function initializeGoogleAPI() {
    return new Promise((resolve) => {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({
            clientId: CLIENT_ID,
            scope: SCOPES,
          });
          resolve(true);
        } catch {
          resolve(false);
        }
      });
    });
  }

  async function handleGoogleDriveUpload() {
    if (!CLIENT_ID) {
      alert('Google Drive integration not configured. Please set VITE_GOOGLE_CLIENT_ID in .env');
      return;
    }

    try {
      setIsLoading(true);
      await initializeGoogleAPI();

      const auth = window.gapi.auth2.getAuthInstance();
      if (!auth.isSignedIn.get()) {
        await auth.signIn();
      }

      // Open Google Drive picker
      showGoogleDrivePicker();
    } catch (error) {
      console.error('Google Drive auth error:', error);
      alert('Failed to authenticate with Google Drive');
    } finally {
      setIsLoading(false);
    }
  }

  async function showGoogleDrivePicker() {
    return new Promise((resolve) => {
      window.gapi.load('picker', () => {
        const picker = new window.google.picker.PickerBuilder()
          .addView(window.google.picker.ViewId.DOCS)
          .setOAuthToken(window.gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().id_token)
          .setCallback(handlePickerResult)
          .build();
        picker.setVisible(true);
        resolve(picker);
      });
    });
  }

  async function handlePickerResult(data: any) {
    if (data.action === window.google.picker.Action.PICKED) {
      const files = data.docs || [];

      for (const file of files) {
        try {
          // Check if it's a Google Doc
          if (file.mimeType === 'application/vnd.google-apps.document') {
            await handleGoogleDoc(file);
          } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
            // Check if it's a Google Sheet
            await handleGoogleSheet(file);
          } else {
            // Handle regular documents
            const content = await downloadGoogleDriveFile(file.id);
            addItem(null, 'document');
            const lastBinder = useAppStore.getState().binder;
            const lastDoc = lastBinder[lastBinder.length - 1];
            if (lastDoc && lastDoc.id !== 'trash') {
              updateItem(lastDoc.id, { content, title: file.name });
              selectItem(lastDoc.id);
            }
          }
        } catch (error) {
          console.error('Failed to import file:', error);
        }
      }
    }
  }

  async function handleGoogleDoc(file: any) {
    try {
      // Fetch the document using Google Docs API
      const docResponse = await fetch(
        `https://docs.googleapis.com/v1/documents/${file.id}`,
        {
          headers: {
            Authorization: `Bearer ${window.gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().id_token}`,
          },
        }
      );
      const docData = await docResponse.json();

      // Parse tabs/sections from the document
      const tabs = parseDocumentTabs(docData);

      if (tabs.length === 0) {
        // No tabs found, import as single document
        const content = await downloadGoogleDriveFile(file.id);
        addItem(null, 'document');
        const lastBinder = useAppStore.getState().binder;
        const lastDoc = lastBinder[lastBinder.length - 1];
        if (lastDoc && lastDoc.id !== 'trash') {
          updateItem(lastDoc.id, { content, title: file.name });
          selectItem(lastDoc.id);
        }
        return;
      }

      // Create a folder for the document
      addItem(null, 'folder');
      const lastBinder = useAppStore.getState().binder;
      const folderItem = lastBinder[lastBinder.length - 1];

      if (folderItem && folderItem.id !== 'trash') {
        updateItem(folderItem.id, { title: file.name });

        // Create chapters for each tab
        for (const tab of tabs) {
          try {
            // Convert tab content to HTML
            const htmlContent = docElementsToHtml(tab.content);

            // Create document for this tab
            addItem(folderItem.id, 'document');
            const state = useAppStore.getState();
            const parentFolder = findItemInArray(state.binder, folderItem.id);
            if (parentFolder && parentFolder.children.length > 0) {
              const newChapter = parentFolder.children[parentFolder.children.length - 1];
              updateItem(newChapter.id, {
                content: htmlContent,
                title: tab.title,
              });
            }
          } catch (error) {
            console.error(`Failed to import tab ${tab.title}:`, error);
          }
        }

        selectItem(folderItem.id);
      }
    } catch (error) {
      console.error('Failed to process Google Doc:', error);
    }
  }

  function parseDocumentTabs(docData: any): Array<{ title: string; content: any[] }> {
    const tabs: Array<{ title: string; content: any[] }> = [];
    const body = docData.body?.content || [];

    let currentTab: { title: string; content: any[] } | null = null;

    for (const element of body) {
      // Check if this element is a tab marker (typically a paragraph with specific styling)
      // Tabs in Google Docs are marked by named ranges or specific structural elements
      const tabTitle = extractTabTitle(element, docData);

      if (tabTitle) {
        // This is a tab header
        if (currentTab) {
          tabs.push(currentTab);
        }
        currentTab = { title: tabTitle, content: [] };
      } else if (currentTab) {
        // Add content to current tab
        currentTab.content.push(element);
      }
    }

    // Push the last tab
    if (currentTab) {
      tabs.push(currentTab);
    }

    return tabs;
  }

  function extractTabTitle(element: any, docData: any): string | null {
    // Check if element is marked as a tab in named ranges
    const namedRanges = docData.namedRanges || [];

    if (element.paragraph) {
      const paragraph = element.paragraph;
      const elementId = element.paragraph.paragraphStyle?.namedStyleType;

      // Look for named ranges that contain this element
      for (const range of namedRanges) {
        if (range.name && (range.name.startsWith('tab_') || range.name.startsWith('Tab_'))) {
          // Check if this element is at the start of the range
          if (range.range && range.range.startIndex) {
            // Found a tab marker
            return range.name.replace(/^[Tt]ab_/, '').replace(/_/g, ' ');
          }
        }
      }

      // Alternative: check if paragraph has a specific style indicating a tab
      if (paragraph.paragraphStyle?.namedStyleType === 'HEADING_1') {
        const text = extractTextFromParagraph(paragraph);
        // Check if this looks like a tab title (all caps or specific pattern)
        if (text && text.length > 0) {
          return text;
        }
      }
    }

    return null;
  }

  function extractTextFromParagraph(paragraph: any): string {
    let text = '';
    if (paragraph.elements) {
      for (const elem of paragraph.elements) {
        if (elem.textRun) {
          text += elem.textRun.content;
        }
      }
    }
    return text.trim();
  }

  function docElementsToHtml(elements: any[]): string {
    if (!elements || elements.length === 0) return '';

    let html = '';
    for (const element of elements) {
      if (element.paragraph) {
        html += paragraphToHtml(element.paragraph);
      } else if (element.table) {
        html += tableToHtml(element.table);
      } else if (element.pageBreak) {
        html += '<hr style="page-break-after: always;">';
      }
    }
    return html;
  }

  function paragraphToHtml(paragraph: any): string {
    let html = '<p>';
    if (paragraph.elements) {
      for (const elem of paragraph.elements) {
        if (elem.textRun) {
          const text = escapeHtml(elem.textRun.content);
          const style = elem.textRun.textStyle || {};
          let styledText = text;

          if (style.bold) styledText = `<strong>${styledText}</strong>`;
          if (style.italic) styledText = `<em>${styledText}</em>`;
          if (style.underline) styledText = `<u>${styledText}</u>`;

          html += styledText;
        }
      }
    }
    html += '</p>';
    return html;
  }

  function tableToHtml(table: any): string {
    let html = '<table style="border-collapse: collapse; width: 100%;">';
    if (table.tableRows) {
      for (const row of table.tableRows) {
        html += '<tr>';
        if (row.tableCells) {
          for (const cell of row.tableCells) {
            html += '<td style="border: 1px solid #ccc; padding: 8px;">';
            if (cell.content) {
              for (const elem of cell.content) {
                if (elem.paragraph) {
                  const pText = extractTextFromParagraph(elem.paragraph);
                  html += escapeHtml(pText);
                }
              }
            }
            html += '</td>';
          }
        }
        html += '</tr>';
      }
    }
    html += '</table>';
    return html;
  }

  async function handleGoogleSheet(file: any) {
    try {
      // Fetch spreadsheet metadata to get all sheets
      const metadataResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${file.id}?fields=sheets(properties(sheetId,title))`,
        {
          headers: {
            Authorization: `Bearer ${window.gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().id_token}`,
          },
        }
      );
      const metadata = await metadataResponse.json();
      const sheets = metadata.sheets || [];

      if (sheets.length === 0) return;

      // Create a folder for the spreadsheet
      addItem(null, 'folder');
      const lastBinder = useAppStore.getState().binder;
      const folderItem = lastBinder[lastBinder.length - 1];

      if (folderItem && folderItem.id !== 'trash') {
        updateItem(folderItem.id, { title: file.name });

        // Create chapters for each sheet
        for (const sheet of sheets) {
          const sheetTitle = sheet.properties.title;
          const sheetId = sheet.properties.sheetId;

          try {
            // Fetch sheet data as CSV
            const sheetUrl = `https://docs.google.com/spreadsheets/d/${file.id}/export?format=csv&gid=${sheetId}`;
            const sheetResponse = await fetch(sheetUrl, {
              headers: {
                Authorization: `Bearer ${window.gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().id_token}`,
              },
            });
            const csvContent = await sheetResponse.text();

            // Convert CSV to HTML table
            const htmlContent = csvToHtml(csvContent);

            // Create document for this sheet
            addItem(folderItem.id, 'document');
            const state = useAppStore.getState();
            const parentFolder = findItemInArray(state.binder, folderItem.id);
            if (parentFolder && parentFolder.children.length > 0) {
              const newChapter = parentFolder.children[parentFolder.children.length - 1];
              updateItem(newChapter.id, {
                content: htmlContent,
                title: sheetTitle,
              });
            }
          } catch (error) {
            console.error(`Failed to import sheet ${sheetTitle}:`, error);
          }
        }

        selectItem(folderItem.id);
      }
    } catch (error) {
      console.error('Failed to process Google Sheet:', error);
    }
  }

  function csvToHtml(csv: string): string {
    const lines = csv.split('\n').filter(line => line.trim());
    if (lines.length === 0) return '';

    const rows = lines.map(line => {
      // Simple CSV parsing - handles basic cases
      const cells = line.split(',').map(cell => {
        let cleaned = cell.trim();
        // Remove quotes if present
        if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
          cleaned = cleaned.slice(1, -1);
        }
        return cleaned;
      });
      return cells;
    });

    // Convert to HTML table
    let html = '<table style="border-collapse: collapse; width: 100%;"><tbody>';
    rows.forEach((row, idx) => {
      html += '<tr>';
      row.forEach(cell => {
        const tag = idx === 0 ? 'th' : 'td';
        html += `<${tag} style="border: 1px solid #ccc; padding: 8px;">${escapeHtml(cell)}</${tag}>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  function findItemInArray(items: any[], id: string): any {
    for (const item of items) {
      if (item.id === id) return item;
      const found = findItemInArray(item.children || [], id);
      if (found) return found;
    }
    return null;
  }

  async function downloadGoogleDriveFile(fileId: string): Promise<string> {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${window.gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().id_token}`,
        },
      }
    );
    return response.text();
  }

  return (
    <button
      onClick={handleGoogleDriveUpload}
      disabled={isLoading}
      title="Upload from Google Drive"
      className="text-xs text-gray-400 hover:text-white px-1 disabled:opacity-50"
    >
      {isLoading ? '⌛' : '☁️'}
    </button>
  );
}

// Extend window types for Google API
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}
