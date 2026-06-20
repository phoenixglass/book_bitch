import { useMemo } from 'react';
import { useAppStore, totalWordCount } from '../store/appStore';
import type { BinderItem } from '../types';

function countWords(html: string) {
  return html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

function collectScenes(items: BinderItem[]): BinderItem[] {
  const scenes: BinderItem[] = [];
  for (const item of items) {
    if (item.id === 'trash') continue;
    if (item.type === 'document') scenes.push(item);
    if (item.children.length) scenes.push(...collectScenes(item.children));
  }
  return scenes;
}

function StatCard({ label, value, sub, onClick, warn }: {
  label: string; value: string | number; sub?: string; onClick?: () => void; warn?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`bg-[#16213e] border rounded-lg p-4 text-left transition-colors ${
        onClick ? 'hover:border-[#6b46c1]/50 cursor-pointer' : 'cursor-default'
      } ${warn ? 'border-amber-900/50' : 'border-[#0f3460]'}`}
    >
      <div className={`text-2xl font-bold mb-1 ${warn ? 'text-amber-400' : 'text-white'}`}>
        {value}
      </div>
      <div className="text-xs text-gray-400">{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </button>
  );
}

function BarChart({ data, label }: { data: Record<string, number>; label: string }) {
  const max = Math.max(...Object.values(data), 1);
  return (
    <div className="bg-[#16213e] border border-[#0f3460] rounded-lg p-4">
      <p className="text-xs text-gray-400 font-semibold mb-3">{label}</p>
      <div className="flex flex-col gap-2">
        {Object.entries(data).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a).map(([key, val]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-36 truncate shrink-0">{key}</span>
            <div className="flex-1 h-4 bg-[#0d1117] rounded overflow-hidden">
              <div
                className="h-full bg-[#6b46c1] rounded transition-all"
                style={{ width: `${(val / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-6 text-right shrink-0">{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardView() {
  const {
    binder, fragments, omittedMaterial, notebookEntries,
    codexEntries, questions, projectTarget, setArea,
  } = useAppStore();

  const stats = useMemo(() => {
    const scenes = collectScenes(binder);
    const manuscriptWordCount = totalWordCount(binder.filter(b => b.id !== 'research' && b.id !== 'trash'));

    const wordCounts = scenes.map(s => countWords(s.content));
    const avgWords = wordCounts.length > 0 ? Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length) : 0;
    const maxWords = Math.max(...wordCounts, 0);
    const minWords = wordCounts.length > 0 ? Math.min(...wordCounts.filter(w => w > 0)) : 0;

    const statusDist: Record<string, number> = {};
    const povDist: Record<string, number> = {};
    const locationDist: Record<string, number> = {};
    const plotlineDist: Record<string, number> = {};
    const themeDist: Record<string, number> = {};

    let noSynopsis = 0;
    let noPov = 0;
    let noTimeline = 0;
    let noStatus = 0;

    const staleMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let stale = 0;

    for (const scene of scenes) {
      const meta = scene.sceneMetadata ?? {};
      statusDist[scene.status] = (statusDist[scene.status] ?? 0) + 1;
      if (!scene.synopsis) noSynopsis++;
      if (!meta.povCharacter) noPov++;
      if (!meta.timelineDateStart && !meta.chronologicalOrder) noTimeline++;
      if (scene.status === 'No Status') noStatus++;
      if (scene.updatedAt && now - scene.updatedAt > staleMs) stale++;
      if (meta.povCharacter) povDist[meta.povCharacter] = (povDist[meta.povCharacter] ?? 0) + 1;
      if (meta.location) locationDist[meta.location] = (locationDist[meta.location] ?? 0) + 1;
      if (meta.plotline) plotlineDist[meta.plotline] = (plotlineDist[meta.plotline] ?? 0) + 1;
      for (const theme of meta.themes ?? []) {
        themeDist[theme] = (themeDist[theme] ?? 0) + 1;
      }
    }

    const pct = projectTarget.wordTarget > 0
      ? Math.round((manuscriptWordCount / projectTarget.wordTarget) * 100)
      : 0;

    return {
      scenes, manuscriptWordCount, avgWords, maxWords, minWords,
      statusDist, povDist, locationDist, plotlineDist, themeDist,
      noSynopsis, noPov, noTimeline, noStatus, stale, pct,
      openQuestions: questions.filter(q => q.questionStatus === 'open').length,
      unsortedFragments: fragments.filter(f => f.status === 'unsorted').length,
      totalFragments: fragments.length,
      totalOmitted: omittedMaterial.length,
      totalNotebook: notebookEntries.length,
      totalCodex: codexEntries.length,
    };
  }, [binder, fragments, omittedMaterial, notebookEntries, codexEntries, questions, projectTarget]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-2 border-b border-[#0f3460] bg-[#1a1a2e] shrink-0">
        <span className="text-sm font-semibold text-white">Manuscript Health</span>
        <span className="text-xs text-gray-500 ml-2">— neutral overview of project data</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Word count progress */}
        {projectTarget.wordTarget > 0 && (
          <div className="bg-[#16213e] border border-[#0f3460] rounded-lg p-4">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-gray-400">Manuscript word count</span>
              <span className="text-xs text-gray-400">{stats.manuscriptWordCount.toLocaleString()} / {projectTarget.wordTarget.toLocaleString()}</span>
            </div>
            <div className="w-full h-3 bg-[#0d1117] rounded-full overflow-hidden mb-1">
              <div className="h-full bg-[#6b46c1] rounded-full transition-all" style={{ width: `${Math.min(100, stats.pct)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>{stats.pct}% of target</span>
              {projectTarget.deadlineDate && (
                <span>Deadline: {new Date(projectTarget.deadlineDate).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        )}

        {/* Key stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          <StatCard label="Manuscript words" value={stats.manuscriptWordCount.toLocaleString()} />
          <StatCard label="Total scenes" value={stats.scenes.length} />
          <StatCard label="Avg scene length" value={`${stats.avgWords}w`} />
          <StatCard label="Longest scene" value={`${stats.maxWords}w`} />
          <StatCard label="Shortest scene" value={`${stats.minWords}w`} />

          <StatCard
            label="Missing synopsis" value={stats.noSynopsis}
            warn={stats.noSynopsis > 0}
            sub={stats.noSynopsis > 0 ? 'scenes without a synopsis' : undefined}
          />
          <StatCard
            label="No POV assigned" value={stats.noPov}
            warn={stats.noPov > 0}
          />
          <StatCard
            label="No timeline placement" value={stats.noTimeline}
            warn={stats.noTimeline > 0}
          />
          <StatCard
            label="No status" value={stats.noStatus}
          />
          <StatCard
            label="Stale (7+ days)" value={stats.stale}
            sub="scenes not updated recently"
          />

          <StatCard
            label="Open questions" value={stats.openQuestions}
            warn={stats.openQuestions > 0}
            onClick={() => setArea('questions')}
          />
          <StatCard
            label="Unsorted fragments" value={stats.unsortedFragments}
            warn={stats.unsortedFragments > 0}
            onClick={() => setArea('fragments')}
          />
          <StatCard
            label="Omitted material" value={stats.totalOmitted}
            onClick={() => setArea('omitted')}
          />
          <StatCard
            label="Codex entries" value={stats.totalCodex}
            onClick={() => setArea('codex')}
          />
          <StatCard
            label="Notebook entries" value={stats.totalNotebook}
            onClick={() => setArea('notebook')}
          />
        </div>

        {/* Distribution charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.keys(stats.statusDist).length > 0 && (
            <BarChart data={stats.statusDist} label="Scenes by Status" />
          )}
          {Object.keys(stats.povDist).length > 0 && (
            <BarChart data={stats.povDist} label="POV Distribution" />
          )}
          {Object.keys(stats.locationDist).length > 0 && (
            <BarChart data={stats.locationDist} label="Location Frequency" />
          )}
          {Object.keys(stats.plotlineDist).length > 0 && (
            <BarChart data={stats.plotlineDist} label="Plotline Distribution" />
          )}
          {Object.keys(stats.themeDist).length > 0 && (
            <BarChart data={stats.themeDist} label="Theme / Motif Frequency" />
          )}
        </div>

        {/* Scene word count map */}
        {stats.scenes.length > 0 && (
          <div className="bg-[#16213e] border border-[#0f3460] rounded-lg p-4">
            <p className="text-xs text-gray-400 font-semibold mb-3">Word Count by Scene (manuscript order)</p>
            <div className="flex flex-wrap gap-1">
              {[...stats.scenes]
                .sort((a, b) => (a.sceneMetadata?.manuscriptOrder ?? 9999) - (b.sceneMetadata?.manuscriptOrder ?? 9999))
                .map(scene => {
                  const wc = countWords(scene.content);
                  const maxWc = stats.maxWords || 1;
                  const pct = (wc / maxWc) * 100;
                  return (
                    <div
                      key={scene.id}
                      title={`${scene.title}: ${wc} words`}
                      className="h-8 w-4 rounded-sm bg-[#6b46c1] opacity-30 hover:opacity-100 transition-opacity cursor-default"
                      style={{ opacity: `${Math.max(0.15, pct / 100)}` }}
                    />
                  );
                })}
            </div>
            <p className="text-xs text-gray-600 mt-2">Each bar = one scene. Height is relative to the longest scene.</p>
          </div>
        )}
      </div>
    </div>
  );
}
