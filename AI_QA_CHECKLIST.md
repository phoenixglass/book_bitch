# AI Multi-Object Support — Manual QA Checklist

## Prerequisites
- AI must be configured (ANTHROPIC_API_KEY or OPENAI_API_KEY set in server environment)
- AI mode must be set to something other than "disabled" (use "Full" for complete coverage)
- Each section must be tested with AI panel open (toggle via toolbar)

---

## 1. Manuscript Scene

**Setup:** Navigate to Manuscript → select a document scene with at least 50 words of content.

- [ ] AI panel shows object type badge: **Scene**
- [ ] AI panel shows scene title and word count
- [ ] Available actions shown: Ask Me Questions, Summarize Scene, Generate Metadata, Suggest Tags
- [ ] Run **Ask Me Questions** → questions appear, each with category and priority
- [ ] Save one question to Question Bank → confirm ✓ Saved to Question Bank
- [ ] Navigate to Questions view → confirm saved question appears with linked scene ID
- [ ] Refresh app → confirm question persists
- [ ] Run **Summarize Scene** → summary appears with bullet points, characters, places
- [ ] Click "Save as Synopsis" → navigate to Inspector → confirm synopsis field updated
- [ ] Run **Generate Metadata** → metadata fields appear with checkboxes
- [ ] Accept POV Character and Location → click Apply Selected → confirm fields saved in Inspector
- [ ] Run **Suggest Tags** → existing and new tag suggestions appear
- [ ] Apply one new tag → confirm tag appears in scene metadata
- [ ] Refresh → confirm all saved data persists

---

## 2. Fragment

**Setup:** Navigate to Fragments → select a fragment with at least 20 words.

- [ ] AI panel shows object type badge: **Fragment**
- [ ] AI panel shows fragment title and word count
- [ ] Available actions shown: Ask Me Questions, Summarize Fragment, Suggest Tags, Find Possible Use
- [ ] **Generate Metadata is NOT shown** (scene-only — note appears at bottom of panel)
- [ ] Run **Ask Me Questions** → questions appear
- [ ] Save one question → navigate to Questions → confirm it has `relatedFragmentIds` containing this fragment's ID
- [ ] Refresh → confirms persistence
- [ ] Run **Summarize Fragment** → summary appears
- [ ] Click "Save to Notes" → navigate to fragment detail → confirm notes field updated
- [ ] Run **Find Possible Use** → analysis and placement suggestions appear
- [ ] Click "Save to Possible Placement" → confirm saved in fragment's Possible Placement field
- [ ] Run **Suggest Tags** → tag suggestions appear
- [ ] Apply one tag → confirm tag appears in fragment detail
- [ ] Refresh → confirm all persists

---

## 3. Omitted Material

**Setup:** Navigate to Omitted → select an omitted item with at least 20 words of content.

- [ ] AI panel shows object type badge: **Omitted Material**
- [ ] AI panel shows title and word count
- [ ] Available actions shown: Ask Me Questions, Summarize, Suggest Tags, Restoration Analysis
- [ ] Run **Ask Me Questions** → questions appear
- [ ] Save one question → confirm `relatedOmittedIds` set correctly
- [ ] Refresh → confirms persistence
- [ ] Run **Summarize** → summary appears
- [ ] Click "Save to Notes" → confirm omitted item notes updated
- [ ] Run **Restoration Analysis** → structural/thematic analysis appears
- [ ] Click "Save to Notes" → confirm saved
- [ ] Run **Suggest Tags** → tags suggested, apply one → confirm
- [ ] Refresh → all persists

---

## 4. Notebook Entry

**Setup:** Navigate to Notebook → select an entry with at least 20 words of content.

- [ ] AI panel shows object type badge: **Notebook Entry**
- [ ] AI panel shows entry title and word count
- [ ] Available actions shown: Summarize Note, Suggest Tags, Extract Questions
- [ ] **Ask Me Questions and Generate Metadata are NOT shown**
- [ ] Run **Summarize Note** → summary appears
- [ ] Click "Save as New Notebook Entry" → navigate to Notebook → confirm a new entry titled "Summary: [title]" was created
- [ ] Run **Extract Questions** → extracted questions appear with categories
- [ ] Save one extracted question → navigate to Questions → confirm it has `relatedNotebookIds` set
- [ ] Refresh → confirms persistence
- [ ] Run **Suggest Tags** → tag suggestions → apply one → confirm saved to notebook entry tags

---

## 5. Codex Entry

**Setup:** Navigate to Codex → select an entry with a description of at least 20 words.

