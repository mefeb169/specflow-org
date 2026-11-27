// 0.9.0: smaller runs. Builder task batches, rework packets, a lower session budget (migration).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeFixture, cli, cliEnv } from './make-fixture.mjs';

const ok = (r) => { assert.equal(r.code, 0, r.err || r.out); return r; };
const bad = (r, re) => { assert.notEqual(r.code, 0, r.out); if (re) assert.match(r.err, re); return r; };
const j = (root, ...a) => JSON.parse(ok(cli(root, ...a, '--json')).out);
const cfgPath = (root) => path.join(root, '.specflow', 'config.json');
const readCfg = (root) => JSON.parse(fs.readFileSync(cfgPath(root), 'utf8'));
const patchCfg = (root, fn) => { const c = readCfg(root); fn(c); fs.writeFileSync(cfgPath(root), JSON.stringify(c, null, 2)); };
const blPath = (root) => path.join(root, '.specflow', 'backlog.json');
const patchItem = (root, id, fields) => {
  const b = JSON.parse(fs.readFileSync(blPath(root), 'utf8'));
  Object.assign(b.features.find((f) => f.id === id), fields);
  fs.writeFileSync(blPath(root), JSON.stringify(b));
};

function setup(lines) {
  const fx = makeFixture();
  ok(cli(fx.root, 'init'));
  ok(cli(fx.root, 'repo', 'set', 'frontend', '--ui', 'false'));
  ok(cli(fx.root, 'repo', 'set', 'backend', '--ui', 'false'));
  fs.mkdirSync(path.join(fx.root, 'specs', '001-x'), { recursive: true });
  fs.writeFileSync(path.join(fx.root, 'specs', '001-x', 'tasks.md'), lines.join('\n') + '\n');
  const id = ok(cli(fx.root, 'feature', 'add', '--title', 'Batch me', '--summary', 'AC', '--value', 'v', '--repos', 'backend,frontend')).out.trim();
  patchItem(fx.root, id, { stage: 'implementing', spec_dir: 'specs/001-x' });
  return { fx, id };
}

const TASKS = [
  '- [X] T001 [repo:backend] done already',
  ...Array.from({ length: 7 }, (_, i) => `- [ ] T0${String(i + 2).padStart(2, '0')} [P] [repo:backend] backend task ${i + 2}`),
  '- [ ] T020 [repo:frontend] frontend task',
  '- [ ] [repo:frontend] untitled frontend task',
];

test('P5-1. dispatch gives a builder only the next batch of open tasks of its repo', () => {
  const { fx, id } = setup(TASKS);
  const d = j(fx.root, 'dispatch', id, '--repo', 'backend');
  assert.equal(d.role, 'builder');
  assert.deepEqual(d.tasks, ['T002', 'T003', 'T004', 'T005', 'T006']);
  assert.equal(d.tasks_left, 7);
  assert.match(d.prompt, /Tasks this run: T002, T003, T004, T005, T006 only \(5 of 7 open in backend\)/);
  assert.match(d.prompt, /fresh builder for the rest/);
  assert.match(d.prompt, /Follow the subagent contract in your agent definition\.$/);

  // tasks without a T-id are referred to by position; the last batch says so
  const fe = j(fx.root, 'dispatch', id, '--repo', 'frontend');
  assert.deepEqual(fe.tasks, ['T020', '#10']);
  assert.match(fe.prompt, /Tasks this run: the last 2 open task\(s\) of frontend \(T020, #10\)/);

  // batch 0 = the whole repo in one run
  ok(cli(fx.root, 'team', 'set', '--builder-batch', '0'));
  const all = j(fx.root, 'dispatch', id, '--repo', 'backend');
  assert.equal(all.tasks.length, 7);
  assert.match(all.prompt, /the last 7 open task\(s\) of backend/);
  assert.match(ok(cli(fx.root, 'team')).out, /builder batch: off/);
  fx.cleanup();
});

test('P5-2. non-builder roles carry no batch; a rework round gets a findings line', () => {
  const { fx, id } = setup(TASKS);
  assert.equal(j(fx.root, 'dispatch', id, '--role', 'reviewer', '--repo', 'backend').tasks, null);
  patchItem(fx.root, id, { rework: [{ n: 1, reason: 'Login 500 on empty password; missing unit test', started_at: '2026-11-20T00:00:00Z', closed_at: null }] });
  const d = j(fx.root, 'dispatch', id, '--repo', 'backend');
  assert.match(d.prompt, /Rework: fix only the findings for backend in verification\.md \(round 1: Login 500 on empty password; missing unit test\)/);
  fx.cleanup();
});

test('P5-3. team set --builder-batch validates; validate rejects a bad value', () => {
  const { fx } = setup(TASKS);
  assert.equal(j(fx.root, 'team').builder_batch, 5);
  ok(cli(fx.root, 'team', 'set', '--builder-batch', '3'));
  assert.equal(readCfg(fx.root).team.builder_batch, 3);
  bad(cli(fx.root, 'team', 'set', '--builder-batch', '-1'), /whole number/);
  bad(cli(fx.root, 'team', 'set', '--builder-batch', 'many'), /whole number/);
  patchCfg(fx.root, (c) => { c.team.builder_batch = 2.5; });
  assert.ok(JSON.parse(cli(fx.root, 'validate', '--json').out).errors.some((e) => /team.builder_batch/.test(e)));
  fx.cleanup();
});

test('P5-4. new workspaces get the 100k budget; migration 0.9.0 lowers only the untouched 0.8.0 default', () => {
  const fx = makeFixture();
  ok(cli(fx.root, 'init'));
  assert.deepEqual(readCfg(fx.root).session, { context_budget: 100000, repeat_every: 50000, clear_at: 'budget', soft_budget: 80000 });
  assert.equal(readCfg(fx.root).team.builder_batch, 5);

  const V9 = { SPECFLOW_FAKE_FRAMEWORK_VERSION: '0.9.0' };
  patchCfg(fx.root, (c) => { c.framework_version = '0.8.0'; c.session = { context_budget: 150000, repeat_every: 100000 }; delete c.team.builder_batch; });
  const dry = JSON.parse(cliEnv(fx.root, V9, 'upgrade', '--json').out);
  assert.equal(dry.migrations.find((m) => m.to === '0.9.0').changes.length, 3);
  ok(cliEnv(fx.root, V9, 'upgrade', '--apply'));
  assert.deepEqual(readCfg(fx.root).session, { context_budget: 100000, repeat_every: 50000 });
  assert.equal(readCfg(fx.root).team.builder_batch, 5);
  assert.equal(JSON.parse(cliEnv(fx.root, V9, 'upgrade', '--apply', '--json').out).migrations.length, 0, 'idempotent');

  // a value the user chose stays
  patchCfg(fx.root, (c) => { c.framework_version = '0.8.0'; c.session = { context_budget: 200000, repeat_every: 100000 }; c.team.builder_batch = 0; });
  ok(cliEnv(fx.root, V9, 'upgrade', '--apply'));
  assert.deepEqual(readCfg(fx.root).session, { context_budget: 200000, repeat_every: 50000 });
  assert.equal(readCfg(fx.root).team.builder_batch, 0);
  assert.equal(j(fx.root, 'validate').ok, true);
  fx.cleanup();
});
