// Phase 4: token efficiency. Model policy by task complexity, session budget (Stop hook), lean PM guard.
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
const patchItem = (root, id, fields) => {
  const b = JSON.parse(fs.readFileSync(blPath(root), 'utf8'));
  Object.assign(b.features.find((f) => f.id === id), fields);
  fs.writeFileSync(blPath(root), JSON.stringify(b));
};
const vErrors = (root) => JSON.parse(cli(root, 'validate', '--json').out).errors;
const dec = (r) => r.json?.hookSpecificOutput?.permissionDecision ?? null;

function setup() {
  const fx = makeFixture();
  ok(cli(fx.root, 'init'));
  ok(cli(fx.root, 'repo', 'set', 'frontend', '--ui', 'false'));
  ok(cli(fx.root, 'repo', 'set', 'backend', '--ui', 'false'));
  fs.mkdirSync(path.join(fx.root, 'specs', '001-x'), { recursive: true });
  return fx;
}
const addF = (root, title, repos = 'backend') => ok(cli(root, 'feature', 'add', '--title', title, '--summary', `AC: ${title}`, '--value', 'v', '--repos', repos)).out.trim();
const tasks = (root, n, extra = '') => fs.writeFileSync(path.join(root, 'specs', '001-x', 'tasks.md'),
  Array.from({ length: n }, (_, i) => `- [ ] T${i + 1} [repo:backend] task ${i + 1}${extra}`).join('\n') + '\n');
const disp = (root, id, ...a) => j(root, 'dispatch', id, ...a);

// ---- model policy ----

test('P4-1. auto policy: lite single-repo items run on the lowest tier, full features on the middle one', () => {
  const fx = setup();
  const bug = ok(cli(fx.root, 'issue', 'add', 'Typo on the login error', '--kind', 'bug', '--repos', 'backend')).out.trim();
  patchItem(fx.root, bug, { stage: 'implementing', spec_dir: 'specs/001-x' });
  tasks(fx.root, 2);
  let d = disp(fx.root, bug);
  assert.equal(d.role, 'builder');
  assert.equal(d.complexity, 'low');
  assert.equal(d.model, 'haiku');
  assert.match(d.model_reason, /complexity low: lite lane \(bug\), 1 repo, 2 tasks/);
  assert.equal(disp(fx.root, bug, '--role', 'reviewer').model, 'haiku');
  assert.equal(disp(fx.root, bug, '--role', 'architect').model, 'sonnet');

  const feat = addF(fx.root, 'Profile page');
  patchItem(fx.root, feat, { stage: 'designed', spec_dir: 'specs/001-x' });
  d = disp(fx.root, feat);
  assert.equal(d.complexity, 'medium');
  assert.equal(d.role, 'architect');
  assert.equal(d.model, 'opus', 'architect keeps opus for medium work');
  assert.equal(disp(fx.root, feat, '--role', 'product').model, 'sonnet');
  assert.equal(disp(fx.root, feat, '--role', 'reviewer').model, 'sonnet');
  assert.equal(disp(fx.root, feat, '--role', 'builder').model, 'sonnet');
  assert.match(ok(cli(fx.root, 'dispatch', feat)).out, /model choice: complexity medium/);
  fx.cleanup();
});

test('P4-2. high complexity (repos, migration, size, risk, rework) earns the top tier; one rework round lifts low to medium', () => {
  const fx = setup();
  const multi = addF(fx.root, 'Cross-repo', 'backend,frontend');
  patchItem(fx.root, multi, { stage: 'verifying', spec_dir: 'specs/001-x' });
  bad(cli(fx.root, 'dispatch', multi, '--role', 'reviewer'), /--repo/);
  let d = disp(fx.root, multi, '--role', 'reviewer', '--repo', 'frontend');
  assert.equal(d.complexity, 'high');
  assert.equal(d.model, 'opus');
  assert.equal(d.repo, 'frontend');
  assert.match(d.prompt, /Review only/);
  assert.equal(disp(fx.root, multi, '--role', 'builder', '--repo', 'backend').model, 'sonnet', 'builder ceiling is sonnet');

  const one = addF(fx.root, 'Single');
  patchItem(fx.root, one, { stage: 'verifying', spec_dir: 'specs/001-x' });
  tasks(fx.root, 3, ' add migration for users');
  assert.match(disp(fx.root, one, '--role', 'reviewer').model_reason, /complexity high: migration/);
  tasks(fx.root, 12);
  assert.match(disp(fx.root, one, '--role', 'reviewer').model_reason, /12 tasks/);
  tasks(fx.root, 2);
  ok(cli(fx.root, 'feature', 'set', one, 'risk', 'high'));
  assert.equal(disp(fx.root, one, '--role', 'reviewer').model, 'opus');

  const bug = ok(cli(fx.root, 'issue', 'add', 'Small fix', '--kind', 'chore', '--repos', 'backend')).out.trim();
  patchItem(fx.root, bug, { stage: 'implementing', spec_dir: 'specs/001-x', rework: [{ n: 1, reason: 'x', started_at: 'now' }] });
  assert.equal(disp(fx.root, bug).complexity, 'medium');
  patchItem(fx.root, bug, { rework: [{ n: 1, reason: 'x', closed_at: 'now' }, { n: 2, reason: 'y' }] });
  assert.equal(disp(fx.root, bug).complexity, 'high');
  fx.cleanup();
});

