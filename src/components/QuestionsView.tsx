import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { TagInput } from './TagInput';
import type { Question, QuestionCategory, QuestionStatus } from '../types';

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  plot: 'Plot', character: 'Character', timeline: 'Timeline',
  research: 'Research', structure: 'Structure', theme: 'Theme',
  continuity: 'Continuity', worldbuilding: 'Worldbuilding',
  emotional_logic: 'Emotional Logic', other: 'Other',
};

const STATUS_LABELS: Record<QuestionStatus, string> = {
  open: 'Open',
  answered: 'Answered',
  intentionally_ambiguous: 'Intentionally Ambiguous',
  irrelevant: 'Irrelevant',
  deferred: 'Deferred',
};

const STATUS_COLORS: Record<QuestionStatus, string> = {
  open: '#f6ad55',
  answered: '#68d391',
  intentionally_ambiguous: '#b794f4',
  irrelevant: '#4a5568',
  deferred: '#63b3ed',
};

const PRIORITY_COLORS = { low: '#4a5568', medium: '#f6ad55', high: '#fc8181' };

const ASK_ME_TEMPLATES: Record<QuestionCategory, string[]> = {
  plot: [
    'What is the inciting event that makes this unavoidable?',
    'What does the protagonist want? What do they actually need?',
    'What is the antagonistic force, and what does it want?',
    'What is the point of no return in this story?',
  ],
  character: [
    'What does this character believe that is untrue or incomplete?',
    'What would this character never do—and when will they do it?',
    'How does this character speak differently when afraid?',
    'What secret is this character keeping from themselves?',
  ],
  timeline: [
    'Is the story told in the right order, or would another order reveal more?',
    'What gaps exist in the timeline that the reader might notice?',
    "Are there events offstage that are more important than what's shown?",
    'What does the reader know, and when do they know it?',
  ],
  research: [
    'What facts in this scene do you need to verify?',
    "What details would a specialist notice that you've missed?",
  ],
  structure: [
    'Does each scene move the story forward, or does it stall?',
    "Where is the reader's attention in each scene?",
    'What is the shape of this story?',
  ],
  theme: [
    'What is this story actually about underneath the plot?',
    'Which objects or images recur and could carry more weight?',
    'What question does this story refuse to answer?',
  ],
  continuity: [
    'Does anything contradict what was established earlier?',
    'Are character behaviors consistent with who they are?',
    'Do minor details match across chapters?',
  ],
  worldbuilding: [
    'What rules govern this world, and when do they break down?',
    "What does the world look like to someone who's never seen it?",
  ],
  emotional_logic: [
    'Would this character realistically feel this way given what they know?',
    'Is the reader emotionally ahead of, behind, or aligned with the character?',
    'What is the emotional wound beneath this scene?',
  ],
  other: [
    "What is the one thing you're most afraid to write in this project?",
    'What would you cut if you had to lose 20% of the story?',
    'What does this story want to be?',
  ],
};