- [ ] AI panel shows object type badge: **Codex Entry**
- [ ] AI panel shows entry name (title) and word count
- [ ] Available actions shown: Ask Me Questions, Summarize Entry, Suggest Tags, Suggest Missing Fields
- [ ] Run **Ask Me Questions** → questions appear
- [ ] Save one question → confirm `relatedCodexIds` set
- [ ] Refresh → confirms persistence
- [ ] Run **Summarize Entry** → summary appears
- [ ] Click "Save to Notes" → confirm codex entry notes updated
- [ ] Run **Suggest Missing Fields** → field suggestions appear with checkboxes
- [ ] Accept one suggestion → click Apply Selected → confirm applied
- [ ] Check for contradictions section (if any) and open questions (if any)
- [ ] Save an open question to Question Bank → confirm `relatedCodexIds` set
- [ ] Run **Suggest Tags** → tag suggestions → apply → confirm
- [ ] Refresh → all persists

---

## 6. Project Question

**Setup:** Navigate to Questions → select a question with text.

- [ ] AI panel shows object type badge: **Project Question**
- [ ] AI panel shows question text (truncated as title) and content word count
- [ ] Available actions shown: Refine Question, Summarize Notes, Suggest Tags
- [ ] **Ask Me Questions and Generate Metadata are NOT shown**
- [ ] Run **Refine Question** → refined question text appears with suggested category and priority
- [ ] Confirm rationale is shown
- [ ] Click "Apply Refined Question" → navigate to question detail → confirm text, category, and priority updated
- [ ] Refresh → confirms persistence
- [ ] Run **Summarize Notes** → if question has notes/answer, summary appears
- [ ] Click "Save to Question Notes" → confirm notes field updated
- [ ] Run **Suggest Tags** → tag suggestions appear (note: tags on questions are not currently shown in QuestionsView detail, but the AI action should not error)

---

## 7. Moodboard Item

**Setup:** Navigate to Moodboard → select an item with a description or notes.

- [ ] AI panel shows object type badge: **Moodboard Item**
- [ ] AI panel shows item title and word count
- [ ] Available actions shown: Summarize Description, Suggest Tags
- [ ] Run **Summarize Description** → summary appears
- [ ] Click "Save to Notes" → confirm moodboard item notes updated
- [ ] Run **Suggest Tags** → tag suggestions → apply one → confirm
- [ ] Refresh → all persists

---

## 8. Cross-Cutting Checks

### AI Disabled State
- [ ] Set AI mode to "Disabled" (via ⚙ in AI panel or project settings)
- [ ] Select any item in any area
- [ ] Confirm AI panel shows "AI is disabled" message, no actions available
- [ ] No action is runnable

### Missing API Key
- [ ] Remove/clear API key from server environment
- [ ] Restart server
- [ ] Open AI panel → confirm "AI not configured" message shown
- [ ] Re-check status button works

### Prose Drafting Lock
- [ ] Set AI mode to anything other than "Full"
- [ ] Confirm "⊘ Prose drafting disabled" message appears at bottom of action picker
- [ ] Run any action → confirm AI output is analytical only (no drafted manuscript text)
- [ ] In Full mode with allowDrafting = false → same check

### No Item Selected
- [ ] Navigate to Fragments with no fragment selected
- [ ] Open AI panel → confirm message: "No item selected. Select a scene, fragment, notebook entry, codex entry, or project question to use AI assistance."
- [ ] Navigate to Codex with no codex entry selected → same behaviour

### Scene-Only Action Note
- [ ] Select a fragment or codex entry
- [ ] Confirm the panel shows "ⓘ Generate Metadata is a scene-only action and is not shown here."
- [ ] Confirm Generate Metadata does NOT appear in the action list

### No Overwrite of Manuscript Content
- [ ] Run any AI action on a fragment, codex entry, or notebook entry
- [ ] Confirm no manuscript scene content is modified
- [ ] Open a manuscript scene in the editor → confirm content unchanged

### Area Switching
- [ ] With AI panel open, switch from Manuscript (scene selected) to Fragments (no fragment selected)
- [ ] Confirm panel updates to "No item selected"
- [ ] Select a fragment → confirm panel updates to show Fragment context
- [ ] Switch back to Manuscript → confirm scene context returns

### Static Question Templates Separation
- [ ] Navigate to Questions view → click "Ask Me Questions" panel
- [ ] Confirm the static templates are labelled "Craft Question Templates" (or similar)
- [ ] Confirm they are NOT presented as AI-generated output
- [ ] Open AI panel while on Questions view → AI panel uses AI, templates panel is separate

---

## 9. Persistence Verification

