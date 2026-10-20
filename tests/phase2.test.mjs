import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeFixture, cli, cliEnv, hook, w } from './make-fixture.mjs';

const j = (root, ...a) => JSON.parse(cli(root, ...a, '--json').out);
const cf = (root) => path.join(root, '.specflow', 'config.json');
const readCfg = (root) => JSON.parse(fs.readFileSync(cf(root), 'utf8'));
const writeCfg = (root, c) => fs.writeFileSync(cf(root), JSON.stringify(c, null, 2) + '\n');
const ok = (r) => { assert.equal(r.code, 0, r.err || r.out); return r; };
const bad = (r, re) => { assert.notEqual(r.code, 0, r.out); if (re) assert.match(r.err, re); return r; };
const dec = (r) => r.json?.hookSpecificOutput?.permissionDecision ?? null;

function setup() {
  const fx = makeFixture();
  ok(cli(fx.root, 'init'));
  return fx;
}
const roleOf = (team, r) => team.roles.find((x) => x.role === r);

test('P2-1. team defaults: models, ux derived from repos, lead off', () => {
  const fx = setup();
  const t = j(fx.root, 'team', 'show');
  assert.equal(roleOf(t, 'builder').model, 'sonnet');
  assert.equal(roleOf(t, 'architect').model, 'opus');
  assert.equal(roleOf(t, 'profiler').model, 'haiku');
  assert.equal(roleOf(t, 'lead').enabled, false);
  assert.equal(roleOf(t, 'architect').agent, 'specflow:architect');
  assert.equal(roleOf(t, 'reviewer').agent, 'specflow:independent-reviewer');
  assert.equal(roleOf(t, 'ux').enabled, true, 'fixture frontend is a react (UI) repo');
  assert.equal(t.communication, 'short');
  assert.equal(t.workflow, 'feature');
  ok(cli(fx.root, 'repo', 'set', 'frontend', '--ui', 'false'));
  assert.equal(roleOf(j(fx.root, 'team'), 'ux').enabled, false);
  fx.cleanup();
});

test('P2-2. team set locks the role, generate respects locks, validation rejects bad input', () => {
  const fx = setup();
  ok(cli(fx.root, 'team', 'set', 'builder', '--model', 'haiku', '--enabled', 'true'));
  let t = j(fx.root, 'team');
  assert.equal(roleOf(t, 'builder').model, 'haiku');
  assert.deepEqual(t.locked, ['builder']);
  ok(cli(fx.root, 'team', 'set', '--communication', 'detailed'));
  ok(cli(fx.root, 'team', 'set', '--workflow', 'task'));
  t = j(fx.root, 'team');
  assert.deepEqual([t.communication, t.workflow], ['detailed', 'task']);
  ok(cli(fx.root, 'team', 'set', 'ux', '--enabled', 'false'));
  ok(cli(fx.root, 'team', 'generate'));
  assert.equal(roleOf(j(fx.root, 'team'), 'ux').enabled, false, 'locked ux unchanged by generate');
  bad(cli(fx.root, 'team', 'set', 'nobody', '--model', 'opus'), /unknown role/);
  bad(cli(fx.root, 'team', 'set', 'builder', '--model', 'gpt'), /--model/);
  bad(cli(fx.root, 'team', 'set', '--communication', 'loud'), /communication/);
  bad(cli(fx.root, 'team', 'set', 'builder', '--enabled', 'maybe'), /enabled/);
  ok(cli(fx.root, 'team', 'set', 'builder', '--model', 'claude-sonnet-4-5'));
  const c = readCfg(fx.root);
  c.team.roles.builder.model = 'nope';
  c.team.leads = [{ name: 'a', repos: ['backend', 'ghost'] }, { name: 'b', repos: ['backend'] }];
  writeCfg(fx.root, c);
  const v = JSON.parse(cli(fx.root, 'validate', '--json').out);
  assert.ok(v.errors.some((e) => /builder\.model/.test(e)));
  assert.ok(v.errors.some((e) => /ghost/.test(e)));
  assert.ok(v.errors.some((e) => /belongs to both/.test(e)));
  fx.cleanup();
});

