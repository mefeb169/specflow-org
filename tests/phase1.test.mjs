import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeFixture, cli, hook, w, sh } from './make-fixture.mjs';

const j = (root, ...a) => JSON.parse(cli(root, ...a, '--json').out);
const bl = (root) => path.join(root, '.specflow', 'backlog.json');
const cf = (root) => path.join(root, '.specflow', 'config.json');
const readBacklog = (root) => JSON.parse(fs.readFileSync(bl(root), 'utf8'));
const readCfg = (root) => JSON.parse(fs.readFileSync(cf(root), 'utf8'));
const ok = (r) => { assert.equal(r.code, 0, r.err || r.out); return r; };
const dec = (r) => r.json?.hookSpecificOutput?.permissionDecision ?? null;

function setup() {
  const fx = makeFixture();
  ok(cli(fx.root, 'init'));
  return fx;
}

const add = (root, title, ...extra) => ok(cli(root, 'feature', 'add', '--title', title, '--summary', `AC: ${title}`, '--value', 'v', '--repos', 'backend', ...extra)).out.trim();

/** Rewrites a workspace into the 0.4.0 shape: schema 1, none of the new fields. */
function downgradeToV1(root) {
  const b = readBacklog(root);
  b.schema_version = 1;
  for (const k of ['focus', 'parked', 'next_question', 'questions']) delete b[k];
  for (const f of b.features) for (const k of ['kind', 'lane', 'parent', 'milestone', 'tags', 'origin', 'rework', 'size_waiver', 'checkpoint', 'dropped']) delete f[k];
  fs.writeFileSync(bl(root), JSON.stringify(b, null, 2) + '\n');
  const c = readCfg(root);
  c.schema_version = 1; c.framework_version = '0.4.0';
  for (const k of ['current_milestone', 'slicing', 'lanes']) delete c[k];
  fs.writeFileSync(cf(root), JSON.stringify(c, null, 2) + '\n');
  fs.rmSync(path.join(root, '.specflow', 'memory.json'), { force: true });
}

test('P1-1. a 0.4.0 workspace keeps working for reads and writes, and reads never rewrite files', () => {
  const fx = setup();
  const id = add(fx.root, 'Old feature');
  downgradeToV1(fx.root);
  const before = fs.readFileSync(bl(fx.root), 'utf8');
  for (const args of [['status'], ['status', id], ['next'], ['validate'], ['brief'], ['doctor']]) {
    const r = cli(fx.root, ...args);
    assert.ok(r.code === 0 || args[0] === 'doctor', `${args.join(' ')}: ${r.err}`);
  }
  assert.equal(fs.readFileSync(bl(fx.root), 'utf8'), before, 'reads do not rewrite');
  ok(cli(fx.root, 'feature', 'set', id, 'priority', 'P0'));
  ok(cli(fx.root, 'stage', 'set', id, 'defined'));
  assert.equal(readBacklog(fx.root).features[0].priority, 'P0');
  fx.cleanup();
});

test('P1-2. new feature records carry the schema v2 fields', () => {
  const fx = setup();
  const id = add(fx.root, 'New');
  const f = readBacklog(fx.root).features.find((x) => x.id === id);
  assert.equal(f.kind, 'feature');
  assert.equal(f.lane, 'full');
  assert.deepEqual([f.parent, f.milestone, f.origin, f.size_waiver, f.checkpoint, f.dropped], [null, null, null, null, null, null]);
  assert.deepEqual([f.tags, f.rework], [[], []]);
  fx.cleanup();
});

test('P1-3. validate checks the new fields', () => {
  const fx = setup();
  const id = add(fx.root, 'A');
  const b = readBacklog(fx.root);
  b.features[0].kind = 'epic';
  b.features[0].lane = 'fast';
  b.features[0].parent = 'F-099';
  b.focus = 'F-404';
  b.parked = ['F-405'];
  fs.writeFileSync(bl(fx.root), JSON.stringify(b));
  const errs = j(fx.root, 'validate').errors.join('\n');
  assert.match(errs, /unknown kind "epic"/);
  assert.match(errs, /unknown lane "fast"/);
  assert.match(errs, /parent F-099 does not exist/);
  assert.match(errs, /focus F-404 does not exist/);
  assert.match(errs, /parked item F-405 does not exist/);
  assert.ok(id);
  fx.cleanup();
});

test('P1-4. guard protects memory.json like backlog.json and config.json', () => {
  const fx = setup();
  const file = path.join(fx.root, '.specflow', 'memory.json');
  assert.equal(dec(hook('pre-tool-use', fx.root, { tool_name: 'Edit', tool_input: { file_path: file } })), 'deny');
  assert.equal(dec(hook('pre-tool-use', fx.root, { tool_name: 'Write', tool_input: { file_path: file } })), 'deny');
  const sh1 = hook('pre-tool-use', fx.root, { tool_name: 'Bash', permission_mode: 'default', tool_input: { command: 'echo {} > .specflow/memory.json' } });
  assert.equal(dec(sh1), 'ask');
  fx.cleanup();
});

