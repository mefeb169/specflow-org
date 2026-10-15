import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const CLI = path.resolve(import.meta.dirname, '..', 'plugins', 'specflow-org', 'scripts', 'sdlc.mjs');
export const HOOKS = path.resolve(import.meta.dirname, '..', 'plugins', 'specflow-org', 'scripts', 'hooks');

export function sh(cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

export function gitInit(dir) {
  sh(dir, 'git', ['init', '-q']);
  sh(dir, 'git', ['config', 'user.email', 't@example.com']);
  sh(dir, 'git', ['config', 'user.name', 'Test']);
  sh(dir, 'git', ['config', 'commit.gpgsign', 'false']);
  sh(dir, 'git', ['add', '-A']);
  sh(dir, 'git', ['commit', '-q', '-m', 'init']);
}

const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };

/** Builds a temp workspace: root CLAUDE.md + backend/ and frontend/ git repos. */
export function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-fx-'));
  write(path.join(root, 'CLAUDE.md'), '# My product\n\nUser content that must survive.\n');
  const be = path.join(root, 'backend');
  write(path.join(be, 'package.json'), JSON.stringify({ name: 'be', scripts: { test: 'node -e "process.exit(0)"' }, dependencies: { express: '4' } }));
  write(path.join(be, 'CLAUDE.md'), '# backend rules\n');
  write(path.join(be, 'openapi.yaml'), 'openapi: 3.0.0\n');
  write(path.join(be, 'migrations', '001.sql'), 'create table t(id int);\n');
  write(path.join(be, 'src', 'index.js'), 'console.log(1)\n');
  gitInit(be);
  const fe = path.join(root, 'frontend');
  write(path.join(fe, 'package.json'), JSON.stringify({ name: 'fe', scripts: { test: 'node -e "process.exit(0)"' }, dependencies: { react: '18' } }));
  write(path.join(fe, 'AGENTS.md'), '# frontend agent rules\n');
  write(path.join(fe, 'src', 'app.js'), 'console.log(2)\n');
  gitInit(fe);
  return { root, be, fe, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

export function cli(root, ...args) {
  return cliEnv(root, {}, ...args);
}

export function cliEnv(root, env, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, SDLC_SKIP_TOOL_PROBE: '1', ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

export function hook(name, cwd, input, env = {}) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, `${name}.mjs`)], { cwd, input: JSON.stringify({ cwd, ...input }), encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr, json: r.stdout.trim() ? JSON.parse(r.stdout) : null };
}

export const w = write;

export const UX_MD = '# UX\nMode: conform\n\n## Flows\nreset flow\n\n## Screens and states\nform\n\n## Copy\nSend reset link\n\n## Accessibility\nkeyboard ok\n';
