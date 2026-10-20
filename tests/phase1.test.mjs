import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeFixture, cli, hook, w, sh, HOOKS } from './make-fixture.mjs';

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

/** Autonomous mode: only acceptance and release gates, so tests can walk the early stages. */
const auto = (root) => { const c = readCfg(root); c.autonomy = 'autonomous'; fs.writeFileSync(cf(root), JSON.stringify(c)); };

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

const tasksOf = (n, mig = 0) => Array.from({ length: n }, (_, i) => `- [ ] T${i + 1} [repo:backend] ${i < mig ? 'add migration' : 'work'} ${i}\n`).join('');

test('P1-8. slice add inherits from the parent and makes it a container', () => {
  const fx = setup();
  const p = add(fx.root, 'Big', '--priority', 'P1', '--mvp');
  ok(cli(fx.root, 'feature', 'set', p, 'tags', 'area:auth'));
  const s = ok(cli(fx.root, 'slice', 'add', p, '--title', 'Slice one')).out.trim();
  const rec = readBacklog(fx.root).features.find((x) => x.id === s);
  assert.deepEqual([rec.kind, rec.lane, rec.parent, rec.priority, rec.mvp, rec.repos], ['slice', 'lite', p, 'P1', true, ['backend']]);
  assert.deepEqual(rec.tags, ['area:auth']);
  assert.match(cli(fx.root, 'slice', 'add', s, '--title', 'nested').err, /slices belong to a feature/);
  const d = j(fx.root, 'status', p);
  assert.equal(d.slices.length, 1);
  assert.match(cli(fx.root, 'status', s).out, new RegExp(`slice of ${p}`));
  assert.equal(j(fx.root, 'validate').ok, true);
  fx.cleanup();
});

test('P1-9. container: plans without tasks.md, cannot advance past planned, done only when every slice is done', () => {
  const fx = setup(); auto(fx.root);
  const p = add(fx.root, 'Container');
  linkSpec(fx.root, p, { 'spec.md': '# s\n', 'plan.md': '# p\n' });
  const s = ok(cli(fx.root, 'slice', 'add', p, '--title', 'S1')).out.trim();
  ok(cli(fx.root, 'feature', 'set', p, 'ui', 'false'));
  for (const st of ['defined', 'specified', 'designed']) ok(cli(fx.root, 'stage', 'set', p, st));
  // design gate is required for multi-repo/migration traits only; backend-only feature here
  const r = cli(fx.root, 'stage', 'set', p, 'planned');
  assert.equal(r.code, 0, r.err);
  assert.match(cli(fx.root, 'stage', 'set', p, 'implementing').err, /container; work happens in its slices/);
  assert.match(cli(fx.root, 'stage', 'set', p, 'done').err, /slices not done yet/);
  // fast-forward the slice to done by editing state through the CLI is impossible, so patch the file (test only)
  const b = readBacklog(fx.root);
  b.features.find((x) => x.id === s).stage = 'done';
  fs.writeFileSync(bl(fx.root), JSON.stringify(b));
  ok(cli(fx.root, 'stage', 'set', p, 'done'));
  const rec = readBacklog(fx.root).features.find((x) => x.id === p);
  assert.equal(rec.stage, 'done');
  assert.match(rec.history.at(-1).detail, /one-step rule waived/);
  fx.cleanup();
});