test('P4-3. overrides: complexity by hand, ceilings, fixed policy, non-tier models; bad values refused', () => {
  const fx = setup();
  const id = addF(fx.root, 'Cross', 'backend,frontend');
  patchItem(fx.root, id, { stage: 'verifying', spec_dir: 'specs/001-x' });
  const rev = () => disp(fx.root, id, '--role', 'reviewer', '--repo', 'backend');
  ok(cli(fx.root, 'feature', 'set', id, 'complexity', 'low'));
  assert.equal(rev().model, 'haiku');
  assert.match(rev().model_reason, /set by hand/);
  ok(cli(fx.root, 'feature', 'set', id, 'complexity', 'auto'));
  assert.equal(rev().complexity, 'high');
  bad(cli(fx.root, 'feature', 'set', id, 'complexity', 'huge'), /complexity must be/);

  ok(cli(fx.root, 'team', 'set', 'reviewer', '--model', 'sonnet'));
  assert.equal(rev().model, 'sonnet', 'configured model is a ceiling');
  assert.match(rev().model_reason, /capped at sonnet/);
  ok(cli(fx.root, 'team', 'set', 'reviewer', '--model', 'inherit'));
  assert.equal(rev().model, 'inherit', 'non-tier models pass through');
  ok(cli(fx.root, 'team', 'set', 'reviewer', '--model', 'opus'));
  ok(cli(fx.root, 'feature', 'set', id, 'complexity', 'low'));
  ok(cli(fx.root, 'team', 'set', '--model-policy', 'fixed'));
  assert.equal(rev().model, 'opus', 'fixed policy uses the role model as is');
  assert.match(ok(cli(fx.root, 'team', 'show')).out, /model policy: fixed/);
  bad(cli(fx.root, 'team', 'set', '--model-policy', 'cheap'), /auto or fixed/);
  patchCfg(fx.root, (c) => { c.team.model_policy = 'cheap'; });
  assert.ok(vErrors(fx.root).some((e) => /model_policy/.test(e)));
  fx.cleanup();
});

// ---- session budget (Stop hook) ----

function transcript(dir, turns) {
  const file = path.join(dir, `t-${Math.random().toString(36).slice(2)}.jsonl`);
  fs.writeFileSync(file, turns.map(([tokens, side]) => JSON.stringify({
    type: 'assistant', isSidechain: !!side, message: { role: 'assistant', usage: { input_tokens: 10, cache_read_input_tokens: tokens - 10, cache_creation_input_tokens: 0, output_tokens: 5 } },
  })).join('\n') + '\n');
  return file;
}
const stop = (root, transcript_path, extra = {}) => hook('stop', root, { session_id: 's-1', transcript_path, ...extra });

test('P4-4. Stop hook: past the budget it blocks once with a checkpoint request, then again every repeat_every tokens', () => {
  const fx = setup();
  const id = addF(fx.root, 'Focus me');
  ok(cli(fx.root, 'focus', id));
  patchCfg(fx.root, (c) => { c.session = { context_budget: 150000, repeat_every: 100000 }; });
  assert.equal(stop(fx.root, transcript(fx.root, [[90000]])).json, null, 'under budget');
  const r = stop(fx.root, transcript(fx.root, [[160000], [500000, true]]));
  assert.equal(r.json.decision, 'block', 'a subagent turn (sidechain) never counts as the last main turn');
  assert.match(r.json.reason, /about 160k tokens \(budget 150k\)/);
  assert.match(r.json.reason, new RegExp(`specflow checkpoint ${id} --next`));
  assert.match(r.json.reason, /\/clear/);
  assert.equal(stop(fx.root, transcript(fx.root, [[170000]])).json, null, 'warned already for this level');
  assert.equal(stop(fx.root, transcript(fx.root, [[300000]]), { stop_hook_active: true }).json, null, 'never twice in a row');
  assert.equal(stop(fx.root, transcript(fx.root, [[270000]])).json.decision, 'block', '+100k: again');
  assert.equal(stop(fx.root, transcript(fx.root, [[200000]]), { session_id: 's-2' }).json.decision, 'block', 'per session');
  assert.equal(stop(fx.root, transcript(fx.root, [[60000]])).json, null, 'compacted: reset');
  assert.equal(stop(fx.root, transcript(fx.root, [[155000]])).json.decision, 'block', 'fires again after a reset');
  assert.equal(stop(fx.root, path.join(fx.root, 'missing.jsonl')).json, null, 'no transcript, no opinion');
  fx.cleanup();
});

