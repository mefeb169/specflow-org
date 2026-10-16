import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CLI, cliEnv, makeFixture, w } from './make-fixture.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A fake `claude` (a .mjs script) that logs its argv, one JSON line per call, plus its cwd. */
function fakeClaude({ failOn = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specflow-fake-'));
  const log = path.join(dir, 'calls.jsonl');
  const bin = path.join(dir, 'claude.mjs');
  fs.writeFileSync(bin, `import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
if (args[0] === '--version') { console.log('9.9.9 (fake)'); process.exit(0); }
if (args.join(' ') === 'plugin marketplace list') { console.log(process.env.FAKE_MARKETPLACES || 'Configured marketplaces:'); process.exit(0); }
if (${JSON.stringify(failOn)} && args.join(' ').includes(${JSON.stringify(failOn)})) { console.error('boom'); process.exit(3); }
console.log('ok');
`);
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse).filter((c) => c.args[0] !== '--version' && c.args.join(' ') !== 'plugin marketplace list') : []);
  return { bin, calls, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'specflow-proj-'));
const sameDir = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

test('BIN-1. package exposes specflow and sflow, both pointing at a real shebang file', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@mefeb169/specflow');
  assert.deepEqual(Object.keys(pkg.bin).sort(), ['sflow', 'specflow']);
  assert.equal(pkg.bin.specflow, pkg.bin.sflow);
  const entry = path.join(REPO, pkg.bin.specflow);
  assert.ok(fs.existsSync(entry));
  assert.ok(fs.readFileSync(entry, 'utf8').startsWith('#!/usr/bin/env node'));
  assert.equal(path.resolve(entry), path.resolve(CLI));
  const plugin = JSON.parse(fs.readFileSync(path.join(REPO, 'plugins', 'specflow', '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(plugin.name, 'specflow');
  assert.equal(plugin.version, pkg.version, 'package and plugin versions stay in sync');
  const market = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.equal(market.name, 'specflow-marketplace');
  assert.equal(market.plugins[0].name, 'specflow');
});

test('BIN-2. help and --version name specflow and the sflow alias', () => {
  const r = spawnSync(process.execPath, [CLI, 'help'], { encoding: 'utf8' });
  assert.match(r.stdout, /specflow <command>/);
  assert.match(r.stdout, /sflow/);
  const v = spawnSync(process.execPath, [CLI, '--version'], { encoding: 'utf8' });
  assert.match(v.stdout.trim(), /^specflow \d+\.\d+\.\d+$/);
});

test('INS-1. install defaults to project scope and this repo as the marketplace source', () => {
  const claude = fakeClaude();
  const dir = tmpDir();
  const r = cliEnv(dir, { SPECFLOW_CLAUDE_BIN: claude.bin }, 'install', '--json');
  assert.equal(r.code, 0, r.err);
  const calls = claude.calls();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].args.slice(0, 3), ['plugin', 'marketplace', 'add']);
  assert.ok(sameDir(calls[0].args[3], REPO), `source was ${calls[0].args[3]}`);
  assert.deepEqual(calls[0].args.slice(4), ['--scope', 'project']);
  assert.deepEqual(calls[1].args, ['plugin', 'install', 'specflow@specflow-marketplace', '--scope', 'project']);
  assert.ok(sameDir(calls[1].cwd, dir), 'runs in --dir (default: cwd)');
  assert.match(JSON.parse(r.out).next, /set up specflow here/);
  claude.cleanup();
});

test('INS-2. --scope, --dir and --source are honored (owner/repo passes through untouched)', () => {
  const claude = fakeClaude();
  const where = tmpDir();
  const other = tmpDir();
  const r = cliEnv(other, { SPECFLOW_CLAUDE_BIN: claude.bin }, 'install', '--scope', 'user', '--dir', where, '--source', 'mefeb169/specflow');
  assert.equal(r.code, 0, r.err);
  const calls = claude.calls();
  assert.deepEqual(calls[0].args, ['plugin', 'marketplace', 'add', 'mefeb169/specflow', '--scope', 'user']);
  assert.ok(sameDir(calls[0].cwd, where));
  assert.equal(cliEnv(other, { SPECFLOW_CLAUDE_BIN: claude.bin }, 'install', '--scope', 'galaxy').code, 1);
  claude.cleanup();
});

