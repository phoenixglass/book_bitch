import { useDriveImport } from '../hooks/useDriveImport';
import '../types/googleApi';

interface Props {
  targetSection?: 'manuscript' | 'fragments' | 'omitted' | 'research';
}

export function GoogleDriveUpload({ targetSection = 'manuscript' }: Props) {
  const { isLoading, importFromDrive } = useDriveImport(targetSection);

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
