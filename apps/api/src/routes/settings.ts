import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, requireUser } from '../middleware/auth.js';
import { validateBody } from '../lib/validation.js';
import { getUserOverridesWithAssets } from '../services/market-data/overrides.js';
import { serialize } from '../lib/serialize.js';
import { eraseAccount } from '../services/erasure.js';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { backupRuns } from '../db/schema.js';
import { verifiedBackupExists } from '../services/backup-storage.js';

const app = new Hono();
app.use('*', authMiddleware);

app.get('/backups', async (c) => {
  const userId = requireUser(c);
  const db = getDb();
  const [latest] = await db.select().from(backupRuns).where(eq(backupRuns.userId, userId))
    .orderBy(desc(backupRuns.startedAt)).limit(1);
  const [verified] = await db.select().from(backupRuns)
    .where(and(eq(backupRuns.userId, userId), eq(backupRuns.status, 'verified')))
    .orderBy(desc(backupRuns.startedAt)).limit(1);
  const usable = verified ? await verifiedBackupExists(userId, verified.id, verified.bytes, verified.sha256) : false;
  if (verified && !usable) {
    await db.update(backupRuns).set({ status: 'unavailable', error: 'Published artifact missing or corrupt' })
      .where(and(eq(backupRuns.id, verified.id), eq(backupRuns.userId, userId), eq(backupRuns.status, 'verified')));
  }
  const status = verified && !usable && latest?.id === verified.id ? 'unavailable' :
    latest?.status === 'running' && Date.now() - latest.startedAt.getTime() > 86_400_000
      ? 'interrupted' : latest?.status ?? 'not_configured';
  return c.json({
    lastBackup: usable && verified ? { verifiedAt: verified.finishedAt?.toISOString() ?? null,
      bytes: verified.bytes?.toString() ?? null, sha256: verified.sha256 } : null,
    status, workerStatus: status, reason: verified && !usable ? 'artifact_missing_or_corrupt' : null,
    retentionNote: 'Backups locais não são removidos por prazo; são excluídos com a conta. Persistência após troca de instância não é garantida.',
  });
});

app.get('/overrides', async (c) => c.json({ overrides: serialize(await getUserOverridesWithAssets(requireUser(c))) }));

const confirmation = z.object({ email: z.string().email(), password: z.string().min(1) }).strict();
app.delete('/account', async (c) => {
  const userId = requireUser(c);
  const body = await validateBody(c, confirmation);
  if (!(await eraseAccount(userId, body.email, body.password))) {
    return c.json({ error: { code: 'INVALID_CONFIRMATION', message: 'Email or password does not match' } }, 403);
  }
  c.header('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax');
  return c.body(null, 204);
});

export default app;
