// ─── Existing core types ─────────────────────────────────────────────────────

export type ItemType = 'folder' | 'document' | 'root';

export type Label =
  | 'none'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple';

export type Status =
  | 'No Status'
  | 'To Do'
  | 'In Progress'
  | 'First Draft'
  | 'Revised Draft'
  | 'Final Draft'
  | 'Done';

export type DraftStatus = Status;

export interface Snapshot {
  id: string;
  timestamp: number;
  label: string;
  content: string;
  metadataSnapshot?: Partial<SceneMetadata>;
  note?: string;
}

export interface SceneMetadata {
  povCharacter: string;
  charactersPresent: string[];
  location: string;
  timelineDateStart: string;
  timelineDateEnd: string;
  timelineUncertain: boolean;
  timelineLabel: string;
  timelineNotes: string;
  plotline: string;
  manuscriptOrder: number;
  chronologicalOrder: number;
  emotionalTemperature: number; // 1–10
  tensionLevel: number; // 1–10
  themes: string[];
  motifs: string[];
  sceneFunction: string;
  unansweredQuestions: string;
  whatChanged: string;
  tags: string[];
}

export interface BinderItem {
  id: string;
  type: ItemType;
  title: string;
  content: string;
  synopsis: string;
  notes: string;
  label: Label;
  status: Status;
  children: BinderItem[];
  expanded: boolean;
  snapshots: Snapshot[];
  wordCountTarget: number;
  driveFileId?: string;
  sceneMetadata?: Partial<SceneMetadata>;
  createdAt?: number;
  updatedAt?: number;
}

export type ViewMode =
  | 'editor'
  | 'corkboard'
  | 'outline'
  | 'scene-cards'
  | 'timeline'
  | 'dashboard'
  | 'structural-map';

export type AppArea =
  | 'manuscript'
  | 'fragments'
  | 'omitted'
  | 'notebook'
  | 'codex'
  | 'questions'
  | 'moodboard'
  | 'history'
  | 'search'
  | 'trash';

// ─── Import Source Metadata ───────────────────────────────────────────────────

export interface ImportSourceMeta {
  fileName: string;
  fileType: string; // 'docx' | 'txt' | 'md' | 'html' | 'google_doc'
  sourceHeading?: string;
  headingLevel?: number;
  importedAt: number;
  googleFileId?: string;
  googleTabId?: string;
  googleTabTitle?: string;
  originalSection?: 'manuscript' | 'fragments' | 'omitted';
}

export interface ProjectTarget {
  wordTarget: number;
  deadlineDate: string;
}

// ─── Tags ────────────────────────────────────────────────────────────────────

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

// ─── Fragments ───────────────────────────────────────────────────────────────

export type FragmentType =
  | 'line'
  | 'paragraph'
  | 'scene_fragment'
  | 'research_note'
  | 'image_idea'
  | 'dialogue_scrap'
  | 'thematic_note'
  | 'memory'
  | 'other';

export type FragmentStatus =
  | 'unsorted'
  | 'maybe_useful'
  | 'attached'
  | 'promoted'
  | 'discarded';

export interface Fragment {
  id: string;
  title: string;
  content: string;
  fragmentType: FragmentType;
  tags: string[];
  relatedCharacters: string[];
  relatedPlaces: string[];
  relatedThemes: string[];
  possiblePlacement: string;
  notes: string;
  source: string;
  status: FragmentStatus;
  attachedToSceneId?: string;
  // Ordering & trash
  trashedAt?: number;
  // Import provenance
  importSource?: ImportSourceMeta;
  createdAt: number;
  updatedAt: number;
}

// ─── Omitted Material ────────────────────────────────────────────────────────

export type OmissionStatus =
  | 'cut'
  | 'saved_for_later'
  | 'alternate_version'
  | 'duplicate'
  | 'research_only'
  | 'structurally_homeless'
  | 'restored';

export interface OmittedMaterial {
  id: string;
  title: string;
  content: string;
  sourceSceneId?: string;
  sourceSceneTitle?: string;
  reason: string;
  omissionDate: number;
  tags: string[];
  relatedCharacters: string[];
  relatedThemes: string[];
  relatedLocations: string[];
  omissionStatus: OmissionStatus;
  notes: string;
  // Ordering & trash
  trashedAt?: number;
  // Import provenance
  importSource?: ImportSourceMeta;
  createdAt: number;
  updatedAt: number;
}

