import { useMemo } from 'react';
import { computeWordDiff } from '../utils/textDiff';

export interface DiffSide {
  label: string;
  timestamp: number | null; // null for "Current"
  content: string;
}

interface SnapshotDiffModalProps {
  left: DiffSide;
  right: DiffSide;
  onClose: () => void;
}

function formatTimestamp(ts: number | null): string {
  return ts === null ? 'Current' : new Date(ts).toLocaleString();
}

export function SnapshotDiffModal({ left, right, onClose }: SnapshotDiffModalProps) {
  const { parts, stat } = useMemo(
    () => computeWordDiff(left.content, right.content),
    [left.content, right.content],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#16213e] border border-[#0f3460] rounded-xl shadow-2xl w-[820px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[#0f3460] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Compare Snapshots</h2>
              <p className="text-xs text-gray-400 mt-1">
                <span className="text-red-400">{left.label}</span>
                <span className="text-gray-600"> ({formatTimestamp(left.timestamp)})</span>
                <span className="mx-2 text-gray-600">→</span>
                <span className="text-green-400">{right.label}</span>
                <span className="text-gray-600"> ({formatTimestamp(right.timestamp)})</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white text-xl leading-none mt-0.5"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="text-green-400">+{stat.added} words</span>
            <span className="text-red-400">-{stat.removed} words</span>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {parts.length === 0 || (parts.length === 1 && !parts[0].added && !parts[0].removed && parts[0].value.trim() === '') ? (
            <p className="text-xs text-gray-600 italic">Both versions are empty.</p>
          ) : stat.added === 0 && stat.removed === 0 ? (
            <p className="text-xs text-gray-600 italic">No differences.</p>
          ) : (
            <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed font-serif">
              {parts.map((part, i) => {
                if (part.added) {
                  return (
                    <span key={i} className="bg-green-900/40 text-green-300">
                      {part.value}
                    </span>
                  );
                }
                if (part.removed) {
                  return (
                    <span key={i} className="bg-red-900/40 text-red-300 line-through">
                      {part.value}
                    </span>
                  );
                }
                return <span key={i}>{part.value}</span>;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
