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

// ---- task cards ----

const cardOf = (root, d) => fs.readFileSync(path.join(root, d.card), 'utf8');

test('P6-7. card: user-story sections and AC lines are extracted for the three heading styles', () => {
  const spec = [
    '# Spec', '## Scope', 'scope text', '',
    '### US1 (P1) Export schema', '- the user exports', '- it is read-only', '',
    '### US2 (P1) Unrelated', '- not for this batch', '',
    '## 1. F-177 add-student parentId', '- AC1.1: `CreateStudentDto` has required parentId.', '  continued line of AC1.1', '- AC1.10: a different criterion', '- AC1.2: other', '',
    '### User Story 3 - Spec Kit style', 'FR-001 System MUST validate input.', 'FR-002 System MUST log.', '', '## Other', 'FR-009 unrelated requirement', '',
  ].join('\n');
  const { fx, id } = setup([
    '- [ ] T001 [US1] [repo:backend] one',
    '- [ ] T002 [repo:backend] two (AC1.1)',
    '- [ ] T003 [US3] [repo:backend] three FR-001',
  ], spec);
  const d = j(fx.root, 'dispatch', id, '--repo', 'backend');
  const c = cardOf(fx.root, d);
  assert.match(c, /### US1 \(P1\) Export schema/);
  assert.match(c, /it is read-only/);
  assert.doesNotMatch(c, /not for this batch/);
  assert.match(c, /AC1\.1: `CreateStudentDto`/);
  assert.match(c, /continued line of AC1\.1/);
  assert.doesNotMatch(c, /AC1\.10/, 'AC1.1 does not match AC1.10');
  assert.match(c, /### User Story 3 - Spec Kit style/, 'US3 matches "User Story 3"');
  assert.match(c, /FR-001 System MUST validate/);
  assert.match(c, /FR-002/, 'the whole story section comes with it');
  assert.doesNotMatch(c, /FR-009/);
  fx.cleanup();
});

test('P6-8. card: fallback line when no ids are referenced; header, branch and tasks', () => {
  const { fx, id } = setup(['- [ ] T001 [repo:backend] plain task', '- [ ] T002 [repo:frontend] other repo'], '# S\n## Acceptance criteria\n- x\n');
  const d = j(fx.root, 'dispatch', id, '--repo', 'backend');
  const c = cardOf(fx.root, d);
  assert.match(c, /No acceptance ids referenced: read spec\.md "Acceptance criteria"/);
  assert.match(c, /^# Task card: F-001 Cards .* \/ repo backend/m);
  assert.match(c, /Batch: T001 \(1 of 1 open in backend, the last batch\)/);
  assert.match(c, /- \[ \] T001 \[repo:backend\] plain task/);
  assert.doesNotMatch(c, /T002/);
  assert.match(c, /Test command: not confirmed/);
  assert.equal(d.card, '.specflow/cache/cards/F-001-backend.md');
  fx.cleanup();
});

test('P6-9. card: Repository Impact row of this repo only; rewritten per dispatch', () => {
  const plan = ['# Plan', '## Repository Impact', '| Repo | Change | Contracts | Migration | Order |', '|---|---|---|---|---|', '| backend | adds endpoint | api.yaml | N | 1 |', '| frontend | adds form | api.yaml | N | 2 |', '', '## Other', 'x'].join('\n');
  const { fx, id } = setup(['- [ ] T001 [repo:backend] a', '- [ ] T002 [repo:frontend] b'], '# S\n');
  fs.writeFileSync(path.join(fx.root, 'specs', '001-x', 'plan.md'), plan);
  let c = cardOf(fx.root, j(fx.root, 'dispatch', id, '--repo', 'backend'));
  assert.match(c, /\| backend \| adds endpoint/);
  assert.doesNotMatch(c, /\| frontend \|/);
  assert.match(c, /\| Repo \| Change/);
  c = cardOf(fx.root, j(fx.root, 'dispatch', id, '--repo', 'frontend'));
  assert.match(c, /\| frontend \| adds form/);
  assert.doesNotMatch(c, /\| backend \|/);
  // marking T001 done changes the next backend card
  fs.writeFileSync(path.join(fx.root, 'specs', '001-x', 'tasks.md'), '- [X] T001 [repo:backend] a\n- [ ] T003 [repo:backend] c\n- [ ] T002 [repo:frontend] b\n');
  c = cardOf(fx.root, j(fx.root, 'dispatch', id, '--repo', 'backend'));
  assert.match(c, /T003/);
  assert.doesNotMatch(c, /T001/);
  fx.cleanup();
});

test('P6-10. card: acceptance is capped (lines, bytes) and the prompt stays under 1,200 characters', () => {
  const spec = ['# S', '### US1 (P1) Big', ...Array.from({ length: 200 }, (_, i) => `- criterion ${i} ${'x'.repeat(60)}`)].join('\n');
  const { fx, id } = setup(Array.from({ length: 9 }, (_, i) => `- [ ] T00${i + 1} [US1] [repo:backend] task ${i + 1} in src/some/long/path/file${i}.ts ${'y'.repeat(120)}`), spec);
  const d = j(fx.root, 'dispatch', id, '--repo', 'backend');
  const c = cardOf(fx.root, d);
  assert.ok(Buffer.byteLength(c) <= 8 * 1024, `card is ${Buffer.byteLength(c)} bytes`);
  assert.ok(c.split('\n').length <= 121);
  assert.match(c, /\(truncated: see spec\.md\)/);
  assert.match(c, /Batch: T001\.\.T005 \(5 of 9 open in backend\)/);
  assert.ok(d.prompt.length <= 1200, `prompt is ${d.prompt.length}`);
  assert.match(d.prompt, /Card: \.specflow\/cache\/cards\/F-001-backend\.md/);
  assert.match(d.prompt, /Follow the subagent contract in your agent definition\.$/);
  fx.cleanup();
});

test('P6-11. card: non-builder roles get none', () => {
  const { fx, id } = setup(['- [ ] T001 [repo:backend] a']);
  const d = j(fx.root, 'dispatch', id, '--role', 'reviewer', '--repo', 'backend');
  assert.equal(d.card ?? null, null);
  assert.doesNotMatch(d.prompt, /Card:/);
  fx.cleanup();
});

// ---- model per task ----

const mt = (n, tag, repo = 'backend') => `- [ ] T0${String(n).padStart(2, '0')} [repo:${repo}] task ${n}${tag ? ` [model:${tag}]` : ''}`;

test('P6-12. model tags: parsed, unknown values are a check error', () => {
  const { fx, id } = setup([mt(1, 'haiku'), mt(2, 'Sonnet'), mt(3, 'gpt')]);
  const r = cli(fx.root, 'check', 'tasks', id);
  assert.notEqual(r.code, 0);
  assert.match(r.out + r.err, /unknown model tag "gpt"/);
  assert.doesNotMatch(r.out + r.err, /unknown model tag "sonnet"/, 'case-insensitive');
  fx.cleanup();
});

test('P6-13. a batch ends at the first model change; the tag picks the model, capped at the ceiling', () => {
  const { fx, id } = setup([mt(1, 'haiku'), mt(2, 'haiku'), mt(3, null), mt(4, null), mt(5, 'opus')]);
  let d = j(fx.root, 'dispatch', id, '--repo', 'backend');
  assert.deepEqual(d.tasks, ['T001', 'T002']);
  assert.equal(d.model, 'haiku');
  assert.match(d.model_reason, /task tag haiku/);
  assert.match(d.prompt, /T001, T002 only \(2 of 5 open/);
  // untagged tasks follow the item (full feature, 2 repos => high => sonnet builder)
  fs.writeFileSync(path.join(fx.root, 'specs', '001-x', 'tasks.md'), [mt(3, null), mt(4, null), mt(5, 'opus')].join('\n') + '\n');
  d = j(fx.root, 'dispatch', id, '--repo', 'backend');
  assert.deepEqual(d.tasks, ['T003', 'T004']);
  assert.doesNotMatch(d.model_reason, /task tag/);
  // an opus tag is capped at the builder's sonnet ceiling
  fs.writeFileSync(path.join(fx.root, 'specs', '001-x', 'tasks.md'), mt(5, 'opus') + '\n');
  d = j(fx.root, 'dispatch', id, '--repo', 'backend');
  assert.equal(d.model, 'sonnet');
  assert.match(d.model_reason, /task tag opus \(capped at sonnet\)/);
  fx.cleanup();
});

test('P6-14. model_policy fixed and team.task_models false ignore the tags', () => {
  const { fx, id } = setup([mt(1, 'haiku'), mt(2, null), mt(3, 'haiku')]);
  ok(cli(fx.root, 'team', 'set', '--task-models', 'false'));
  assert.equal(readCfg(fx.root).team.task_models, false);
  let d = j(fx.root, 'dispatch', id, '--repo', 'backend');
  assert.deepEqual(d.tasks, ['T001', 'T002', 'T003'], 'no split');
  assert.doesNotMatch(d.model_reason, /task tag/);
  ok(cli(fx.root, 'team', 'set', '--task-models', 'true', '--model-policy', 'fixed'));
  d = j(fx.root, 'dispatch', id, '--repo', 'backend');
  assert.equal(d.model, 'sonnet');
  assert.match(d.model_reason, /fixed/);
  bad(cli(fx.root, 'team', 'set', '--task-models', 'maybe'), /true or false/);
  patchCfg(fx.root, (c) => { c.team.task_models = 'yes'; });
  assert.ok(JSON.parse(cli(fx.root, 'validate', '--json').out).errors.some((e) => /team.task_models/.test(e)));
  fx.cleanup();
});
