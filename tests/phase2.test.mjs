import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeFixture, cli, cliEnv, hook, w } from './make-fixture.mjs';

const j = (root, ...a) => { const r = cli(root, ...a, '--json'); assert.equal(r.code, 0, r.err); return JSON.parse(r.out); };
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

const AGENTS = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'plugins', 'specflow', 'agents');
const frontmatter = (file) => {
  const t = fs.readFileSync(file, 'utf8');
  const m = t.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert.ok(m, `${file}: frontmatter`);
  const fm = Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
  return { fm, body: m[2] };
};

test('P2-6. role agents: name, default model, tools (Agent only for lead and verifier), contract present', () => {
  const want = { product: 'opus', architect: 'opus', ux: 'opus', lead: 'opus', builder: 'sonnet', verifier: 'sonnet' };
  for (const [name, model] of Object.entries(want)) {
    const { fm, body } = frontmatter(path.join(AGENTS, `${name}.md`));
    assert.equal(fm.name, name);
    assert.equal(fm.model, model);
    assert.match(fm.description, /dispatched by the specflow PM; not for direct use/);
    const tools = fm.tools.split(',').map((x) => x.trim());
    assert.equal(tools.includes('Agent'), name === 'lead' || name === 'verifier', `${name} tools`);
    assert.match(body, /skills\/[a-z]+\/SKILL\.md/);
    assert.match(body, /_shared\/role-contract\.md/);
    assert.match(body, /You never talk to the user/);
    assert.match(body, /specflow question add/);
    assert.match(body, /specflow checkpoint/);
    assert.ok(body.split('\n').length < 40, `${name} body length`);
  }
  assert.match(frontmatter(path.join(AGENTS, 'lead.md')).body, /lead-<name>\.md/);
  assert.match(frontmatter(path.join(AGENTS, 'builder.md')).body, /ONE repo per dispatch/);
  for (const keep of ['independent-reviewer', 'repo-profiler']) assert.ok(fs.existsSync(path.join(AGENTS, `${keep}.md`)));
});

// ---- G4 dispatch ----
const bl = (root) => path.join(root, '.specflow', 'backlog.json');
const patchBacklog = (root, fn) => { const b = JSON.parse(fs.readFileSync(bl(root), 'utf8')); fn(b); fs.writeFileSync(bl(root), JSON.stringify(b)); };
const addF = (root, title, repos = 'backend', ...extra) => ok(cli(root, 'feature', 'add', '--title', title, '--summary', `AC: ${title}`, '--value', 'v', '--repos', repos, ...extra)).out.trim();
const setStage = (root, id, stage, extra = {}) => patchBacklog(root, (b) => Object.assign(b.features.find((f) => f.id === id), { stage }, extra));
const disp = (root, ...a) => j(root, 'dispatch', ...a);

test('P2-7. dispatch routes every stage to the right role, agent and model', () => {
  const fx = setup();
  const id = addF(fx.root, 'Routing', 'backend', '--ui', 'false');
  fs.mkdirSync(path.join(fx.root, 'specs', '001-x'), { recursive: true });
  const want = { proposed: 'product', defined: 'product', specified: 'architect', designed: 'architect', planned: 'builder', implementing: 'builder', verifying: 'verifier', accepted: 'product' };
  for (const [stage, role] of Object.entries(want)) {
    setStage(fx.root, id, stage, { spec_dir: stage === 'proposed' || stage === 'defined' ? null : 'specs/001-x' });
    const d = disp(fx.root, id);
    assert.equal(d.role, role, stage);
    assert.equal(d.agent, `specflow:${role}`);
    assert.equal(d.model, role === 'builder' || role === 'verifier' ? 'sonnet' : 'opus');
    assert.ok(d.prompt.length < 1200);
  }
  setStage(fx.root, id, 'released', { spec_dir: 'specs/001-x' });
  const r = disp(fx.root, id);
  assert.equal(r.role, 'pm');
  assert.equal(r.agent, null);
  const hist = JSON.parse(fs.readFileSync(bl(fx.root), 'utf8')).features[0].history;
  assert.ok(hist.some((h) => h.detail === 'dispatch verifier'));
  fx.cleanup();
});

test('P2-8. UI item at specified with incomplete ux.md goes to ux; disabled ux falls back to the architect', () => {
  const fx = setup();
  const id = addF(fx.root, 'Screen', 'frontend', '--ui', 'true');
  fs.mkdirSync(path.join(fx.root, 'specs', '001-x'), { recursive: true });
  setStage(fx.root, id, 'specified', { spec_dir: 'specs/001-x' });
  let d = disp(fx.root, id);
  assert.deepEqual([d.role, d.agent], ['ux', 'specflow:ux']);
  w(path.join(fx.root, 'specs', '001-x', 'ux.md'), '# UX\nMode: conform\n\n## Flows\nf\n\n## Screens and states\ns\n\n## Copy\nc\n\n## Accessibility\na\n');
  assert.equal(disp(fx.root, id).role, 'architect', 'complete ux.md');
  fs.rmSync(path.join(fx.root, 'specs', '001-x', 'ux.md'));
  ok(cli(fx.root, 'team', 'set', 'ux', '--enabled', 'false'));
  d = disp(fx.root, id);
  assert.equal(d.role, 'architect');
  assert.equal(d.requested_role, 'ux');
  assert.equal(d.covered_by, 'architect');
  assert.match(d.prompt, /cover the disabled ux/);
  fx.cleanup();
});

