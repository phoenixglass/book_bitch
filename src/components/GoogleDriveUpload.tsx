import { useState } from 'react';
import { useAppStore } from '../store/appStore';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly';

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
          // Check if it's a Google Sheet
          if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
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
