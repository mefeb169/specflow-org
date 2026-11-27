// 0.10.0: clear points (opt-in boundary clearing, Resume with line), task cards, model per task.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeFixture, cli, cliEnv, hook } from './make-fixture.mjs';

const ok = (r) => { assert.equal(r.code, 0, r.err || r.out); return r; };
const bad = (r, re) => { assert.notEqual(r.code, 0, r.out); if (re) assert.match(r.err, re); return r; };
const j = (root, ...a) => JSON.parse(ok(cli(root, ...a, '--json')).out);
const cfgPath = (root) => path.join(root, '.specflow', 'config.json');
const readCfg = (root) => JSON.parse(fs.readFileSync(cfgPath(root), 'utf8'));
const patchCfg = (root, fn) => { const c = readCfg(root); fn(c); fs.writeFileSync(cfgPath(root), JSON.stringify(c, null, 2)); };
const blPath = (root) => path.join(root, '.specflow', 'backlog.json');
const patchItem = (root, id, fn) => {
  const b = JSON.parse(fs.readFileSync(blPath(root), 'utf8'));
  const f = b.features.find((x) => x.id === id);
  if (typeof fn === 'function') fn(f); else Object.assign(f, fn);
  fs.writeFileSync(blPath(root), JSON.stringify(b));
};
const later = (ms = 0) => new Date(Date.now() + ms).toISOString();

function setup(tasksLines, specText) {
  const fx = makeFixture();
  ok(cli(fx.root, 'init'));
  ok(cli(fx.root, 'repo', 'set', 'frontend', '--ui', 'false'));
  ok(cli(fx.root, 'repo', 'set', 'backend', '--ui', 'false'));
  fs.mkdirSync(path.join(fx.root, 'specs', '001-x'), { recursive: true });
  if (tasksLines) fs.writeFileSync(path.join(fx.root, 'specs', '001-x', 'tasks.md'), tasksLines.join('\n') + '\n');
  if (specText) fs.writeFileSync(path.join(fx.root, 'specs', '001-x', 'spec.md'), specText);
  const id = ok(cli(fx.root, 'feature', 'add', '--title', 'Cards', '--summary', 'AC', '--value', 'v', '--repos', 'backend,frontend')).out.trim();
  patchItem(fx.root, id, { stage: 'implementing', spec_dir: 'specs/001-x' });
  return { fx, id };
}

// ---- clear points ----

function transcript(dir, tokens) {
  const file = path.join(dir, `t-${Math.random().toString(36).slice(2)}.jsonl`);
  fs.writeFileSync(file, JSON.stringify({ type: 'assistant', message: { role: 'assistant', usage: { input_tokens: 10, cache_read_input_tokens: tokens - 10, cache_creation_input_tokens: 0, output_tokens: 5 } } }) + '\n');
  return file;
}
const stop = (root, tokens, extra = {}) => hook('stop', root, { session_id: 's-1', transcript_path: transcript(root, tokens), ...extra });
const boundaryEvent = (root, id, detail = 'implementing -> verifying', event = 'stage') =>
  patchItem(root, id, (f) => { f.history.push({ at: later(), event, detail }); });

test('P6-1. defaults: clear_at budget (opt-in boundary), soft budget 80k; validate rejects bad values', () => {
  const { fx } = setup();
  assert.deepEqual(readCfg(fx.root).session, { context_budget: 100000, repeat_every: 50000, clear_at: 'budget', soft_budget: 80000 });
  patchCfg(fx.root, (c) => { c.session.clear_at = 'always'; c.session.soft_budget = -5; });
  const errs = JSON.parse(cli(fx.root, 'validate', '--json').out).errors;
  assert.ok(errs.some((e) => /session.clear_at/.test(e)));
  assert.ok(errs.some((e) => /session.soft_budget/.test(e)));
  fx.cleanup();
});

test('P6-2. boundary clearing is off by default', () => {
  const { fx, id } = setup();
  hook('session-start', fx.root, { session_id: 's-1' });
  boundaryEvent(fx.root, id);
  assert.equal(stop(fx.root, 90000).json, null);
  fx.cleanup();
});

