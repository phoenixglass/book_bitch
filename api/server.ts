import express from 'express';
import { aiRouter } from '../server/routes/ai.js';

// Vercel routes every /api/* request to this single serverless function
// (see vercel.json). It previously carried its own hand-copied duplicate of
// every AI route, which drifted out of sync with server/routes/ai.ts (the
// route file the local dev server actually uses) — most notably missing
// storyContext support entirely on /questions, /summarize, /placement,
// /codex-suggest, /refine-question, and /tags. Reuse the same router dev
// uses so the two environments can't diverge again.
//
// Note: /api/parse/binary (server/routes/parse.ts, used for Drive PDF/DOCX
// import) is intentionally NOT mounted here yet — it pulls in pdf-parse and
// mammoth, which need to be verified against Vercel's serverless bundling
// (size limits, asset tracing) before wiring into this function. That's a
// separate, pre-existing gap and shouldn't be bundled into this fix blind.

const app = express();
app.use(express.json({ limit: '50mb' }));

app.use('/api/ai', aiRouter);

app.get('/api/health', (_req, res) => { res.json({ ok: true, ts: Date.now() }); });

export default app;
