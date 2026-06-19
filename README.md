# book_bitch

An online writing tool inspired by Scrivener — organize, write, and export long-form projects entirely in the browser.

## Features

- **Binder** — hierarchical tree of folders and documents; drag-and-drop reordering; double-click to rename
- **Rich Text Editor** — TipTap-powered editor with bold/italic/strikethrough, headings (H1–H3), bullet/ordered/task lists, blockquotes, inline code, highlight, undo/redo
- **Corkboard** — index-card view showing synopses; edit card synopses inline
- **Outline** — spreadsheet-style view with title, synopsis, label, status, word count, and per-document word target
- **Inspector** — per-document synopsis, private notes, label, status, word target, deadline; project-level word target
- **Snapshots** — take labelled version snapshots of any document; restore or delete from the Inspector
- **Compile & Export** — export the whole project to plain text, HTML, or Markdown; optional project title, synopses, and section separators
- **Project Targets** — live word count in the toolbar with a progress bar toward your project word target
- **Full-screen Composition Mode** — distraction-free writing with a single-column layout
- **Trash** — deleted items are moved to the Trash folder in the binder
- **Persistence** — everything is auto-saved to `localStorage`

## Tech stack

- [Vite](https://vite.dev/) + [React](https://react.dev/) + TypeScript
- [TipTap](https://tiptap.dev/) rich-text editor
- [Zustand](https://zustand-demo.pmnd.rs/) state management (persisted to localStorage)
- [Tailwind CSS](https://tailwindcss.com/) v4

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Build

```bash
npm run build
npm run preview
```
An app to organize novel chapters and timeline
