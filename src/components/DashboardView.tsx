import { useMemo } from 'react';
import { useAppStore, totalWordCount } from '../store/appStore';
import { countWords } from '../utils/textStats';
import type { BinderItem } from '../types';

// Captured once at module load rather than inside the memoized computation
// below, since calling Date.now() directly during render/memo is impure.
const DASHBOARD_LOADED_AT = Date.now();

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

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const HEATMAP_WEEKS = 20;
const LEVEL_COLORS = ['#0d1117', '#3b2465', '#553c9a', '#6b46c1', '#9f7aea'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function heatLevel(words: number, max: number): number {
  if (words <= 0) return 0;
  const pct = max > 0 ? words / max : 0;
  if (pct > 0.75) return 4;
  if (pct > 0.5) return 3;
  if (pct > 0.25) return 2;
  return 1;
}

function computeStreaks(dailyWordCounts: Record<string, number>) {
  const writtenDays = Object.keys(dailyWordCounts)
    .filter((k) => (dailyWordCounts[k] ?? 0) > 0)
    .sort();

  let longest = 0;
  let run = 0;
  let prevDate: Date | null = null;
  for (const k of writtenDays) {
    const d = new Date(`${k}T00:00:00`);
    if (prevDate) {
      const diffDays = Math.round((d.getTime() - prevDate.getTime()) / 86400000);
      run = diffDays === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prevDate = d;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cursor = new Date(today);
  if ((dailyWordCounts[dateKey(cursor)] ?? 0) <= 0) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let current = 0;
  while ((dailyWordCounts[dateKey(cursor)] ?? 0) > 0) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { current, longest, daysWritten: writtenDays.length };
}

function WritingHeatmap({ dailyWordCounts }: { dailyWordCounts: Record<string, number> }) {
  const { weeks, monthLabels, max, last7, last30 } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalCells = HEATMAP_WEEKS * 7;
    const endDow = today.getDay();
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - endDow));
    const start = new Date(end);
    start.setDate(start.getDate() - (totalCells - 1));

    const days: { key: string; date: Date; words: number; isFuture: boolean }[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < totalCells; i++) {
      const isFuture = cursor > today;
      const words = isFuture ? 0 : Math.max(0, dailyWordCounts[dateKey(cursor)] ?? 0);
      days.push({ key: dateKey(cursor), date: new Date(cursor), words, isFuture });
      cursor.setDate(cursor.getDate() + 1);
    }

    const max = Math.max(1, ...days.filter((d) => !d.isFuture).map((d) => d.words));
    const weeks: typeof days[] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    let prevMonth = -1;
    const monthLabels = weeks.map((week) => {
      const month = week[0].date.getMonth();
      const label = month !== prevMonth ? MONTH_LABELS[month] : '';
      prevMonth = month;
      return label;
    });

    const sum = (fromDaysAgo: number) => {
      let total = 0;
      const d = new Date(today);
      for (let i = 0; i < fromDaysAgo; i++) {
        total += dailyWordCounts[dateKey(d)] ?? 0;
        d.setDate(d.getDate() - 1);
      }
      return total;
    };

    return { weeks, monthLabels, max, last7: sum(7), last30: sum(30) };
  }, [dailyWordCounts]);

  const streaks = useMemo(() => computeStreaks(dailyWordCounts), [dailyWordCounts]);

  return (
    <div className="bg-[#16213e] border border-[#0f3460] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs text-gray-400 font-semibold">Writing Activity</p>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>🔥 {streaks.current} day streak</span>
          <span>Best: {streaks.longest} days</span>
          <span>Last 7 days: {last7.toLocaleString()}w</span>
          <span>Last 30 days: {last30.toLocaleString()}w</span>
        </div>
      </div>

      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, wi) => {
          return (
            <div key={wi} className="flex flex-col gap-[3px]">
              <div className="h-3 text-[9px] text-gray-600 leading-3 whitespace-nowrap">
                {monthLabels[wi]}
              </div>
              {week.map((day) => (
                <div
                  key={day.key}
                  title={day.isFuture ? '' : `${day.date.toLocaleDateString()}: ${day.words} words`}
                  className="w-3 h-3 rounded-sm"
                  style={{
                    background: day.isFuture ? 'transparent' : LEVEL_COLORS[heatLevel(day.words, max)],
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-1 mt-2 text-[10px] text-gray-600">
        <span>Less</span>
        {LEVEL_COLORS.map((c) => (
          <div key={c} className="w-3 h-3 rounded-sm" style={{ background: c }} />
        ))}
        <span>More</span>
      </div>
    </div>
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
    codexEntries, questions, projectTarget, setArea, setViewMode,
    dailyWordCounts,
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
    const now = DASHBOARD_LOADED_AT;
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

        {/* Writing activity heatmap */}
        <WritingHeatmap dailyWordCounts={dailyWordCounts} />

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
            sub={stats.noSynopsis > 0 ? 'click to view in outline' : undefined}
            onClick={stats.noSynopsis > 0 ? () => { setArea('manuscript'); setViewMode('outline'); } : undefined}
          />
          <StatCard
            label="No POV assigned" value={stats.noPov}
            warn={stats.noPov > 0}
            sub={stats.noPov > 0 ? 'click to view scenes' : undefined}
            onClick={stats.noPov > 0 ? () => { setArea('manuscript'); setViewMode('scene-cards'); } : undefined}
          />
          <StatCard
            label="No timeline placement" value={stats.noTimeline}
            warn={stats.noTimeline > 0}
            sub={stats.noTimeline > 0 ? 'click to view timeline' : undefined}
            onClick={stats.noTimeline > 0 ? () => { setArea('manuscript'); setViewMode('timeline'); } : undefined}
          />
          <StatCard
            label="No status" value={stats.noStatus}
            onClick={stats.noStatus > 0 ? () => { setArea('manuscript'); setViewMode('scene-cards'); } : undefined}
          />
          <StatCard
            label="Stale (7+ days)" value={stats.stale}
            sub={stats.stale > 0 ? 'not updated in 7+ days' : 'all scenes recently updated'}
            onClick={stats.stale > 0 ? () => { setArea('manuscript'); setViewMode('outline'); } : undefined}
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
