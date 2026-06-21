import express from 'express';
import { aiRouter } from '../server/routes/ai.js';

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use('/api/ai', aiRouter);
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

export default app;
