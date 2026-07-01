import express from 'express';
import { aiRouter } from '../server/routes/ai.js';
import { parseRouter } from '../server/routes/parse.js';

// Vercel routes every /api/* request to this single serverless function
// (see vercel.json). It previously carried its own hand-copied duplicate of
// every AI route, which drifted out of sync with server/routes/ai.ts (the
// route file the local dev server actually uses) — most notably missing
// storyContext support entirely on /questions, /summarize, /placement,
// /codex-suggest, /refine-question, and /tags, and never mounting
// /api/parse/binary at all. Reuse the same routers dev uses so the two
// environments can't diverge again.

const app = express();
app.use(express.json({ limit: '50mb' }));

app.use('/api/ai', aiRouter);
app.use('/api/parse', parseRouter);

app.get('/api/health', (_req, res) => { res.json({ ok: true, ts: Date.now() }); });

export default app;
