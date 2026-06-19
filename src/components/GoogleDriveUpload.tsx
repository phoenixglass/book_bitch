import { useState } from 'react';
import { useAppStore } from '../store/appStore';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

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
          const content = await downloadGoogleDriveFile(file.id);
          addItem(null, 'document');
          const lastBinder = useAppStore.getState().binder;
          const lastDoc = lastBinder[lastBinder.length - 1];
          if (lastDoc && lastDoc.id !== 'trash') {
            updateItem(lastDoc.id, { content, title: file.name });
            selectItem(lastDoc.id);
          }
        } catch (error) {
          console.error('Failed to import file:', error);
        }
      }
    }
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