function QuestionDetail({ question, onClose }: { question: Question; onClose: () => void }) {
  const { updateQuestion, deleteQuestion, addNotebookEntry, setArea } = useAppStore();

  function saveToNotebook() {
    addNotebookEntry({
      title: `Q: ${question.text.slice(0, 60)}`,
      content: `**Question:** ${question.text}\n\n**Category:** ${CATEGORY_LABELS[question.category]}\n\n**Answer/Notes:**\n${question.answer}`,
      relatedQuestionIds: [question.id],
    });
    setArea('notebook');
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#0f3460] shrink-0">
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs">← Back</button>
        <span className="flex-1" />
        <select
          value={question.questionStatus}
          onChange={(e) => updateQuestion(question.id, { questionStatus: e.target.value as QuestionStatus })}
          className="bg-[#16213e] border border-[#2d3748] rounded px-2 py-0.5 text-xs outline-none focus:border-[#6b46c1]"
          style={{ color: STATUS_COLORS[question.questionStatus] }}
        >
          {(Object.entries(STATUS_LABELS) as [QuestionStatus, string][]).map(([v, l]) => (
            <option key={v} value={v} style={{ color: STATUS_COLORS[v as QuestionStatus] }}>{l}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <textarea
          value={question.text}
          onChange={(e) => updateQuestion(question.id, { text: e.target.value })}
          rows={3}
          placeholder="What is your question?"
          className="w-full text-lg font-medium text-white bg-transparent border-b border-[#2d3748] pb-2 outline-none focus:border-[#6b46c1] resize-none leading-relaxed placeholder-gray-600"
        />

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Category</label>
            <select
              value={question.category}
              onChange={(e) => updateQuestion(question.id, { category: e.target.value as QuestionCategory })}
              className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
            >
              {(Object.entries(CATEGORY_LABELS) as [QuestionCategory, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Priority</label>
            <select
              value={question.priority}
              onChange={(e) => updateQuestion(question.id, { priority: e.target.value as 'low' | 'medium' | 'high' })}
              className="w-full bg-[#16213e] border border-[#2d3748] rounded px-2 py-1 text-gray-300 outline-none focus:border-[#6b46c1] text-xs"
              style={{ color: PRIORITY_COLORS[question.priority] }}
            >
              <option value="low" style={{ color: PRIORITY_COLORS.low }}>Low</option>
              <option value="medium" style={{ color: PRIORITY_COLORS.medium }}>Medium</option>
              <option value="high" style={{ color: PRIORITY_COLORS.high }}>High</option>
            </select>
          </div>
          <div className="flex items-end">
            <span
              className="text-xs px-2 py-1 rounded w-full text-center"
              style={{ background: `${STATUS_COLORS[question.questionStatus]}22`, color: STATUS_COLORS[question.questionStatus] }}
            >
              {STATUS_LABELS[question.questionStatus]}
            </span>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Answer / Notes</label>
          <textarea
            value={question.answer}
            onChange={(e) => updateQuestion(question.id, { answer: e.target.value })}
            rows={6}
            placeholder="Your answer, or working notes toward an answer…"
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-3 py-2 text-gray-200 text-sm outline-none focus:border-[#6b46c1] resize-y leading-relaxed placeholder-gray-600"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-1">Private Notes</label>
          <textarea
            value={question.notes}
            onChange={(e) => updateQuestion(question.id, { notes: e.target.value })}
            rows={2}
            className="w-full bg-[#16213e] border border-[#2d3748] rounded px-3 py-2 text-gray-300 text-xs outline-none focus:border-[#6b46c1] resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Related Scenes</label>
            <TagInput
              tags={question.relatedSceneIds}
              onChange={(v) => updateQuestion(question.id, { relatedSceneIds: v })}
              placeholder="Add scene…"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Related Codex Entries</label>
            <TagInput
              tags={question.relatedCodexIds}
              onChange={(v) => updateQuestion(question.id, { relatedCodexIds: v })}
              placeholder="Add entry…"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={saveToNotebook}
            className="text-xs text-purple-400 hover:text-purple-300 bg-[#6b46c1]/10 hover:bg-[#6b46c1]/20 px-3 py-1.5 rounded transition-colors"
          >
            📓 Save to Notebook
          </button>
          <button
            onClick={() => { if (window.confirm('Delete this question?')) { deleteQuestion(question.id); onClose(); } }}
            className="text-xs text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded hover:bg-red-900/20"
          >
            🗑 Delete
          </button>
        </div>

        <div className="text-xs text-gray-600">
          Created {new Date(question.createdAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function AskMeQuestionsPanel({ onAdd }: { onAdd: (text: string, category: QuestionCategory) => void }) {
  const [category, setCategory] = useState<QuestionCategory>('plot');
  const templates = ASK_ME_TEMPLATES[category];
  const [shown, setShown] = useState<string[]>(() => templates.slice(0, 3));

  function shuffle() {
    const all = ASK_ME_TEMPLATES[category];
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    setShown(shuffled.slice(0, 3));
  }

  return (
    <div className="border border-[#0f3460] rounded p-3 bg-[#16213e]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-400 font-semibold">Craft Question Templates</span>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value as QuestionCategory); setShown(ASK_ME_TEMPLATES[e.target.value as QuestionCategory].slice(0, 3)); }}
          className="bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-0.5 text-xs text-gray-300 outline-none focus:border-[#6b46c1]"
        >
          {(Object.entries(CATEGORY_LABELS) as [QuestionCategory, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button onClick={shuffle} className="text-xs text-gray-500 hover:text-gray-300 ml-auto">↻ More</button>
      </div>
      <div className="flex flex-col gap-1">
        {shown.map((q) => (
          <div key={q} className="flex items-start gap-2 group">
            <p className="flex-1 text-xs text-gray-400 leading-relaxed">{q}</p>
            <button
              onClick={() => onAdd(q, category)}
              className="text-[10px] text-purple-400 hover:text-purple-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
            >
              + Save
            </button>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-600 mt-2">These are static templates, not AI-generated. They ask you to think — no API required.</p>
    </div>
  );
}

export function QuestionsView() {
  const { questions, addQuestion, pendingSelectId, setPendingSelectId, setAIContextObject } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setAIContextObject(selectedId ? { type: 'question', id: selectedId } : null);
  }, [selectedId, setAIContextObject]);

  useEffect(() => {
    if (pendingSelectId) {
      setSelectedId(pendingSelectId);
      setPendingSelectId(null);
    }
  }, [pendingSelectId, setPendingSelectId]);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterText, setFilterText] = useState('');
  const [showAskMe, setShowAskMe] = useState(false);

  const filtered = useMemo(() => {
    let list = questions;
    if (filterStatus) list = list.filter(q => q.questionStatus === filterStatus);
    if (filterCategory) list = list.filter(q => q.category === filterCategory);
    if (filterText) {
      const lc = filterText.toLowerCase();
      list = list.filter(q =>
        q.text.toLowerCase().includes(lc) ||
        q.answer.toLowerCase().includes(lc),
      );
    }
    return [...list].sort((a, b) => {
      const pri = { high: 0, medium: 1, low: 2 };
      return pri[a.priority] - pri[b.priority] || b.createdAt - a.createdAt;
    });
  }, [questions, filterStatus, filterCategory, filterText]);

  const selected = questions.find(q => q.id === selectedId) ?? null;

  function handleAddQuestion(text = '', category: QuestionCategory = 'other') {
    const id = addQuestion({ text, category });
    setSelectedId(id);
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-80 shrink-0 bg-[#16213e] border-r border-[#0f3460] flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-[#0f3460]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Questions
              {questions.filter(q => q.questionStatus === 'open').length > 0 && (
                <span className="ml-1 text-amber-400">
                  ({questions.filter(q => q.questionStatus === 'open').length} open)
                </span>
              )}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setShowAskMe(!showAskMe)}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${showAskMe ? 'bg-purple-700 text-white' : 'text-gray-400 hover:text-white hover:bg-[#2d3748]'}`}
              >
                Templates
              </button>
              <button
                onClick={() => handleAddQuestion()}
                className="text-xs bg-[#6b46c1] text-white px-2 py-0.5 rounded hover:bg-[#553c9a]"
              >
                + New
              </button>
            </div>
          </div>

          {showAskMe && (
            <div className="mb-2">
              <AskMeQuestionsPanel onAdd={(text, cat) => handleAddQuestion(text, cat)} />
            </div>
          )}

          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search questions…"
            className="w-full bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-[#6b46c1] mb-1"
          />
          <div className="flex gap-1">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="flex-1 bg-[#1a1a2e] border border-[#2d3748] rounded px-1 py-0.5 text-xs text-gray-400 outline-none"
            >
              <option value="">All statuses</option>
              {(Object.entries(STATUS_LABELS) as [QuestionStatus, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="flex-1 bg-[#1a1a2e] border border-[#2d3748] rounded px-1 py-0.5 text-xs text-gray-400 outline-none"
            >
              <option value="">All categories</option>
              {(Object.entries(CATEGORY_LABELS) as [QuestionCategory, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-4 text-center text-gray-600">
              <div className="text-3xl mb-2">❓</div>
              <p className="text-xs">No questions yet.</p>
              <p className="text-xs mt-1 text-gray-700">Track unresolved questions, plot holes, research needs, and intentional ambiguity.</p>
            </div>
          )}
          {filtered.map(q => (
            <button
              key={q.id}
              onClick={() => setSelectedId(q.id)}
              className={`w-full text-left px-3 py-2 border-b border-[#0f3460] transition-colors ${selectedId === q.id ? 'bg-[#6b46c1]/20' : 'hover:bg-[#2d3748]'}`}
            >
              <div className="flex items-start gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                  style={{ background: STATUS_COLORS[q.questionStatus] }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white line-clamp-2 leading-snug">{q.text || <span className="text-gray-600 italic">No text yet</span>}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                    <span>{CATEGORY_LABELS[q.category]}</span>
                    <span style={{ color: PRIORITY_COLORS[q.priority] }}>●</span>
                    <span>{q.priority}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <QuestionDetail key={selected.id} question={selected} onClose={() => setSelectedId(null)} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center">
            <div className="text-5xl mb-3">❓</div>
            <p className="text-sm">Select a question to work on it.</p>
            <p className="text-xs mt-1 text-gray-700">Use "Ask me" to generate craft questions without generating prose.</p>
          </div>
        </div>
      )}
    </div>
  );
}
