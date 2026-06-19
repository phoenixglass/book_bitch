import { useAppStore } from '../store/appStore';
import type { BinderItem, Label, Status } from '../types';

const LABELS: Label[] = ['none', 'red', 'orange', 'yellow', 'green', 'blue', 'purple'];
const STATUSES: Status[] = [
  'No Status',
  'To Do',
  'In Progress',
  'First Draft',
  'Revised Draft',
  'Final Draft',
  'Done',
];

const LABEL_COLORS: Record<string, string> = {
  none: 'transparent',
  red: '#fc8181',
  orange: '#f6ad55',
  yellow: '#f6e05e',
  green: '#68d391',
  blue: '#63b3ed',
  purple: '#b794f4',
};

const STATUS_COLORS: Record<string, string> = {
  'No Status': '#4a5568',
  'To Do': '#fc8181',
  'In Progress': '#f6ad55',
  'First Draft': '#f6e05e',
  'Revised Draft': '#68d391',
  'Final Draft': '#63b3ed',
  Done: '#b794f4',
};

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordCount(html: string) {
  const text = stripHtml(html);
  return text ? text.split(/\s+/).length : 0;
}

interface RowProps {
  item: BinderItem;
  depth: number;
}

function OutlineRow({ item, depth }: RowProps) {
  const { selectedId, selectItem, updateItem, toggleExpanded } = useAppStore();
  const isSelected = selectedId === item.id;
  const words = wordCount(item.content);

  return (
    <>
      <tr
        className={`border-b border-[#1e2a3a] cursor-pointer transition-colors ${
          isSelected
            ? 'bg-[#2d1f5e]'
            : 'hover:bg-[#1e2a3a]'
        }`}
        onClick={() => selectItem(item.id)}
      >
        {/* Title */}
        <td className="py-2 text-sm text-white" style={{ paddingLeft: `${depth * 20 + 12}px` }}>
          <div className="flex items-center gap-2">
            {item.type === 'folder' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(item.id);
                }}
                className="text-xs opacity-60"
              >
                {item.expanded ? '▼' : '▶'}
              </button>
            )}
            <span>{item.type === 'folder' ? '📁' : '📄'}</span>
            <span className="truncate max-w-xs">{item.title}</span>
          </div>
        </td>

        {/* Synopsis */}
        <td className="py-2 px-3 text-xs text-gray-400 max-w-xs">
          <input
            value={item.synopsis}
            onChange={(e) => updateItem(item.id, { synopsis: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="—"
            className="bg-transparent outline-none w-full text-gray-400 placeholder-gray-600"
          />
        </td>

        {/* Label */}
        <td className="py-2 px-3 text-xs">
          <select
            value={item.label}
            onChange={(e) =>
              updateItem(item.id, { label: e.target.value as Label })
            }
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1a1a2e] text-xs rounded px-1 py-0.5 outline-none border border-[#2d3748]"
            style={{ color: LABEL_COLORS[item.label] !== 'transparent' ? LABEL_COLORS[item.label] : '#9ca3af' }}
          >
            {LABELS.map((l) => (
              <option key={l} value={l} style={{ color: LABEL_COLORS[l] !== 'transparent' ? LABEL_COLORS[l] : undefined }}>
                {l}
              </option>
            ))}
          </select>
        </td>

        {/* Status */}
        <td className="py-2 px-3 text-xs">
          <select
            value={item.status}
            onChange={(e) =>
              updateItem(item.id, { status: e.target.value as Status })
            }
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1a1a2e] text-xs rounded px-1 py-0.5 outline-none border border-[#2d3748]"
            style={{ color: STATUS_COLORS[item.status] }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </td>

        {/* Word count */}
        <td className="py-2 px-3 text-xs text-gray-500 text-right">
          {item.type === 'document' ? words : '—'}
        </td>

        {/* Word target */}
        <td className="py-2 px-3 text-xs text-gray-500 text-right">
          {item.type === 'document' && (
            <input
              type="number"
              value={item.wordCountTarget || ''}
              onChange={(e) =>
                updateItem(item.id, {
                  wordCountTarget: parseInt(e.target.value) || 0,
                })
              }
              onClick={(e) => e.stopPropagation()}
              placeholder="—"
              className="bg-transparent outline-none w-16 text-right text-gray-500 placeholder-gray-700"
            />
          )}
          {item.type === 'folder' && '—'}
        </td>
      </tr>

      {/* Children */}
      {item.type === 'folder' &&
        item.expanded &&
        item.children.map((child) => (
          <OutlineRow key={child.id} item={child} depth={depth + 1} />
        ))}
    </>
  );
}

export function Outline() {
  const { binder } = useAppStore();

  return (
    <div className="flex-1 overflow-y-auto bg-[#12192c]">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-[#16213e] border-b border-[#0f3460]">
          <tr>
            <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Title
            </th>
            <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Synopsis
            </th>
            <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Label
            </th>
            <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Status
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Words
            </th>
            <th className="py-2 px-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Target
            </th>
          </tr>
        </thead>
        <tbody>
          {binder.map((item) => (
            <OutlineRow key={item.id} item={item} depth={0} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
