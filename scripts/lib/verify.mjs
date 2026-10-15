import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { UserError, now, paths, repoDir, specDirAbs } from './state.mjs';
import { headSha } from './git.mjs';

const FENCE = '````';
const mirrorFile = (ctx, id) => path.join(paths(ctx.root).cache, 'evidence', `${id}.jsonl`);

export function verificationFile(ctx, f) {
  const dir = specDirAbs(ctx, f);
  if (!dir) throw new UserError(`${f.id} has no spec_dir yet; link one with \`sdlc feature link\` before recording evidence.`);
  return path.join(dir, 'verification.md');
}

export function tail(text, n = 40) {
  return text.split(/\r?\n/).slice(-n).join('\n').replace(/````/g, '\'\'\'\'');
}

export function appendEvidence(ctx, f, e) {
  const entry = { at: now(), kind: e.kind, repo: e.repo || 'all', command: e.command || '', exit_code: e.exit_code ?? '', sha: e.sha || '', result: e.result, note: e.note || '', tail: e.tail || '' };
  const file = verificationFile(ctx, f);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, `# Verification evidence: ${f.id} ${f.title}\n\nAppend-only. Written by \`sdlc verify run\` / \`sdlc evidence add\`.\n\n`);
  let md = `### ${entry.at} · ${entry.kind} · ${entry.repo}\n`;
  if (entry.command) md += `- command: \`${entry.command}\`\n`;
  if (entry.exit_code !== '') md += `- exit_code: ${entry.exit_code}\n`;
  if (entry.sha) md += `- sha: ${entry.sha}\n`;
  md += `- result: ${entry.result}\n`;
  if (entry.note) md += `- note: ${entry.note.replace(/\r?\n/g, ' ')}\n`;
  if (entry.tail) md += `- output_tail:\n${FENCE}\n${entry.tail}\n${FENCE}\n`;
  fs.appendFileSync(file, md + '\n');
  fs.mkdirSync(path.dirname(mirrorFile(ctx, f.id)), { recursive: true });
  fs.appendFileSync(mirrorFile(ctx, f.id), JSON.stringify(entry) + '\n');
  return entry;
}

export function parseVerificationMd(text) {
  const entries = [];
  for (const block of text.split(/^### /m).slice(1)) {
    const [head, ...rest] = block.split(/\r?\n/);
    const [at, kind, repo] = head.split(' · ').map((s) => s.trim());
    const e = { at, kind, repo: repo || 'all', command: '', exit_code: '', sha: '', result: '', note: '', tail: '' };
    const body = rest.join('\n');
    const fence = body.match(/- output_tail:\n````\n([\s\S]*?)\n````/);
    if (fence) e.tail = fence[1];
    for (const line of rest) {
      const m = line.match(/^- (command|exit_code|sha|result|note): (.*)$/);
      if (!m) continue;
      e[m[1]] = m[1] === 'command' ? m[2].replace(/^`|`$/g, '') : m[2];
    }
    if (e.kind && e.result) entries.push(e);
  }
  return entries;
}

export function readEvidence(ctx, f) {
  const mirror = mirrorFile(ctx, f.id);
  if (fs.existsSync(mirror)) {
    return fs.readFileSync(mirror, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }
  const dir = specDirAbs(ctx, f);
  const file = dir && path.join(dir, 'verification.md');
  if (!file || !fs.existsSync(file)) return [];
  const entries = parseVerificationMd(fs.readFileSync(file, 'utf8'));
  fs.mkdirSync(path.dirname(mirror), { recursive: true });
  fs.writeFileSync(mirror, entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''));
  return entries;
}

export function runVerify(ctx, f, repo, kind) {
  const cmd = repo.commands?.[kind];
  if (!cmd) throw new UserError(`Repo "${repo.name}" has no ${kind} command. Set one: sdlc repo set ${repo.name} --${kind} "<cmd>" --confirm`);
  if (!repo.commands_confirmed) {
    throw new UserError(`Commands for repo "${repo.name}" are not confirmed. Run the command once to check it, then: sdlc repo set ${repo.name} --confirm`);
  }
  const cwd = repoDir(ctx, repo);
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', timeout: 30 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
  const code = r.status === null ? (r.error ? 'error' : 'signal') : r.status;
  const output = `${r.stdout || ''}${r.stderr || ''}${r.error ? `\n${r.error.message}` : ''}`;
  return appendEvidence(ctx, f, {
    kind, repo: repo.name, command: cmd, exit_code: code, sha: headSha(cwd) || 'none',
    result: code === 0 ? 'pass' : 'fail', tail: tail(output),
  });
}

/** Latest evidence entry for a repo among given kinds. */
export function latestEvidence(entries, repoName, kinds) {
  const list = entries.filter((e) => e.repo === repoName && kinds.includes(e.kind));
  return list[list.length - 1] || null;
}
