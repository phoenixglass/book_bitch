import { useAppStore } from '../store/appStore';
import { GROUPS, navigateToConnection, useConnections, type Connection, type ConnectionType } from '../lib/connections';

export function ConnectionsPanel({ objectType, objectId, compact = false }: { objectType: ConnectionType; objectId: string; compact?: boolean }) {
  const state = useAppStore();
  const connections = useConnections(objectType, objectId);

  const grouped = connections.reduce((acc, c) => { (acc[c.type] ??= []).push(c); return acc; }, {} as Partial<Record<ConnectionType, Connection[]>>);

  return (
    <section className={`border border-[#0f3460] rounded bg-[#111827]/40 ${compact ? 'p-2' : 'p-3'}`}>
      <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Connections</div>
      {connections.length === 0 ? <p className="text-xs text-gray-600 italic">No connected items yet.</p> : (
        <div className="space-y-2">
          {(Object.keys(GROUPS) as ConnectionType[]).map((type) => grouped[type]?.length ? (
            <div key={type}>
              <div className="text-[10px] text-gray-500 uppercase mb-1">{GROUPS[type].label}</div>
              <div className="space-y-1">
                {grouped[type]!.map((c) => <button key={`${c.type}:${c.id}`} onClick={() => navigateToConnection(state, c)} className="block w-full text-left text-xs text-gray-200 bg-[#1a1a2e] hover:bg-[#24304f] border border-[#2d3748] rounded px-2 py-1 transition-colors"><span className="truncate block">{c.title}</span>{!compact && c.subtitle && <span className="text-[10px] text-gray-600 truncate block">{c.subtitle}</span>}</button>)}
              </div>
            </div>
          ) : null)}
        </div>
      )}
    </section>
  );
}
