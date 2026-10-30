import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

/** Fail closed when Git cannot prove every destination is ignored and untracked. */
export function preflightPrivateFiles(root, names) {
  const canonical = realpathSync(root);
  const git = (args) => spawnSync('git', ['-c', `safe.directory=${canonical}`, '-C', canonical, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  const top = git(['rev-parse', '--show-toplevel']);
  if (top.error || top.status !== 0 || !top.stdout.trim() || realpathSync(top.stdout.trim()) !== canonical) {
    throw new Error('Git worktree cannot be verified; no private files written');
  }
  for (const name of names) {
    if (!/^\.env\.[a-z0-9.]+\.local$/.test(name)) throw new Error('Unsafe private destination name');
    const file = resolve(canonical, name);
    if (existsSync(file) && (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile())) {
      throw new Error('Refusing to use a symlink or non-regular private file');
    }
    const tracked = git(['ls-files', '--error-unmatch', '--', name]);
    if (tracked.error || tracked.status !== 1) throw new Error('Private destination tracked or Git tracking check failed');
    const ignored = git(['check-ignore', '--no-index', '-q', '--', name]);
    if (ignored.error || ignored.status !== 0) throw new Error('Private destination not effectively Git-ignored');
  }
}
