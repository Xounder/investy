import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireUser } from '../middleware/auth.js';
import { validateQuery } from '../lib/validation.js';
import { exportStream } from '../services/export.js';

const app = new Hono();
app.use('*', authMiddleware);

app.post('/', (c) => {
  const { format } = validateQuery(c, z.object({ format: z.enum(['json', 'csv']) }).strict());
  const stream = exportStream(requireUser(c), format);
  return new Response(stream, {
    headers: {
      'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'application/zip',
      'Content-Disposition': `attachment; filename="investy-export.${format === 'json' ? 'json' : 'zip'}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

export default app;