// ─── Notebook ────────────────────────────────────────────────────────────────

export interface NotebookEntry {
  id: string;
  title: string;
  content: string;
  date: string;
  tags: string[];
  relatedSceneIds: string[];
  relatedFragmentIds: string[];
  relatedCodexIds: string[];
  relatedQuestionIds: string[];
  isPrivate: boolean;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Codex / Bible ───────────────────────────────────────────────────────────

export type CodexType =
  | 'character'
  | 'place'
  | 'object'
  | 'motif'
  | 'institution'
  | 'event'
  | 'document'
  | 'theme'
  | 'custom';

export interface CodexEntry {
  id: string;
  name: string;
  codexType: CodexType;
  customTypeName?: string;
  description: string;
  notes: string;
  aliases: string[];
  tags: string[];
  relatedSceneIds: string[];
  relatedFragmentIds: string[];
  relatedOmittedIds: string[];
  relatedNotebookIds: string[];
  relatedQuestionIds: string[];
  customFields: Record<string, string>;
  // Character-specific
  role?: string;
  age?: string;
  pronouns?: string;
  relationships?: string;
  physicalDetails?: string;
  voiceNotes?: string;
  arcNotes?: string;
  secrets?: string;
  contradictions?: string;
  // Place-specific
  atmosphere?: string;
  // Motif/Object-specific
  meaning?: string;
  appearances?: string;
  evolution?: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Questions ───────────────────────────────────────────────────────────────

export type QuestionCategory =
  | 'plot'
  | 'character'
  | 'timeline'
  | 'research'
  | 'structure'
  | 'theme'
  | 'continuity'
  | 'worldbuilding'
  | 'emotional_logic'
  | 'other';

export type QuestionStatus =
  | 'open'
  | 'answered'
  | 'intentionally_ambiguous'
  | 'irrelevant'
  | 'deferred';

export interface Question {
  id: string;
  text: string;
  category: QuestionCategory;
  questionStatus: QuestionStatus;
  priority: 'low' | 'medium' | 'high';
  relatedSceneIds: string[];
  relatedFragmentIds: string[];
  relatedOmittedIds: string[];
  relatedCodexIds: string[];
  relatedNotebookIds: string[];
  answer: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Moodboard ───────────────────────────────────────────────────────────────

export interface MoodboardItem {
  id: string;
  title: string;
  imageUrl: string;
  description: string;
  tags: string[];
  source: string;
  relatedSceneIds: string[];
  relatedCodexIds: string[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Generic Relationship / Link ─────────────────────────────────────────────

export type ObjectType =
  | 'scene'
  | 'fragment'
  | 'omitted_material'
  | 'notebook_entry'
  | 'codex_entry'
  | 'question'
  | 'moodboard_item';

export type RelationshipType =
  | 'mentions'
  | 'related_to'
  | 'attached_to'
  | 'promoted_from'
  | 'restored_from'
  | 'source_of'
  | 'appears_in'
  | 'answers'
  | 'raises_question'
  | 'visual_reference_for'
  | 'research_for';

export interface Link {
  id: string;
  sourceType: ObjectType;
  sourceId: string;
  targetType: ObjectType;
  targetId: string;
  relationshipType: RelationshipType;
  createdAt: number;
}

// ─── History / Draft Archaeology ─────────────────────────────────────────────

export type HistoryEventType =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'moved'
  | 'renamed'
  | 'status_changed'
  | 'snapshot_created'
  | 'snapshot_restored'
  | 'promoted'
  | 'attached'
  | 'restored'
  | 'linked'
  | 'exported'
  | 'imported';

export interface HistoryEvent {
  id: string;
  eventType: HistoryEventType;
  objectType: ObjectType;
  objectId: string;
  objectTitle: string;
  relatedObjectType?: ObjectType;
  relatedObjectId?: string;
  relatedObjectTitle?: string;
  timestamp: number;
  description: string;
}

// ─── Saved Filters ───────────────────────────────────────────────────────────

export interface FilterCondition {
  field: string;
  operator: 'equals' | 'contains' | 'not_equals' | 'is_empty' | 'is_not_empty';
  value?: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  targetArea: AppArea;
  conditions: FilterCondition[];
  createdAt: number;
}

// ─── Editor Appearance Settings ──────────────────────────────────────────────

export interface EditorSettings {
  fontFamily: string;
  fontSize: number;          // pt
  lineHeight: number;        // multiplier, e.g. 2.0 = double
  firstLineIndent: number;   // inches
  paragraphSpacingBefore: number; // pt
  paragraphSpacingAfter: number;  // pt
  textAlign: 'left' | 'center' | 'right' | 'justify';
  pageWidth: number;         // px max-width of text column
  pageBackground: string;    // css color
  textColor: string;         // css color
}

// ─── Manuscript Format Settings ──────────────────────────────────────────────

export interface ManuscriptSettings {
  // Author contact info (for title page)
  authorName: string;
  authorEmail: string;
  authorPhone: string;
  authorAddress: string;
  // Book metadata
  bookTitle: string; // overrides projectTitle when set
  subtitle: string;
  genre: string;
  // Export options
  sceneBreakStyle: '#' | '***';
  includeEndMarker: boolean;
  includeChapterTitles: boolean;
  includeTitlePage: boolean;
  includePageNumbers: boolean;
  // Optional content
  includeSynopsis: boolean;
  synopsisContent: string;
  includeQueryLetter: boolean;
  queryLetterContent: string;
}

// ─── AI Settings ─────────────────────────────────────────────────────────────

export type AIMode =
  | 'disabled'
  | 'questions_only'
  | 'analysis_only'
  | 'metadata_assistance'
  | 'continuity_checking'
  | 'summarization'
  | 'full';

export interface AISettings {
  mode: AIMode;
  allowDrafting: boolean;
  apiKey?: string;
}

// ─── AI Actions & Results ─────────────────────────────────────────────────────

export type AIActionType =
  | 'questions'
  | 'summarize'
  | 'metadata'
  | 'tags'
  | 'placement'
  | 'codex-suggest'
  | 'extract-questions'
  | 'refine-question'
  | 'plotline';

export interface AIQuestionSuggestion {
  text: string;
  category: QuestionCategory;
  priority: 'low' | 'medium' | 'high';
  reason: string;
}

export interface AIQuestionsOutput {
  type: 'questions';
  questions: AIQuestionSuggestion[];
  truncated?: boolean;
}

export interface AISummarizeOutput {
  type: 'summarize';
  summary: string;
  bulletPoints: string[];
  characters: string[];
  places: string[];
  motifs: string[];
  suggestedTags: string[];
  unansweredQuestions: string[];
  truncated?: boolean;
}

export interface AIMetadataOutput {
  type: 'metadata';
  synopsis: string;
  povCharacter: string;
  charactersPresent: string[];
  location: string;
  timelineDateClue: string;
  emotionalTemperature: number;
  tensionLevel: number;
  themes: string[];
  motifs: string[];
  sceneFunction: string;
  whatChanged: string;
  unansweredQuestions: string[];
  suggestedTags: string[];
  truncated?: boolean;
  // tracks which fields the user has accepted (undefined = not yet decided)
  accepted?: Partial<Record<string, boolean>>;
}

export interface AITagsOutput {
  type: 'tags';
  existingMatches: string[];
  newSuggestions: string[];
  truncated?: boolean;
  applied?: string[];
}

export interface AIPlacementOutput {
  type: 'placement';
  suggestions: string[];
  possibleScenes: string[];
  rationale: string;
  truncated?: boolean;
}

export interface AICodexSuggestOutput {
  type: 'codex-suggest';
  fieldSuggestions: Array<{ field: string; value: string; reason: string }>;
  contradictions: string[];
  openQuestions: string[];
  truncated?: boolean;
}

export interface AIExtractQuestionsOutput {
  type: 'extract-questions';
  questions: AIQuestionSuggestion[];
  truncated?: boolean;
}

export interface AIRefineQuestionOutput {
  type: 'refine-question';
  refined: string;
  suggestedCategory: QuestionCategory;
  suggestedPriority: 'low' | 'medium' | 'high';
  rationale: string;
  relatedQuestions: string[];
  truncated?: boolean;
}

export interface AIPlotlineOutput {
  type: 'plotline';
  suggestions: Array<{ name: string; reason: string }>;
  truncated?: boolean;
}

export type AIOutput =
  | AIQuestionsOutput
  | AISummarizeOutput
  | AIMetadataOutput
  | AITagsOutput
  | AIPlacementOutput
  | AICodexSuggestOutput
  | AIExtractQuestionsOutput
  | AIRefineQuestionOutput
  | AIPlotlineOutput;

// ─── AI Context Model ─────────────────────────────────────────────────────────

export type AIObjectType =
  | 'scene'
  | 'fragment'
  | 'omitted_material'
  | 'notebook_entry'
  | 'codex_entry'
  | 'question'
  | 'moodboard_item';

export interface SelectedAIContext {
  objectType: AIObjectType;
  objectId: string;
  title: string;
  content: string;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  area: AppArea;
}

export interface AIResult {
  id: string;
  actionType: AIActionType;
  sourceTitle: string;
  sourceType: 'scene' | 'fragment' | 'codex' | 'notebook' | 'question' | 'omitted';
  sourceId?: string;
  createdAt: number;
  output: AIOutput;
}

// ─── Split Screen ─────────────────────────────────────────────────────────────

export interface SplitRefTarget {
  type: 'scene' | 'fragment' | 'omitted' | 'codex' | 'notebook' | 'question';
  id: string;
}

// ─── Full App State ───────────────────────────────────────────────────────────

export interface AppState {
  // Existing
  projectTitle: string;
  binder: BinderItem[];
  selectedId: string | null;
  multiSelectedIds: string[];
  viewMode: ViewMode;
  compositionMode: boolean;
  inspectorOpen: boolean;
  projectTarget: ProjectTarget;

  // New collections
  fragments: Fragment[];
  omittedMaterial: OmittedMaterial[];
  notebookEntries: NotebookEntry[];
  codexEntries: CodexEntry[];
  questions: Question[];
  moodboardItems: MoodboardItem[];
  projectTags: Tag[];
  links: Link[];
  history: HistoryEvent[];
  savedFilters: SavedFilter[];

  // Navigation
  area: AppArea;
  splitScreenOpen: boolean;
  splitRefTarget: SplitRefTarget | null;
  splitRefPinned: boolean;
  searchOpen: boolean;
  searchQuery: string;
  pendingSelectId: string | null;

  // AI
  aiSettings: AISettings;
  aiPanelOpen: boolean;
  pendingAIResult: AIResult | null;
  aiContextObject: { type: AIObjectType; id: string } | null;

  // Editor appearance settings
  editorSettings: EditorSettings;

  // Manuscript format settings
  manuscriptSettings: ManuscriptSettings;

  // Last time local data was modified (ISO string), used for cloud sync conflict resolution
  localLastModified: string;

  // ─── Existing actions ──────────────────────────────────────────────────────
  setProjectTitle: (title: string) => void;
  addItem: (parentId: string | null, type: 'folder' | 'document') => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<BinderItem>) => void;
  moveItem: (id: string, targetParentId: string | null, index: number) => void;
  selectItem: (id: string | null) => void;
  toggleExpanded: (id: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setCompositionMode: (on: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setProjectTarget: (target: Partial<ProjectTarget>) => void;
  takeSnapshot: (id: string, label: string) => void;
  restoreSnapshot: (itemId: string, snapshotId: string) => void;
  deleteSnapshot: (itemId: string, snapshotId: string) => void;
  emptyTrash: () => void;
  permanentlyDeleteItem: (id: string) => void;

  // ─── Navigation ────────────────────────────────────────────────────────────
  setArea: (area: AppArea) => void;
  setSplitScreen: (open: boolean, target?: SplitRefTarget) => void;
  setSplitRefPinned: (pinned: boolean) => void;
  setSplitRefTarget: (target: SplitRefTarget | null) => void;
  setSearchOpen: (open: boolean, query?: string) => void;
  setSearchQuery: (query: string) => void;
  setPendingSelectId: (id: string | null) => void;

  // ─── Tags ──────────────────────────────────────────────────────────────────
  addTag: (name: string, color?: string) => Tag;
  updateTag: (id: string, patch: Partial<Tag>) => void;
  deleteTag: (id: string) => void;
  getOrCreateTag: (name: string) => Tag;

  // ─── Fragments ─────────────────────────────────────────────────────────────
  addFragment: (partial?: Partial<Fragment>) => string;
  updateFragment: (id: string, patch: Partial<Fragment>) => void;
  deleteFragment: (id: string) => void;
  attachFragmentToScene: (fragmentId: string, sceneId: string) => void;
  promoteFragmentToScene: (fragmentId: string, parentId: string) => string;
  sendFragmentToOmitted: (fragmentId: string, reason?: string) => void;
  // New movement actions
  moveFragmentToOmitted: (id: string, reason?: string) => void;
  moveFragmentToManuscript: (id: string, parentId?: string) => string;
  trashFragment: (id: string) => void;
  restoreFragmentFromTrash: (id: string) => void;
  permanentlyDeleteFragment: (id: string) => void;
  reorderFragment: (draggedId: string, targetId: string, position: 'before' | 'after') => void;
  importToFragments: (items: Array<{ title: string; content: string; importSource?: ImportSourceMeta }>) => string[];

  // ─── Omitted Material ──────────────────────────────────────────────────────
  addOmittedMaterial: (partial?: Partial<OmittedMaterial>) => string;
  updateOmittedMaterial: (id: string, patch: Partial<OmittedMaterial>) => void;
  deleteOmittedMaterial: (id: string) => void;
  sendSceneToOmitted: (sceneId: string, reason?: string) => void;
  sendSceneToFragments: (sceneId: string) => void;
  restoreOmittedToScene: (omittedId: string, parentId?: string) => string;
  // New movement actions
  moveOmittedToFragments: (id: string) => void;
  moveOmittedToManuscript: (id: string, parentId?: string) => string;
  trashOmitted: (id: string) => void;
  restoreOmittedFromTrash: (id: string) => void;
  permanentlyDeleteOmitted: (id: string) => void;
  reorderOmitted: (draggedId: string, targetId: string, position: 'before' | 'after') => void;
  importToOmitted: (items: Array<{ title: string; content: string; reason?: string; importSource?: ImportSourceMeta }>) => string[];
  importToManuscript: (items: Array<{ title: string; content: string; importSource?: ImportSourceMeta }>, parentId?: string) => string[];

  // ─── Notebook ──────────────────────────────────────────────────────────────
  addNotebookEntry: (partial?: Partial<NotebookEntry>) => string;
  updateNotebookEntry: (id: string, patch: Partial<NotebookEntry>) => void;
  deleteNotebookEntry: (id: string) => void;

  // ─── Codex ─────────────────────────────────────────────────────────────────
  addCodexEntry: (partial?: Partial<CodexEntry>) => string;
  updateCodexEntry: (id: string, patch: Partial<CodexEntry>) => void;
  deleteCodexEntry: (id: string) => void;

  // ─── Questions ─────────────────────────────────────────────────────────────
  addQuestion: (partial?: Partial<Question>) => string;
  updateQuestion: (id: string, patch: Partial<Question>) => void;
  deleteQuestion: (id: string) => void;

  // ─── Moodboard ─────────────────────────────────────────────────────────────
  addMoodboardItem: (partial?: Partial<MoodboardItem>) => string;
  updateMoodboardItem: (id: string, patch: Partial<MoodboardItem>) => void;
  deleteMoodboardItem: (id: string) => void;

  // ─── Links ─────────────────────────────────────────────────────────────────
  addLink: (link: Omit<Link, 'id' | 'createdAt'>) => void;
  removeLink: (id: string) => void;

  // ─── History ───────────────────────────────────────────────────────────────
  recordEvent: (event: Omit<HistoryEvent, 'id' | 'timestamp'>) => void;

  // ─── Saved Filters ─────────────────────────────────────────────────────────
  addSavedFilter: (filter: Omit<SavedFilter, 'id' | 'createdAt'>) => void;
  deleteSavedFilter: (id: string) => void;

  // ─── AI ────────────────────────────────────────────────────────────────────
  setAISettings: (patch: Partial<AISettings>) => void;
  setAIPanelOpen: (open: boolean) => void;
  setPendingAIResult: (result: AIResult | null) => void;
  setAIContextObject: (obj: { type: AIObjectType; id: string } | null) => void;

  // ─── Editor Appearance ─────────────────────────────────────────────────────
  updateEditorSettings: (patch: Partial<EditorSettings>) => void;

  // ─── Manuscript Format ─────────────────────────────────────────────────────
  updateManuscriptSettings: (patch: Partial<ManuscriptSettings>) => void;

  // ─── Export / Backup ───────────────────────────────────────────────────────
  exportProjectBackup: () => void;
  importProjectFromCloud: (data: Record<string, unknown>, cloudTimestamp?: string) => void;
  importProjectBackup: (json: string) => void;
}