After each item type test, confirm:
- [ ] The app can be refreshed (Ctrl+R / F5) without losing saved AI output
- [ ] Saved questions appear in the Question Bank
- [ ] Applied tags persist in the object's tag field
- [ ] Applied summaries/notes persist in the correct field
- [ ] No cross-contamination between object types (scene synopsis not overwritten by fragment save, etc.)

---

## 10. Codex Generation (Full Binder) & Story-Brief Metadata

These tests cover the rebuilt Codex generation and chapter-metadata context retrieval.
Run them against the **Observations** project.

### TEST 1 — Full Binder Coverage
- [ ] Open the Observations project (multiple chapters in the Manuscript binder).
- [ ] Go to **Codex → ✨ Generate**. The scope panel opens.
- [ ] Confirm scope defaults to **Full Observations binder**.
- [ ] Confirm the panel shows the item count and approximate word count **before** running, and states that Trash is excluded and empty items skipped.
- [ ] Click **Run Codex generation**. After it finishes, the review header shows a coverage bar: `N/M chapters contributed`, chunk count, words analyzed.
- [ ] Confirm `chapters contributed` reflects chapters **beyond the first few** (expand a few candidates' "appears in N chapters" to verify source chapters are cited from across the binder).

### TEST 2 — Entity Type Classification
- [ ] Confirm **Phoenix** and **Putin** are classified as **Character** (with a tier badge: Major/Secondary/Minor) and marked "actual character".
- [ ] Confirm **Hillary Clinton** / **John Oliver** are classified as **Real-world Reference** (🌐) and marked "passing reference", NOT Character — unless the text gives them active story function.
- [ ] Confirm **The New York Times** is classified as **Publication / Media** (📰) or Institution, not Character.
- [ ] Confirm places, institutions, motifs, documents, or themes appear as non-character types where appropriate.
- [ ] Use the per-candidate **type dropdown** to reclassify one candidate before saving; confirm the change holds.

### TEST 3 — Passing References
- [ ] Confirm one-off public figures / media references are separated (🌐 reference, "passing reference" badge) and are **unchecked by default**.
- [ ] Use **"Only actual entities"** to confirm references get deselected.
- [ ] Reject (uncheck) the passing references and **Save selected**. Confirm they are not added to the Codex.

### TEST 4 — Deduplication / Merging
- [ ] Run Codex generation once and save Phoenix + Putin.
- [ ] Run Codex generation again. Confirm Phoenix and Putin now show a yellow **"merges into …"** badge.
- [ ] Save again → navigate the Codex list → confirm there is still ONE Phoenix and ONE Putin (no duplicates); their related scene IDs/aliases were merged.

### TEST 5 — Story Brief in Metadata
- [ ] In the AI panel, confirm a saved **Story Brief** exists (generate one if needed).
- [ ] Select a manuscript chapter → AI panel → **Generate Metadata**.
- [ ] Confirm the result shows the green banner **"✓ Story Brief included"**.
- [ ] Confirm generated metadata reflects the larger premise (e.g. character roles, central dynamics from the Brief), not only the chapter text.
- [ ] Delete the Story Brief and re-run → confirm the amber **"⚠ No Story Brief found"** banner appears instead.

### TEST 6 — Metadata Field Accuracy & Partial Persistence
- [ ] Confirm metadata separates: **Active Characters**, **Minor / Real-world References**, **Institutions / Publications**, and **Motifs/Themes** into distinct fields.
- [ ] Accept some fields (e.g. Synopsis + Active Characters) and reject others.
- [ ] Click **Apply Selected** → confirm only accepted fields apply (qualitative extras append to the chapter Notes under "— AI chapter metadata —").
- [ ] Refresh the page → confirm only the accepted fields persisted; rejected fields did not change anything.

### TEST 7 — No Silent Truncation
- [ ] On a large binder, run Codex generation on Full binder scope.
- [ ] Confirm the scope panel warns when the binder is large and states it will be analyzed in chunks (no chapters dropped).
- [ ] Confirm the coverage bar's "chapters contributed" and chunk count show the whole binder was processed — it does NOT stop at the first few chapters.

---

## Notes for QA Tester

- AI output quality varies; the QA goal is that actions run, data saves to the correct model, and no errors occur.
- If an AI action returns "AI returned an unexpected format", retry once — this is a transient API issue.
- If truncation warning appears, it is expected for long content (>8000 characters).
- The "Find Possible Use" / "Restoration Analysis" action uses the `/api/ai/placement` endpoint.
- The "Extract Questions" action uses the existing `/api/ai/questions` endpoint with `extractFromNote: true`.
- The "Suggest Missing Fields" action uses the new `/api/ai/codex-suggest` endpoint.
- The "Refine Question" action uses the new `/api/ai/refine-question` endpoint.