test('INS-3. a failing step stops the run and prints the remaining manual commands', () => {
  const claude = fakeClaude({ failOn: 'marketplace add' });
  const r = cliEnv(tmpDir(), { SPECFLOW_CLAUDE_BIN: claude.bin }, 'install');
  assert.equal(r.code, 1);
  assert.match(r.err, /Failed: claude plugin marketplace add/);
  assert.match(r.err, /claude plugin install specflow@specflow-marketplace --scope project/);
  assert.equal(claude.calls().length, 1, 'install step was not attempted');
  claude.cleanup();
});

test('INS-4. a missing claude CLI gives a clear error', () => {
  const r = cliEnv(tmpDir(), { SPECFLOW_CLAUDE_BIN: path.join(os.tmpdir(), 'no-such-claude.mjs') }, 'install');
  assert.equal(r.code, 1);
  assert.match(r.err, /`claude` CLI was not found or did not run/);
});

test('INS-5. uninstall mirrors install; legacy specflow-org settings are reported, never edited', () => {
  const claude = fakeClaude();
  const dir = tmpDir();
  const settings = JSON.stringify({
    extraKnownMarketplaces: { 'specflow-org-marketplace': { source: { source: 'directory', path: 'X' } } },
    enabledPlugins: { 'specflow-org@specflow-org-marketplace': true },
  }, null, 2);
  w(path.join(dir, '.claude', 'settings.json'), settings);
  const r = cliEnv(dir, { SPECFLOW_CLAUDE_BIN: claude.bin }, 'uninstall', '--remove-marketplace', '--json');
  assert.equal(r.code, 0, r.err);
  const calls = claude.calls();
  assert.deepEqual(calls[0].args, ['plugin', 'uninstall', 'specflow@specflow-marketplace', '--scope', 'project']);
  assert.deepEqual(calls[1].args, ['plugin', 'marketplace', 'remove', 'specflow-marketplace', '--scope', 'project']);
  const out = JSON.parse(r.out);
  assert.equal(out.legacy_cleanup.length, 2);
  assert.match(out.legacy_cleanup[0], /plugin uninstall specflow-org@specflow-org-marketplace --scope project/);
  assert.equal(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'), settings, 'settings untouched');
  claude.cleanup();
});

test('INS-6. install works with no workspace (no .specflow/ needed)', () => {
  const claude = fakeClaude();
  const dir = tmpDir();
  assert.equal(cliEnv(dir, { SPECFLOW_CLAUDE_BIN: claude.bin }, 'install').code, 0, 'no .specflow/ needed');
  claude.cleanup();
});

const legacyList = (folder) => `Configured marketplaces:

  ❯ specflow-org-marketplace
    Source: Folder (${folder})
`;

test('INS-7. a stale specflow-org marketplace on the same folder blocks install unless --fix-legacy', () => {
  const claude = fakeClaude();
  const env = { SPECFLOW_CLAUDE_BIN: claude.bin, FAKE_MARKETPLACES: legacyList(REPO) };
  const blocked = cliEnv(tmpDir(), env, 'install');
  assert.equal(blocked.code, 1);
  assert.match(blocked.err, /would shadow the new "specflow-marketplace"/);
  assert.match(blocked.err, /claude plugin marketplace remove specflow-org-marketplace/);
  assert.equal(claude.calls().length, 0, 'nothing was changed');

  const fixed = cliEnv(tmpDir(), env, 'install', '--fix-legacy');
  assert.equal(fixed.code, 0, fixed.err);
  const calls = claude.calls().map((c) => c.args.join(' '));
  assert.equal(calls.length, 3);
  assert.equal(calls[0], 'plugin marketplace remove specflow-org-marketplace');
  assert.match(calls[1], /^plugin marketplace add /);
  assert.equal(calls[2], 'plugin install specflow@specflow-marketplace --scope project');
  claude.cleanup();
});

test('INS-8. a legacy marketplace pointing elsewhere does not block install', () => {
  const claude = fakeClaude();
  const env = { SPECFLOW_CLAUDE_BIN: claude.bin, FAKE_MARKETPLACES: legacyList(path.join(os.tmpdir(), 'some-other-folder')) };
  const r = cliEnv(tmpDir(), env, 'install');
  assert.equal(r.code, 0, r.err);
  assert.equal(claude.calls().length, 2);
  claude.cleanup();
});