test('P2-3. leads: add enables the role, rm of the last disables, one lead per repo, generate suggests with 4+ repos', () => {
  const fx = setup();
  ok(cli(fx.root, 'team', 'lead', 'add', 'backend', '--repos', 'backend'));
  let t = j(fx.root, 'team');
  assert.equal(roleOf(t, 'lead').enabled, true);
  assert.deepEqual(t.leads, [{ name: 'backend', repos: ['backend'] }]);
  bad(cli(fx.root, 'team', 'lead', 'add', 'other', '--repos', 'backend'), /already belongs/);
  bad(cli(fx.root, 'team', 'lead', 'add', 'x', '--repos', 'nope'), /Unknown repo/);
  ok(cli(fx.root, 'team', 'lead', 'add', 'web', '--repos', 'frontend'));
  ok(cli(fx.root, 'team', 'lead', 'rm', 'backend'));
  assert.equal(roleOf(j(fx.root, 'team'), 'lead').enabled, true);
  ok(cli(fx.root, 'team', 'lead', 'rm', 'web'));
  t = j(fx.root, 'team');
  assert.equal(roleOf(t, 'lead').enabled, false);
  bad(cli(fx.root, 'team', 'lead', 'rm', 'web'), /unknown lead/);
  const c = readCfg(fx.root);
  for (const n of ['r3', 'r4']) { fs.mkdirSync(path.join(fx.root, n)); c.repos.push({ name: n, path: n, ui: false }); }
  writeCfg(fx.root, c);
  const g = j(fx.root, 'team', 'generate');
  assert.equal(g.suggestion.length, 4);
  assert.equal(roleOf(j(fx.root, 'team'), 'lead').enabled, false, 'suggested, not enabled');
  fx.cleanup();
});

const V6 = { SPECFLOW_FAKE_FRAMEWORK_VERSION: '0.6.0' };
const up = (root, ...a) => JSON.parse(cliEnv(root, V6, 'upgrade', ...a, '--json').out);

/** Makes the config look like 0.5.0 (no Phase 2 keys). */
function downgradeTo050(root) {
  const c = readCfg(root);
  for (const k of ['team', 'delivery', 'release', 'testing', 'tools']) delete c[k];
  c.framework_version = '0.5.0';
  writeCfg(root, c);
}

test('P2-4. migration 0.6.0 from 0.5.0 is additive, derives ux, and keeps user config', () => {
  const fx = setup();
  downgradeTo050(fx.root);
  const c0 = readCfg(fx.root); c0.autonomy = 'guided'; writeCfg(fx.root, c0);
  const dry = up(fx.root);
  assert.equal(dry.applied, false);
  assert.ok(dry.migrations.find((m) => m.to === '0.6.0').changes.length);
  assert.equal(readCfg(fx.root).team, undefined, 'dry run writes nothing');
  assert.equal(up(fx.root, '--apply').applied, true);
  const c = readCfg(fx.root);
  assert.equal(c.framework_version, '0.6.0');
  assert.equal(c.autonomy, 'guided');
  assert.equal(c.team.roles.ux.enabled, true);
  assert.equal(c.team.roles.builder.model, 'sonnet');
  assert.deepEqual(c.delivery, { mode: 'push-pr', target_branch: null, pr_tool: 'gh' });
  assert.deepEqual([c.release, c.testing, c.tools], [{ by_ai: false }, { unit_required: true, data_rules: '' }, { graphify: false }]);
  assert.equal(JSON.parse(cli(fx.root, 'validate', '--json').out).ok, true);
  fx.cleanup();
});

test('P2-5. migration chains from 0.4.0 through 0.5.0 to 0.6.0', () => {
  const fx = setup();
  downgradeTo050(fx.root);
  const c = readCfg(fx.root);
  c.framework_version = '0.4.0'; c.schema_version = 1;
  for (const k of ['current_milestone', 'slicing', 'lanes']) delete c[k];
  writeCfg(fx.root, c);
  fs.rmSync(path.join(fx.root, '.specflow', 'memory.json'), { force: true });
  const r = up(fx.root, '--apply');
  assert.deepEqual(r.migrations.map((m) => m.to), ['0.5.0', '0.6.0']);
  const after = readCfg(fx.root);
  assert.equal(after.schema_version, 2);
  assert.ok(after.slicing && after.team && after.delivery);
  assert.equal(after.framework_version, '0.6.0');
  fx.cleanup();
});