test('P6-3. boundary: fires once per boundary past the soft budget, naming the latest event', () => {
  const { fx, id } = setup();
  patchCfg(fx.root, (c) => { c.session.clear_at = 'boundary'; });
  hook('session-start', fx.root, { session_id: 's-1' });
  assert.equal(stop(fx.root, 90000).json, null, 'nothing finished yet');
  boundaryEvent(fx.root, id);
  assert.equal(stop(fx.root, 70000).json, null, 'below the soft budget');
  assert.equal(stop(fx.root, 90000, { stop_hook_active: true }).json, null, 'never twice in a row');
  const r = stop(fx.root, 90000);
  assert.equal(r.json.decision, 'block');
  assert.match(r.json.reason, new RegExp(`${id} moved to verifying`));
  assert.match(r.json.reason, new RegExp(`specflow checkpoint ${id}`));
  assert.match(r.json.reason, /safe to \/clear/);
  assert.equal(stop(fx.root, 95000).json, null, 'once per boundary');
  boundaryEvent(fx.root, id, 'implement approved', 'gate');
  assert.match(stop(fx.root, 95000).json.reason, /implement approved/, 'a new boundary fires again');
  fx.cleanup();
});

test('P6-4. boundary: events before the session started do not count; the hard budget wins', () => {
  const { fx, id } = setup();
  patchCfg(fx.root, (c) => { c.session.clear_at = 'boundary'; });
  patchItem(fx.root, id, (f) => { f.history.push({ at: '2020-01-01T00:00:00.000Z', event: 'gate', detail: 'spec approved' }); });
  hook('session-start', fx.root, { session_id: 's-1' });
  assert.equal(stop(fx.root, 90000).json, null, 'old event');
  patchItem(fx.root, id, (f) => { f.history.push({ at: later(), event: 'gate', detail: 'implement approved' }); });
  const r = stop(fx.root, 120000);
  assert.equal(r.json.decision, 'block');
  assert.match(r.json.reason, /session budget/, 'the hard budget message wins above 100k');
  fx.cleanup();
});

test('P6-5. boundary: the first Stop starts the count when there is no start marker; soft_budget 0 turns it off', () => {
  const { fx, id } = setup();
  patchCfg(fx.root, (c) => { c.session.clear_at = 'boundary'; });
  assert.equal(stop(fx.root, 90000).json, null, 'first stop only starts counting');
  boundaryEvent(fx.root, id);
  assert.equal(stop(fx.root, 90000).json.decision, 'block');
  patchCfg(fx.root, (c) => { c.session.soft_budget = 0; });
  boundaryEvent(fx.root, id, 'accepted -> released');
  assert.equal(stop(fx.root, 99000, { session_id: 's-2' }).json, null);
  fx.cleanup();
});

test('P6-6. handoff has a Resume with line for each situation', () => {
  const { fx, id } = setup(['- [ ] T001 [repo:backend] a', '- [ ] T002 [repo:frontend] b']);
  const resume = (i) => {
    ok(cli(fx.root, 'checkpoint', i));
    const t = fs.readFileSync(path.join(fx.root, 'specs', '001-x', 'handoff.md'), 'utf8');
    return t.match(/^Resume with: (.*)$/m)[1];
  };
  assert.equal(resume(id), `specflow dispatch ${id} --repo backend --json`, 'multi-repo builder: first repo to do');
  patchCfg(fx.root, (c) => { c.autonomy = 'guided'; });
  patchItem(fx.root, id, { stage: 'specified' });
  assert.match(resume(id), /^present the spec gate to the user/);
  patchItem(fx.root, id, (f) => { f.stage = 'designed'; f.gates = { spec: 'x' }; });
  assert.match(resume(id), /^present the design gate/);
  patchItem(fx.root, id, (f) => { f.stage = 'proposed'; f.gates = {}; });
  assert.equal(resume(id), `specflow dispatch ${id} --json`);
  patchItem(fx.root, id, (f) => { f.stage = 'done'; });
  assert.equal(resume(id), 'specflow next');
  fx.cleanup();
});