test('P1-10. size rule: too many tasks or migrations blocks planned; a waiver or slices lift it', () => {
  const fx = setup(); auto(fx.root);
  const id = add(fx.root, 'Huge');
  linkSpec(fx.root, id, { 'spec.md': '# s\n', 'plan.md': '# p\n', 'tasks.md': tasksOf(16) });
  for (const st of ['defined', 'specified', 'designed']) ok(cli(fx.root, 'stage', 'set', id, st));
  const r = cli(fx.root, 'stage', 'set', id, 'planned');
  assert.notEqual(r.code, 0);
  assert.match(r.err, /too large \(16 tasks, 0 migrations; limit 15\/1\): split into slices \(specflow slice add F-001 \.\.\.\) or record a waiver/);
  const sz = j(fx.root, 'check', 'size', id);
  assert.deepEqual([sz.tasks, sz.migrations, sz.within_limits], [16, 0, false]);
  ok(cli(fx.root, 'feature', 'set', id, 'size_waiver', 'user approved: one big refactor'));
  ok(cli(fx.root, 'stage', 'set', id, 'planned'));
  // migrations
  const id2 = add(fx.root, 'Migrations');
  linkSpec(fx.root, id2, { 'spec.md': '# s\n', 'plan.md': '# p\n', 'tasks.md': tasksOf(4, 2) }, '002-m');
  for (const st of ['defined', 'specified', 'designed']) ok(cli(fx.root, 'stage', 'set', id2, st));
  assert.match(cli(fx.root, 'stage', 'set', id2, 'planned').err, /4 tasks, 2 migrations/);
  fx.cleanup();
});

test('P1-11. issues: add, list, from; drop and restore; dropped deps hold dependents and leave next', () => {
  const fx = setup();
  const a = add(fx.root, 'Feature A');
  const i = ok(cli(fx.root, 'issue', 'add', 'Login button misaligned on small screens. It overlaps the logo and also breaks the layout when the browser is narrow, see screenshot.', '--kind', 'bug', '--from', a, '--repos', 'frontend', '--priority', 'P1')).out.trim();
  const rec = readBacklog(fx.root).features.find((x) => x.id === i);
  assert.deepEqual([rec.kind, rec.lane, rec.stage, rec.origin.from, rec.priority], ['bug', 'lite', 'proposed', a, 'P1']);
  assert.ok(rec.title.length <= 80 && rec.summary.startsWith('Login button misaligned') && rec.summary.length > 80);
  const list = j(fx.root, 'issue', 'list');
  assert.deepEqual(list.map((x) => x.id), [i]);
  assert.match(cli(fx.root, 'issue', 'add', 'x', '--kind', 'feature').err, /kind must be/);

  const b = add(fx.root, 'Feature B');
  ok(cli(fx.root, 'dep', 'add', b, a, '--type', 'requires'));
  ok(cli(fx.root, 'feature', 'drop', a, '--reason', 'cancelled'));
  assert.match(cli(fx.root, 'feature', 'drop', a).err, /--reason required/);
  const next = j(fx.root, 'next');
  assert.ok(!next.ready.some((x) => x.id === a));
  assert.ok(next.not_ready.find((x) => x.id === b).held_by.some((h) => /dependency F-001 was dropped/.test(h)));
  ok(cli(fx.root, 'feature', 'restore', a));
  assert.ok(j(fx.root, 'next').ready.some((x) => x.id === a));
  ok(cli(fx.root, 'feature', 'drop', i, '--reason', 'dup'));
  assert.equal(j(fx.root, 'issue', 'list').length, 0);
  fx.cleanup();
});

test('P1-12. question answer closes the question and logs a decision', () => {
  const fx = setup();
  const a = add(fx.root, 'Feature A');
  const q = ok(cli(fx.root, 'question', 'add', 'Token lifetime?', '--feature', a, '--to', 'product')).out.trim();
  assert.equal(q, 'Q-1');
  assert.equal(j(fx.root, 'question', 'list', '--open').length, 1);
  ok(cli(fx.root, 'question', 'answer', q, '30 minutes'));
  assert.equal(j(fx.root, 'question', 'list', '--open').length, 0);
  assert.match(cli(fx.root, 'question', 'answer', q, 'again').err, /already answered/);
  const mem = JSON.parse(fs.readFileSync(path.join(fx.root, '.specflow', 'memory.json'), 'utf8'));
  assert.equal(mem.schema_version, 2);
  assert.deepEqual([mem.decisions[0].id, mem.decisions[0].question, mem.decisions[0].answer, mem.decisions[0].scope, mem.decisions[0].by], ['D-1', 'Token lifetime?', '30 minutes', a, 'user']);
  assert.match(cli(fx.root, 'question', 'add', 'x', '--to', 'nobody').err, /--to must be/);
  fx.cleanup();
});

