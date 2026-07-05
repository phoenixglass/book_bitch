import { useAppStore } from '../store/appStore';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  // The "Download Backup" button exports whatever project is currently
  // loaded in the editor. Only offer it when that's actually the project
  // being acted on — otherwise it would silently download the wrong
  // project and give false confidence. Defaults to true.
  canDownload?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// A confirmation step for actions that permanently discard data (deleting a
// project, emptying trash, overwriting content on a Drive re-sync). Offers a
// one-click local JSON backup before proceeding, but never blocks on it —
// this is a nag, not a gate.
export function BackupNagDialog({ title, message, confirmLabel, danger = true, canDownload = true, onCancel, onConfirm }: Props) {
  const exportProjectBackup = useAppStore((s) => s.exportProjectBackup);

  function handleDownloadAndContinue() {
    exportProjectBackup();
    onConfirm();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-[#1a1a2e] border border-white/10 rounded-lg shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-white mb-2">{title}</h2>
        <p className="text-xs text-gray-400 mb-4">{message}</p>
        <div className="flex flex-col gap-2">
          {canDownload && (
            <button
              onClick={handleDownloadAndContinue}
              className="w-full px-3 py-2 rounded text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors"
            >
              ↓ Download Backup, Then {confirmLabel}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`w-full px-3 py-2 rounded text-sm transition-colors ${
              danger
                ? 'text-red-400 hover:bg-red-900/20 border border-red-900/50'
                : 'text-gray-300 hover:bg-[#2d3748] border border-white/10'
            }`}
          >
            {canDownload ? `${confirmLabel} Without Backup` : confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="w-full px-3 py-2 rounded text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
