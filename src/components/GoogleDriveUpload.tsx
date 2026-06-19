import { useDriveImport } from '../hooks/useDriveImport';

export function GoogleDriveUpload() {
  const { isLoading, importFromDrive } = useDriveImport();

  return (
    <button
      onClick={importFromDrive}
      disabled={isLoading}
      title="Import from Google Drive"
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
