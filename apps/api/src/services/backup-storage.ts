import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { validateRestorePayload } from './restore.js';

export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const within = (base: string, candidate: string) => {
  const rel = relative(base, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

/** Reject directories outside the repository, including symlinks escaping it. */
export async function backupRoot(): Promise<string> {
  const configured = process.env.BACKUP_DIR ?? '.data/backups';
  const path = resolve(root, configured);
  if (!within(root, path)) throw new Error('BACKUP_DIR must be inside the project root');
  // Check each existing parent before creating a child: a symlink in .data
  // must never make mkdir create a directory outside the repository.
  const canonicalRoot = await realpath(root);
  let parent = root;
  for (const segment of relative(root, path).split(sep).filter(Boolean)) {
    if (!within(canonicalRoot, await realpath(parent))) throw new Error('BACKUP_DIR resolves outside the project root');
    parent = resolve(parent, segment);
    await mkdir(parent, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    });
  }
  if (!within(canonicalRoot, await realpath(path))) throw new Error('BACKUP_DIR resolves outside the project root');
  return path;
}

export async function ownerDirectory(userId: string): Promise<string> {
  const dir = resolve(await backupRoot(), createHash('sha256').update(userId).digest('hex'));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (!within(await realpath(await backupRoot()), await realpath(dir))) throw new Error('Backup owner directory escapes storage');
  return dir;
}

export interface StagedBackup { temporary: string; checksum: string; bytes: number; }

/** Write incrementally, read back at most MAX_BACKUP_BYTES and run actual schema/replay validation. */
export async function stageVerifiedBackup(userId: string, stream: ReadableStream<Uint8Array>, dir: string): Promise<StagedBackup> {
  const temporary = resolve(dir, `${randomUUID()}.partial`);
  const digest = createHash('sha256');
  let bytes = 0;
  try {
    const limiter = new Transform({ transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.length;
      if (bytes > MAX_BACKUP_BYTES) { done(new Error('Backup exceeds verification size limit')); return; }
      digest.update(chunk);
      done(null, chunk);
    } });
    await pipeline(Readable.fromWeb(stream as never), limiter, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
    if ((await stat(temporary)).size !== bytes) throw new Error('Backup write length mismatch');
    const checksum = digest.digest('hex');
    const diskDigest = createHash('sha256');
    for await (const chunk of createReadStream(temporary)) diskDigest.update(chunk);
    if (diskDigest.digest('hex') !== checksum) throw new Error('Backup write checksum mismatch');
    // The archive has already been size bounded before it is parsed in memory.
    validateRestorePayload(JSON.parse(await readFile(temporary, 'utf8')), userId);
    return { temporary, checksum, bytes };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** Called only while holding the owner row lock; caller records verified metadata in the same transaction. */
export async function publishBackup(dir: string, id: string, staged: StagedBackup): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid backup ID');
  await rename(staged.temporary, resolve(dir, `${id}.json`));
}

/** Bounded disk attestation, independent of database status. Reject symlinks and unbounded files. */
export async function verifiedBackupExists(userId: string, id: string, bytes: bigint | null,
  sha256: string | null): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(id) || bytes == null || bytes <= 0n ||
    bytes > BigInt(MAX_BACKUP_BYTES) || !sha256 || !/^[0-9a-f]{64}$/.test(sha256)) return false;
  try {
    const path = resolve(await ownerDirectory(userId), `${id}.json`);
    const info = await lstat(path);
    if (!info.isFile() || info.size !== Number(bytes)) return false;
    const digest = createHash('sha256');
    let read = 0;
    for await (const chunk of createReadStream(path)) {
      read += chunk.length;
      if (read > MAX_BACKUP_BYTES || read > info.size) return false;
      digest.update(chunk);
    }
    return read === info.size && digest.digest('hex') === sha256;
  } catch { return false; }
}

/** Erasure holds the same owner lock as publication. No remaining restore-usable artifacts. */
export async function eraseBackupFiles(userId: string): Promise<void> {
  const dir = await ownerDirectory(userId);
  await rm(dir, { force: true, recursive: true });
}

/** Remove interrupted/unpublished files only; published files have a different extension. */
export async function removeStagedFiles(dir: string): Promise<void> {
  for (const name of await readdir(dir)) {
    if (name.endsWith('.partial')) await rm(resolve(dir, name), { force: true });
  }
}
