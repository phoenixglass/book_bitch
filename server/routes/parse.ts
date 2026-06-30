import { Router } from 'express';
import type { Request, Response } from 'express';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const pdfParse = _require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
import mammoth from 'mammoth';

export const parseRouter = Router();

// POST /api/parse/binary
// Accepts { fileType: 'pdf'|'docx', data: '<base64>' }
// Returns { html: string }
parseRouter.post('/binary', async (req: Request, res: Response) => {
  const { fileType, data } = req.body as { fileType?: string; data?: string };

  if (!fileType || !data) {
    res.status(400).json({ error: 'fileType and data (base64) are required.' });
    return;
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(data, 'base64');
  } catch {
    res.status(400).json({ error: 'Invalid base64 data.' });
    return;
  }

  try {
    if (fileType === 'pdf') {
      const result = await pdfParse(buffer);
      const html = result.text
        .split(/\n{2,}/)
        .map((para) => `<p>${para.replace(/\n/g, ' ').trim()}</p>`)
        .filter((p) => p !== '<p></p>')
        .join('\n');
      res.json({ html });
    } else if (fileType === 'docx' || fileType === 'doc') {
      const result = await mammoth.convertToHtml({ buffer });
      res.json({ html: result.value });
    } else {
      res.status(400).json({ error: `Unsupported fileType: ${fileType}` });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Failed to parse file: ${msg}` });
  }
});