test('P1-5. upgrade: v1 dry run lists changes, --apply is additive and leaves validate clean', () => {
  const fx = setup();
  const a = add(fx.root, 'One', '--priority', 'P1');
  downgradeToV1(fx.root);
  const c = readCfg(fx.root); c.autonomy = 'guided'; c.guards.extra_bash_patterns = ['mine']; fs.writeFileSync(cf(fx.root), JSON.stringify(c));
  const beforeBl = fs.readFileSync(bl(fx.root), 'utf8');
  const dry = j(fx.root, 'upgrade');
  const step = dry.migrations.find((m) => m.to === '0.5.0');
  assert.ok(step.changes.some((x) => /backlog.schema_version = 2/.test(x)));
  assert.ok(step.changes.some((x) => /1 feature record/.test(x)));
  assert.ok(step.changes.some((x) => /memory\.json/.test(x)));
  assert.equal(fs.readFileSync(bl(fx.root), 'utf8'), beforeBl, 'dry run writes nothing');
  assert.ok(!fs.existsSync(path.join(fx.root, '.specflow', 'memory.json')));

  ok(cli(fx.root, 'upgrade', '--apply'));
  const b = readBacklog(fx.root);
  assert.equal(b.schema_version, 2);
  assert.equal(b.features[0].priority, 'P1');
  assert.equal(b.features[0].kind, 'feature');
  assert.equal(b.next_question, 1);
  const cfg = readCfg(fx.root);
  assert.equal(cfg.schema_version, 2);
  assert.equal(cfg.autonomy, 'guided');
  assert.deepEqual(cfg.guards.extra_bash_patterns, ['mine']);
  assert.deepEqual(cfg.slicing, { max_tasks: 15, max_migrations: 1 });
  assert.ok(fs.existsSync(path.join(fx.root, '.specflow', 'memory.json')));
  assert.equal(j(fx.root, 'validate').ok, true);
  assert.ok(a);
  fx.cleanup();
});

const specDir = (root, name = '001-x') => path.join(root, 'specs', name);
function linkSpec(root, id, files = {}, name = '001-x') {
  const dir = specDir(root, name);
  for (const [f, text] of Object.entries(files)) w(path.join(dir, f), text);
  fs.mkdirSync(dir, { recursive: true });
  ok(cli(root, 'feature', 'link', id, dir));
  return dir;
}

test('P1-6. lite lane: only configured gates, no plan.md or ux.md needed to reach designed', () => {
  const fx = setup();
  const id = add(fx.root, 'Small fix', '--ui', 'true');
  assert.deepEqual(j(fx.root, 'gate', 'required', id).required, ['spec', 'design', 'implement', 'acceptance', 'release']);
  ok(cli(fx.root, 'feature', 'set', id, 'lane', 'lite'));
  assert.deepEqual(j(fx.root, 'gate', 'required', id).required, ['acceptance', 'release']);
  linkSpec(fx.root, id, { 'spec.md': '# short spec\n', 'tasks.md': '- [ ] T1 [repo:backend] fix\n' });
  ok(cli(fx.root, 'stage', 'set', id, 'defined'));
  ok(cli(fx.root, 'stage', 'set', id, 'specified'));
  ok(cli(fx.root, 'stage', 'set', id, 'designed'));
  ok(cli(fx.root, 'stage', 'set', id, 'planned'));
  ok(cli(fx.root, 'branches', 'create', id));
  ok(cli(fx.root, 'stage', 'set', id, 'implementing'));
  assert.match(cli(fx.root, 'feature', 'set', id, 'lane', 'full').err, /before implementing/);
  fx.cleanup();
});

test('P1-7. lite lane still demands Repository Impact when a plan exists and repos > 1; spec.md is always needed', () => {
  const fx = setup();
  const id = ok(cli(fx.root, 'feature', 'add', '--title', 'Two repos', '--summary', 's', '--value', 'v', '--repos', 'backend,frontend')).out.trim();
  ok(cli(fx.root, 'feature', 'set', id, 'lane', 'lite'));
  linkSpec(fx.root, id, { 'plan.md': '# plan only\n' });
  ok(cli(fx.root, 'stage', 'set', id, 'defined'));
  assert.match(cli(fx.root, 'stage', 'set', id, 'specified').err, /spec\.md does not exist/);
  w(path.join(specDir(fx.root), 'spec.md'), '# s\n');
  ok(cli(fx.root, 'stage', 'set', id, 'specified'));
  assert.match(cli(fx.root, 'stage', 'set', id, 'designed').err, /Repository Impact/);
  fx.cleanup();
});