test('P4-5. Stop hook: budget 0 turns it off, no focus gives a plain hand-over, bad config is reported by validate', () => {
  const fx = setup();
  const r = stop(fx.root, transcript(fx.root, [[200000]]));
  assert.doesNotMatch(r.json.reason, /specflow checkpoint/);
  assert.match(r.json.reason, /fresh session/);
  patchCfg(fx.root, (c) => { c.session.context_budget = 0; });
  assert.equal(stop(fx.root, transcript(fx.root, [[900000]]), { session_id: 's-9' }).json, null);
  patchCfg(fx.root, (c) => { c.session.context_budget = 'big'; });
  assert.ok(vErrors(fx.root).some((e) => /session.context_budget/.test(e)));
  fx.cleanup();
});

// ---- lean PM guard ----

test('P4-6. PM code edits: deny while implementing (configurable), allowed for subagents and when no builder exists', () => {
  const fx = setup();
  const id = addF(fx.root, 'Impl');
  patchItem(fx.root, id, { stage: 'implementing' });
  const file = path.join(fx.be, 'src', 'index.js');
  const edit = (extra = {}) => hook('pre-tool-use', fx.root, { tool_name: 'Write', tool_input: { file_path: file, content: 'x' }, ...extra });
  assert.equal(dec(edit()), 'deny');
  assert.equal(dec(edit({ agent_id: 'a-1', agent_type: 'specflow:builder' })), null);
  assert.equal(dec(hook('pre-tool-use', fx.root, { tool_name: 'Edit', tool_input: { file_path: path.join(fx.root, 'specs', '001-x', 'plan.md') } })), null, 'spec files stay PM-editable');
  patchCfg(fx.root, (c) => { c.guards.pm_source_edits = 'ask'; });
  assert.equal(dec(edit()), 'ask');
  patchCfg(fx.root, (c) => { c.guards.pm_source_edits = 'off'; });
  assert.equal(dec(edit()), null);
  patchCfg(fx.root, (c) => { c.guards.pm_source_edits = 'deny'; c.team.roles.builder.enabled = false; });
  assert.equal(dec(edit()), null, 'builder off and no lead: the PM builds (role pm fallback)');
  patchCfg(fx.root, (c) => { c.team.roles.builder.enabled = true; c.guards.pm_source_edits = 'sometimes'; });
  assert.ok(vErrors(fx.root).some((e) => /pm_source_edits/.test(e)));
  // Outside implementing the older guard still decides, unchanged.
  patchCfg(fx.root, (c) => { c.guards.pm_source_edits = 'deny'; });
  patchItem(fx.root, id, { stage: 'planned' });
  assert.equal(dec(edit()), 'ask');
  patchCfg(fx.root, (c) => { c.guards.source_edit_outside_implementing = 'off'; });
  assert.equal(dec(edit()), null);
  fx.cleanup();
});

// ---- migration ----

test('P4-7. migration 0.8.0 is additive and keeps user values', () => {
  const fx = setup();
  patchCfg(fx.root, (c) => {
    c.framework_version = '0.7.0';
    delete c.session; delete c.guards.pm_source_edits; delete c.team.model_policy;
    c.team.roles.reviewer.model = 'sonnet';
  });
  const V8 = { SPECFLOW_FAKE_FRAMEWORK_VERSION: '0.8.0' };
  const dry = JSON.parse(cliEnv(fx.root, V8, 'upgrade', '--json').out);
  assert.equal(dry.migrations.find((m) => m.to === '0.8.0').changes.length, 3);
  ok(cliEnv(fx.root, V8, 'upgrade', '--apply'));
  const c = readCfg(fx.root);
  assert.deepEqual(c.session, { context_budget: 150000, repeat_every: 100000 });
  assert.equal(c.guards.pm_source_edits, 'deny');
  assert.equal(c.team.model_policy, 'auto');
  assert.equal(c.team.roles.reviewer.model, 'sonnet');
  assert.equal(j(fx.root, 'validate').ok, true);
  assert.equal(JSON.parse(cliEnv(fx.root, V8, 'upgrade', '--apply', '--json').out).migrations.length, 0, 'idempotent');
  fx.cleanup();
});
