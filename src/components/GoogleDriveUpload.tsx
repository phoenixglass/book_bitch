import { useState } from 'react';
import { useAppStore } from '../store/appStore';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/documents.readonly';

let cachedAccessToken: string | null = null;

export function GoogleDriveUpload() {
  const { addItem, updateItem, selectItem } = useAppStore();
  const [isLoading, setIsLoading] = useState(false);

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
            resolve(response.access_token);
          } else {
            reject(new Error('No access token received'));
          }
        },
        error_callback: (error: any) => {
          reject(error);
        },
      });

      client.requestAccessToken();
    });
  }

  async function handleGoogleDriveUpload() {
    if (!CLIENT_ID) {
      alert('Google Drive integration not configured. Please set VITE_GOOGLE_CLIENT_ID in .env');
      return;
    }

    try {
      setIsLoading(true);

      // Ensure google accounts library is available
      if (!window.google?.accounts?.oauth2) {
        throw new Error('Google OAuth library not loaded. Please refresh the page.');
      }

      // Get access token
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Failed to get access token from Google');
      }

      cachedAccessToken = accessToken;

      // Open Google Drive picker
      showGoogleDrivePicker(accessToken);
    } catch (error) {
      console.error('Google Drive auth error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to authenticate with Google Drive: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function showGoogleDrivePicker(accessToken: string) {
    return new Promise<void>((resolve) => {
      window.gapi.load('picker', () => {
        const picker = new window.google.picker.PickerBuilder()
          .addView(window.google.picker.ViewId.DOCS)
          .setOAuthToken(accessToken)
          .setCallback((data: any) => {
            handlePickerResult(data);
            resolve();
          })
          .build();
        picker.setVisible(true);
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
      // Simply export the Google Doc as HTML
      const htmlContent = await exportGoogleDocAsHtml(file.id);
      addItem(null, 'document');
      const lastBinder = useAppStore.getState().binder;
      const lastDoc = lastBinder[lastBinder.length - 1];
      if (lastDoc && lastDoc.id !== 'trash') {
        updateItem(lastDoc.id, { content: htmlContent, title: file.name });
        selectItem(lastDoc.id);
      }
    } catch (error) {
      console.error('Failed to import Google Doc:', error);
    }
  }


  async function handleGoogleSheet(file: any) {
    try {
      // Just export the entire spreadsheet as CSV and convert to HTML
      const csvUrl = `https://docs.google.com/spreadsheets/d/${file.id}/export?format=csv`;
      const response = await fetch(csvUrl, {
        headers: {
          Authorization: `Bearer ${cachedAccessToken}`,
        },
      });
      const csvContent = await response.text();
      const htmlContent = csvToHtml(csvContent);

      addItem(null, 'document');
      const lastBinder = useAppStore.getState().binder;
      const lastDoc = lastBinder[lastBinder.length - 1];
      if (lastDoc && lastDoc.id !== 'trash') {
        updateItem(lastDoc.id, { content: htmlContent, title: file.name });
        selectItem(lastDoc.id);
      }
    } catch (error) {
      console.error('Failed to import Google Sheet:', error);
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


  async function exportGoogleDocAsHtml(docId: string): Promise<string> {
    const response = await fetch(
      `https://docs.google.com/feeds/download/documents/export/Export?id=${docId}&exportFormat=html`,
      {
        headers: {
          Authorization: `Bearer ${cachedAccessToken}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to export doc: ${response.statusText}`);
    }
    return response.text();
  }

  async function downloadGoogleDriveFile(fileId: string): Promise<string> {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${cachedAccessToken}`,
        },
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
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
    google: any & {
      accounts: {
        oauth2: {
          initCodeClient: (config: any) => any;
        };
      };
    };
  }
}
