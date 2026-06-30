import express from 'express';
import { aiRouter } from './routes/ai.js';
import { parseRouter } from './routes/parse.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(express.json({ limit: '50mb' }));

app.use('/api/ai', aiRouter);
app.use('/api/parse', parseRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.listen(PORT, () => {
  console.log(`AI server listening on http://localhost:${PORT}`);
});
