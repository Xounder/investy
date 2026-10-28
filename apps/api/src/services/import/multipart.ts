import type { Context } from 'hono';

export class UploadError extends Error {
  constructor(message: string, public readonly status: 400 | 413) { super(message); }
}

/** Limit the complete multipart body (including all fields and boundaries) before parsing any parts. */
export async function boundedMultipart(c: Context, maxBytes: number): Promise<FormData> {
  const contentType = c.req.header('content-type');
  if (!contentType?.toLowerCase().startsWith('multipart/form-data')) throw new UploadError('Envie um arquivo multipart', 400);
  if (Number(c.req.header('content-length') ?? 0) > maxBytes) throw new UploadError('Arquivo muito grande', 413);
  const reader = c.req.raw.body?.getReader();
  if (!reader) throw new UploadError('Upload inválido', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw new UploadError('Arquivo muito grande', 413);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError('Upload inválido', 400);
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return await new Request(c.req.url, { method: 'POST', headers: { 'content-type': contentType }, body: bytes }).formData();
  } catch { throw new UploadError('Upload inválido', 400); }
}