test('P2-9. builder dispatch: one repo, --repo required for multi-repo, to-do list in deploy order', () => {
  const fx = setup();
  const id = addF(fx.root, 'Both', 'backend,frontend');
  fs.mkdirSync(path.join(fx.root, 'specs', '001-x'), { recursive: true });
  w(path.join(fx.root, 'specs', '001-x', 'tasks.md'), '- [X] T1 [repo:backend] a\n- [ ] T2 [repo:frontend] b\n- [ ] T3 [repo:backend] c\n');
  setStage(fx.root, id, 'implementing', { spec_dir: 'specs/001-x' });
  ok(cli(fx.root, 'repo', 'set', 'frontend', '--deploy-order', '1'));
  ok(cli(fx.root, 'repo', 'set', 'backend', '--deploy-order', '2'));
  const r = cli(fx.root, 'dispatch', id);
  bad(r, /--repo/);
  assert.match(r.err, /frontend, backend/);
  const d = disp(fx.root, id, '--repo', 'backend');
  assert.equal(d.repo, 'backend');
  assert.deepEqual(d.repos_todo, ['frontend', 'backend']);
  assert.match(d.prompt, /Repo: backend/);
  bad(cli(fx.root, 'dispatch', id, '--repo', 'nope'), /--repo/);
  const single = addF(fx.root, 'One', 'backend');
  setStage(fx.root, single, 'planned');
  assert.equal(disp(fx.root, single).repo, 'backend');
  fx.cleanup();
});

test('P2-10. lead vs builder, verifier fallback to the PM, refused for done/dropped', () => {
  const fx = setup();
  const id = addF(fx.root, 'Lead me', 'backend');
  setStage(fx.root, id, 'planned');
  assert.equal(disp(fx.root, id).role, 'builder', 'no lead configured');
  ok(cli(fx.root, 'team', 'lead', 'add', 'backend', '--repos', 'backend'));
  let d = disp(fx.root, id);
  assert.equal(d.role, 'lead');
  assert.equal(d.agent, 'specflow:lead');
  assert.equal(d.lead, 'backend');
  assert.match(d.prompt, /Lead area: backend/);
  const two = addF(fx.root, 'Two', 'backend,frontend');
  setStage(fx.root, two, 'planned');
  assert.equal(disp(fx.root, two, '--repo', 'backend').role, 'builder', 'frontend has no lead');
  ok(cli(fx.root, 'team', 'set', 'lead', '--enabled', 'false'));
  assert.equal(disp(fx.root, id).role, 'builder', 'disabled lead -> builder');
  setStage(fx.root, id, 'verifying');
  ok(cli(fx.root, 'team', 'set', 'verifier', '--enabled', 'false'));
  d = disp(fx.root, id);
  assert.deepEqual([d.role, d.agent, d.covered_by], ['pm', null, 'pm']);
  setStage(fx.root, id, 'done');
  bad(cli(fx.root, 'dispatch', id), /done/);
  const dr = addF(fx.root, 'Dropped');
  ok(cli(fx.root, 'feature', 'drop', dr, '--reason', 'no'));
  bad(cli(fx.root, 'dispatch', dr), /dropped/);
  fx.cleanup();
});

test('P2-11. dispatch prompt carries rework round, role questions and stays under 1,200 chars', () => {
  const fx = setup();
  const id = addF(fx.root, 'X'.repeat(200), 'backend');
  fs.mkdirSync(path.join(fx.root, 'specs', '001-x'), { recursive: true });
  setStage(fx.root, id, 'defined');
  ok(cli(fx.root, 'question', 'add', 'Which auth provider should we use for the portal?', '--feature', id, '--to', 'product'));
  ok(cli(fx.root, 'question', 'add', 'Business question?', '--feature', id, '--to', 'user'));
  for (let i = 0; i < 12; i++) ok(cli(fx.root, 'question', 'add', `Long question number ${i} `.padEnd(120, 'z'), '--feature', id, '--to', 'product'));
  const d = disp(fx.root, id);
  assert.equal(d.role, 'product');
  assert.ok(d.questions.includes('Q-1') && !d.questions.includes('Q-2'), 'only questions addressed to the role');
  assert.ok(d.prompt.length <= 1200);
  assert.match(d.prompt, /short/);
  assert.match(d.prompt, /subagent contract/);
  const one = disp(fx.root, id, '--question', 'Q-1');
  assert.deepEqual(one.questions, ['Q-1']);
  bad(cli(fx.root, 'dispatch', id, '--question', 'Q-99'), /open question/);
  setStage(fx.root, id, 'verifying', { spec_dir: 'specs/001-x' });
  ok(cli(fx.root, 'rework', 'start', id, '--reason', 'fix the thing'));
  assert.match(disp(fx.root, id).prompt, /rework round 1/);
  fx.cleanup();
});
