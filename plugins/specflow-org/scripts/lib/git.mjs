import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

export const isGitRepo = (dir) => fs.existsSync(path.join(dir, '.git'));

export function headSha(dir) {
  if (!isGitRepo(dir)) return null;
  const r = git(dir, ['rev-parse', 'HEAD']);
  return r.ok ? r.out : null;
}

export function currentBranch(dir) {
  if (!isGitRepo(dir)) return null;
  const r = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return r.ok ? r.out : null;
}

export function isDirty(dir) {
  const r = git(dir, ['status', '--porcelain']);
  return r.ok && r.out.length > 0;
}

export function branchExists(dir, name) {
  return git(dir, ['rev-parse', '--verify', '--quiet', `refs/heads/${name}`]).ok;
}

export function switchBranch(dir, name) {
  if (branchExists(dir, name)) return git(dir, ['switch', name]);
  return git(dir, ['switch', '-c', name]);
}