test('P1-13. intake turns a task file into one item and refuses a second import', () => {
  const fx = setup();
  w(path.join(fx.root, 'tasks-new', 'task-9.md'), '\n# Fix lint warnings\n\nClean the lint output in the backend.\nKeep behavior unchanged.\n\n## Details\nmore\n');
  const out = j(fx.root, 'intake', 'tasks-new/task-9.md', '--kind', 'chore');
  assert.equal(out.title, 'Fix lint warnings');
  assert.equal(out.summary, 'Clean the lint output in the backend. Keep behavior unchanged.');
  assert.deepEqual([out.kind, out.lane, out.origin.source], ['chore', 'lite', 'tasks-new/task-9.md']);
  const again = cli(fx.root, 'intake', 'tasks-new/task-9.md');
  assert.notEqual(again.code, 0);
  assert.match(again.err, /already imported as F-001/);
  w(path.join(fx.root, 'notes.md'), 'just text\n');
  assert.equal(j(fx.root, 'intake', 'notes.md', '--title', 'Custom').title, 'Custom');
  fx.cleanup();
});

const patchBacklog = (root, fn) => { const b = readBacklog(root); fn(b); fs.writeFileSync(bl(root), JSON.stringify(b)); };

test('P1-14. focus, interrupt, resume; interrupt reports conflicts and never switches branches', () => {
  const fx = setup();
  const a = add(fx.root, 'Active feature');
  patchBacklog(fx.root, (b) => { const f = b.features[0]; f.stage = 'implementing'; f.branches = { backend: 'feat-a' }; });
  assert.equal(j(fx.root, 'focus').focus, null);
  ok(cli(fx.root, 'focus', a));
  assert.equal(j(fx.root, 'focus').focus, a);
  w(path.join(fx.be, 'dirty.txt'), 'x');
  const before = sh(fx.be, 'git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const r = j(fx.root, 'interrupt', 'Prod login is broken', '--repos', 'backend');
  assert.equal(r.parked, a);
  assert.equal(r.conflicts.length, 1);
  assert.deepEqual([r.conflicts[0].id, r.conflicts[0].repo, r.conflicts[0].branch, r.conflicts[0].dirty], [a, 'backend', 'feat-a', true]);
  assert.equal(sh(fx.be, 'git', ['rev-parse', '--abbrev-ref', 'HEAD']), before, 'branch untouched');
  const b = readBacklog(fx.root);
  const urgent = b.features.find((x) => x.id === r.id);
  assert.deepEqual([b.focus, b.parked, urgent.priority, urgent.tags, urgent.origin.from], [r.id, [a], 'P0', ['urgent'], a]);
  const res = j(fx.root, 'resume');
  assert.equal(res.resumed, a);
  assert.equal(readBacklog(fx.root).focus, a);
  assert.equal(j(fx.root, 'resume').resumed, null);
  assert.match(cli(fx.root, 'focus', r.id, '--clear').out, /cleared/i);
  ok(cli(fx.root, 'feature', 'drop', r.id, '--reason', 'fixed elsewhere'));
  assert.match(cli(fx.root, 'focus', r.id).err, /dropped/);
  fx.cleanup();
});

test('P1-15. milestone filters next and status; --all and urgent/bug items bypass it', () => {
  const fx = setup();
  const a = add(fx.root, 'In milestone');
  const b = add(fx.root, 'Elsewhere');
  const c = ok(cli(fx.root, 'issue', 'add', 'a bug', '--kind', 'bug')).out.trim();
  ok(cli(fx.root, 'feature', 'set', a, 'milestone', 'm1'));
  ok(cli(fx.root, 'feature', 'set', b, 'milestone', 'm2'));
  ok(cli(fx.root, 'feature', 'set', b, 'tags', 'area:x,phase:2'));
  assert.equal(j(fx.root, 'next').ready.length, 3, 'no milestone: everything');
  ok(cli(fx.root, 'milestone', 'set', 'm1'));
  const ids = (r) => r.ready.map((x) => x.id).sort();
  assert.deepEqual(ids(j(fx.root, 'next')), [a, c].sort());
  assert.match(cli(fx.root, 'next').out, /Filter: milestone m1/);
  assert.equal(ids(j(fx.root, 'next', '--all')).length, 3);
  assert.deepEqual(j(fx.root, 'status').map((r) => r.id).sort(), [a, c].sort());
  assert.equal(j(fx.root, 'status', '--all').length, 3);
  assert.match(cli(fx.root, 'status').out, /kind/);
  ok(cli(fx.root, 'milestone', 'clear'));
  assert.equal(j(fx.root, 'next').ready.length, 3);
  ok(cli(fx.root, 'feature', 'drop', b, '--reason', 'no'));
  assert.equal(j(fx.root, 'status').length, 2, 'dropped hidden by default');
  assert.equal(j(fx.root, 'status', '--all').length, 3);
  fx.cleanup();
});

test('P1-16. checkpoint writes a short handoff, keeps old note/next, and stage set regenerates it', () => {
  const fx = setup(); auto(fx.root);
  const id = add(fx.root, 'Handoff me');
  linkSpec(fx.root, id, { 'spec.md': '# s\n', 'plan.md': '# p\n' });
  const file = path.join(specDir(fx.root), 'handoff.md');
  const r = j(fx.root, 'checkpoint', id, '--note', 'spec is solid', '--next', 'write the plan');
  assert.equal(r.handoff, 'specs/001-x/handoff.md');
  let text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^<!-- generated by specflow checkpoint/);
  assert.match(text, /# Handoff: F-001 Handoff me — stage proposed/);
  assert.match(text, /## Next step\nwrite the plan/);
  assert.match(text, /## Note\nspec is solid/);
  for (const h of ['## Progress', '## Repos', '| repo | branch | HEAD | last verified | fresh |', '## Open blockers', '## Open questions', '## Recent decisions', '## Artifacts', '- specs/001-x/spec.md']) assert.ok(text.includes(h), h);
  assert.ok(text.split('\n').length <= 60);
  ok(cli(fx.root, 'checkpoint', id, '--next', 'second next'));
  text = fs.readFileSync(file, 'utf8');
  assert.match(text, /## Next step\nsecond next/);
  assert.match(text, /## Note\nspec is solid/, 'note kept');
  ok(cli(fx.root, 'stage', 'set', id, 'defined'));
  assert.match(fs.readFileSync(file, 'utf8'), /stage defined/);
  // without a spec dir the handoff goes under .specflow/handoff/
  const b = add(fx.root, 'No spec');
  assert.equal(j(fx.root, 'checkpoint', b).handoff, '.specflow/handoff/F-002.md');
  assert.ok(fs.existsSync(path.join(fx.root, '.specflow', 'handoff', 'F-002.md')));
  fx.cleanup();
});

test('P1-17. PreCompact hook writes the focus handoff; Stop hook refreshes a stale one; both no-op outside a workspace', () => {
  const fx = setup();
  const id = add(fx.root, 'Focused');
  ok(cli(fx.root, 'focus', id));
  const file = path.join(fx.root, '.specflow', 'handoff', `${id}.md`);
  assert.ok(!fs.existsSync(file));
  const r = hook('pre-compact', fx.root, { hook_event_name: 'PreCompact' });
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
  assert.match(fs.readFileSync(file, 'utf8'), /# Handoff: F-001 Focused/);
  fs.rmSync(file);
  assert.equal(hook('stop', fx.root, {}).code, 0);
  assert.ok(fs.existsSync(file), 'stop regenerated the missing handoff');
  const hooks = JSON.parse(fs.readFileSync(path.join(HOOKS, '..', '..', 'hooks', 'hooks.json'), 'utf8'));
  assert.ok(hooks.hooks.PreCompact);
  const out = fs.mkdtempSync(path.join(fx.root, '..', 'nows-'));
  assert.equal(hook('pre-compact', out, {}).code, 0);
  fx.cleanup();
});

test('P1-18. brief carries focus, parked, milestone, preferences, questions and stays under 1,500 chars with 120 features', () => {
  const fx = setup();
  const b = readBacklog(fx.root);
  const mk = (i, stage) => ({ id: `F-${String(i).padStart(3, '0')}`, title: `Feature number ${i} with a fairly descriptive title about things`, summary: 's', priority: 'P2', mvp: false, value: 'v', risk: 'med', ui: false, stage, spec_dir: null, repos: ['backend', 'frontend'], branches: {}, deps: [], gates: {}, blockers: [], revisit: null, history: [] });
  b.features = Array.from({ length: 120 }, (_, i) => mk(i + 1, i < 12 ? 'implementing' : 'proposed'));
  b.features[0].spec_dir = 'specs/001-x';
  b.next_id = 121;
  fs.writeFileSync(bl(fx.root), JSON.stringify(b));
  ok(cli(fx.root, 'focus', 'F-001'));
  ok(cli(fx.root, 'checkpoint', 'F-001', '--next', 'finish the backend endpoint then run verify'));
  ok(cli(fx.root, 'interrupt', 'Urgent prod bug in checkout flow that needs a hotfix today'));
  ok(cli(fx.root, 'milestone', 'set', 'm1'));
  const mem = { schema_version: 2, preferences: {}, decisions: [], lessons: [] };
  for (let i = 0; i < 10; i++) mem.preferences[`key${i}`] = { value: `value-${i}-with-some-length`, at: 'x', by: 'user' };
  fs.writeFileSync(path.join(fx.root, '.specflow', 'memory.json'), JSON.stringify(mem));
  ok(cli(fx.root, 'question', 'add', 'Which provider?'));
  const out = cli(fx.root, 'brief').out;
  assert.ok(out.length < 1500, `brief is ${out.length} chars:\n${out}`);
  assert.match(out, /Focus: F-121/);
  assert.match(out, /Parked: F-001/);
  assert.match(out, /Milestone: m1/);
  assert.match(out, /Preferences: key0=/);
  assert.match(out, /Open questions: 1/);
  fx.cleanup();
});

test('P1-19. rework rounds: start from verifying, keep branches, close on accepted, no new PR guidance', () => {
  const fx = setup(); auto(fx.root);
  const id = add(fx.root, 'Reworked');
  linkSpec(fx.root, id, { 'spec.md': '# s\n', 'tasks.md': '- [x] T1 [repo:backend] done\n' });
  patchBacklog(fx.root, (b) => { const f = b.features[0]; f.stage = 'verifying'; f.branches = { backend: 'feat-x' }; f.gates.acceptance = { approved_at: 'x', by: 'human', note: '' }; });
  assert.match(cli(fx.root, 'rework', 'start', id).err, /--reason required/);
  const r = ok(cli(fx.root, 'rework', 'start', id, '--reason', 'reviewer found a missing guard'));
  assert.match(r.out, /round 1/);
  assert.match(r.out, /Do not push or open a new PR/);
  let f = readBacklog(fx.root).features[0];
  assert.deepEqual([f.stage, f.branches, f.rework.length, f.rework[0].n, f.rework[0].closed_at, f.gates.acceptance], ['implementing', { backend: 'feat-x' }, 1, 1, null, null]);
  assert.match(cli(fx.root, 'status', id).out, /round 1 open/);
  assert.match(fs.readFileSync(path.join(specDir(fx.root), 'handoff.md'), 'utf8'), /stage implementing, rework round 1/);
  assert.match(cli(fx.root, 'rework', 'start', id, '--reason', 'again').err, /from verifying or accepted/);
  // back to verifying, then accepted closes the round
  ok(cli(fx.root, 'stage', 'set', id, 'verifying'));
  ok(cli(fx.root, 'repo', 'set', 'backend', '--confirm'));
  ok(cli(fx.root, 'verify', 'run', id, '--repo', 'backend'));
  ok(cli(fx.root, 'evidence', 'add', id, '--kind', 'review', '--result', 'pass', '--note', 'ok'));
  ok(cli(fx.root, 'stage', 'set', id, 'accepted'));
  f = readBacklog(fx.root).features[0];
  assert.ok(f.rework[0].closed_at);
  assert.match(cli(fx.root, 'status', id).out, /none open, 1 round/);
  // second round from accepted, then explicit close
  ok(cli(fx.root, 'rework', 'start', id, '--reason', 'owner request'));
  assert.equal(readBacklog(fx.root).features[0].rework.length, 2);
  ok(cli(fx.root, 'rework', 'close', id));
  assert.ok(readBacklog(fx.root).features[0].rework[1].closed_at);
  assert.match(cli(fx.root, 'rework', 'close', id).err, /no open rework round/);
  fx.cleanup();
});

test('P1-20. pref, decision and lesson commands; HELP lists every new command', () => {
  const fx = setup();
  const a = add(fx.root, 'A');
  ok(cli(fx.root, 'pref', 'set', 'detail', 'short updates'));
  ok(cli(fx.root, 'pref', 'set', 'git', 'ai pushes', '--by', 'architect'));
  const prefs = j(fx.root, 'pref', 'list');
  assert.deepEqual(prefs.map((p) => [p.key, p.value, p.by]), [['detail', 'short updates', 'user'], ['git', 'ai pushes', 'architect']]);
  ok(cli(fx.root, 'pref', 'rm', 'git'));
  assert.equal(j(fx.root, 'pref', 'list').length, 1);
  assert.match(cli(fx.root, 'pref', 'rm', 'nope').err, /unknown preference/);

  ok(cli(fx.root, 'decision', 'add', 'Use yopmail?', 'yes for test accounts'));
  ok(cli(fx.root, 'decision', 'add', 'Token TTL?', '30m', '--feature', a));
  const all = j(fx.root, 'decision', 'list');
  assert.deepEqual(all.map((d) => d.id), ['D-2', 'D-1'], 'newest first');
  assert.deepEqual(j(fx.root, 'decision', 'list', '--feature', a).map((d) => d.id), ['D-2']);
  assert.equal(j(fx.root, 'decision', 'list', '--limit', '1').length, 1);

  const l = ok(cli(fx.root, 'lesson', 'add', 'Guard every public route', '--from', a)).out.trim().split(' ')[0];
  assert.equal(l, 'L-1');
  assert.equal(j(fx.root, 'lesson', 'list', '--status', 'proposed').length, 1);
  ok(cli(fx.root, 'lesson', 'promote', l));
  assert.equal(j(fx.root, 'lesson', 'list', '--status', 'promoted').length, 1);
  ok(cli(fx.root, 'lesson', 'add', 'x'));
  ok(cli(fx.root, 'lesson', 'reject', 'L-2'));
  assert.equal(j(fx.root, 'lesson', 'list', '--status', 'rejected').length, 1);
  // memory.json only changes through the CLI and survives validate
  assert.equal(j(fx.root, 'validate').ok, true);
  const help = cli(fx.root, 'help').out;
  for (const c of ['slice add', 'issue add', 'issue list', 'intake', 'question add', 'question answer', 'rework start', 'focus', 'interrupt', 'resume', 'milestone', 'checkpoint', 'pref set', 'decision add', 'lesson promote', 'feature drop', 'check tasks|size']) assert.ok(help.includes(c), `HELP lacks ${c}`);
  fx.cleanup();
});
