import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeFixture, cli, cliEnv, hook, sh, w } from './make-fixture.mjs';

const j = (root, ...a) => { const r = cli(root, ...a, '--json'); assert.equal(r.code, 0, r.err); return JSON.parse(r.out); };
const bl = (root) => path.join(root, '.specflow', 'backlog.json');
const cf = (root) => path.join(root, '.specflow', 'config.json');
const readBacklog = (root) => JSON.parse(fs.readFileSync(bl(root), 'utf8'));
const readCfg = (root) => JSON.parse(fs.readFileSync(cf(root), 'utf8'));
const writeCfg = (root, c) => fs.writeFileSync(cf(root), JSON.stringify(c, null, 2) + '\n');
const patchBacklog = (root, fn) => { const b = readBacklog(root); fn(b); fs.writeFileSync(bl(root), JSON.stringify(b)); };
const patchCfg = (root, fn) => { const c = readCfg(root); fn(c); writeCfg(root, c); };
const ok = (r) => { assert.equal(r.code, 0, r.err || r.out); return r; };
const bad = (r, re) => { assert.notEqual(r.code, 0, r.out); if (re) assert.match(r.err + r.out, re); return r; };
const dec = (r) => r.json?.hookSpecificOutput?.permissionDecision ?? null;
const evidenceText = (root, spec = '001-x') => fs.readFileSync(path.join(root, 'specs', spec, 'verification.md'), 'utf8');

// Fake gh: records its arguments and keeps PRs in a JSON file. No network, never the real gh.
const FAKE_GH = `import fs from 'node:fs';
import path from 'node:path';
const a = process.argv.slice(2);
const log = process.env.FAKE_GH_LOG; const stateFile = process.env.FAKE_GH_STATE;
const st = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : { n: 0, prs: {} };
const repo = path.basename(process.cwd());
const key = (b) => repo + ':' + b;
const save = () => fs.writeFileSync(stateFile, JSON.stringify(st));
const entry = { cwd: process.cwd(), args: a };
if (a[1] === 'create') { const i = a.indexOf('--body-file'); entry.body = i >= 0 ? fs.readFileSync(a[i + 1], 'utf8') : ''; }
fs.appendFileSync(log, JSON.stringify(entry) + '\\n');
if (a[0] === 'pr' && a[1] === 'view') {
  const p = st.prs[key(a[2])];
  if (!p) { console.error('no pull requests found for branch "' + a[2] + '"'); process.exit(1); }
  console.log(JSON.stringify({ url: p.url, state: p.state, number: p.number }));
} else if (a[0] === 'pr' && a[1] === 'create') {
  if (process.env.FAKE_GH_FAIL_CREATE) { console.error('gh: create refused'); process.exit(1); }
  const head = a[a.indexOf('--head') + 1];
  st.n += 1;
  st.prs[key(head)] = { url: 'https://example.test/' + repo + '/pull/' + st.n, state: 'OPEN', number: st.n };
  save();
  console.log(st.prs[key(head)].url);
} else if (a[0] === 'pr' && a[1] === 'merge') {
  const p = Object.entries(st.prs).find(([k, v]) => k.startsWith(repo + ':') && String(v.number) === a[2]);
  if (!p) { console.error('no such pr'); process.exit(1); }
  p[1].state = 'MERGED'; save(); console.log('merged');
} else { console.error('unsupported'); process.exit(2); }
`;

// Workspace with a verified, accepted item on branch 001-x in backend (and optionally frontend), pushing to local bare repos.
function setup({ both = false, mode } = {}) {
  const fx = makeFixture();
  ok(cli(fx.root, 'init'));
  const tools = fs.mkdtempSync(path.join(os.tmpdir(), 'specflow-gh-'));
  const script = path.join(tools, 'fake-gh.mjs');
  fs.writeFileSync(script, FAKE_GH);
  const env = { SPECFLOW_GH: `"${process.execPath}" "${script}"`, FAKE_GH_LOG: path.join(tools, 'gh.log'), FAKE_GH_STATE: path.join(tools, 'gh.json') };
  const repos = both ? ['backend', 'frontend'] : ['backend'];
  const bare = {};
  for (const r of repos) {
    const dir = fx[r === 'backend' ? 'be' : 'fe'];
    bare[r] = path.join(tools, `${r}.git`);
    sh(tools, 'git', ['init', '--bare', '-q', bare[r]]);
    sh(dir, 'git', ['remote', 'add', 'origin', bare[r]]);
    sh(dir, 'git', ['switch', '-c', '001-x']);
  }
  ok(cli(fx.root, 'feature', 'add', '--title', 'Thing', '--summary', 'AC', '--value', 'v', '--repos', repos.join(',')));
  w(path.join(fx.root, 'specs', '001-x', 'spec.md'), '# spec\n');
  patchBacklog(fx.root, (b) => { const f = b.features[0]; f.stage = 'accepted'; f.spec_dir = 'specs/001-x'; f.branches = Object.fromEntries(repos.map((r) => [r, '001-x'])); });
  patchCfg(fx.root, (c) => { c.delivery = { mode: mode || 'push-pr', target_branch: 'main', pr_tool: 'gh' }; });
  for (const r of repos) ok(cli(fx.root, 'evidence', 'add', 'F-001', '--kind', 'test', '--repo', r, '--result', 'pass', '--note', 'ok'));
  const run = (...a) => cliEnv(fx.root, env, ...a);
  const gh = () => (fs.existsSync(env.FAKE_GH_LOG) ? fs.readFileSync(env.FAKE_GH_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const prs = () => (fs.existsSync(env.FAKE_GH_STATE) ? JSON.parse(fs.readFileSync(env.FAKE_GH_STATE, 'utf8')) : { n: 0, prs: {} });
  const setPr = (fn) => { const s = prs(); fn(s); fs.writeFileSync(env.FAKE_GH_STATE, JSON.stringify(s)); };
  const remoteBranches = (r) => sh(tools, 'git', ['--git-dir', bare[r], 'branch', '--list']).replace(/\*/g, '').trim();
  return { fx, env, run, gh, prs, setPr, bare, tools, remoteBranches, cleanup: () => { fx.cleanup(); fs.rmSync(tools, { recursive: true, force: true }); } };
}
const commit = (dir, name = 'x.txt') => { fs.writeFileSync(path.join(dir, name), String(Math.random())); sh(dir, 'git', ['add', '-A']); sh(dir, 'git', ['commit', '-q', '-m', 'work']); };

test('P3-1. deliver refuses: commit mode, and every precondition with a list', () => {
  const t = setup();
  const { fx, run } = t;
  patchCfg(fx.root, (c) => { c.delivery.mode = 'commit'; });
  bad(run('deliver', 'F-001'), /delivery mode is commit: pushing and PRs are done by you/);
  patchCfg(fx.root, (c) => { c.delivery.mode = 'push-pr'; });
  patchBacklog(fx.root, (b) => { b.features[0].stage = 'verifying'; });
  bad(run('deliver', 'F-001'), /stage is verifying/);
  patchBacklog(fx.root, (b) => { const f = b.features[0]; f.stage = 'accepted'; f.rework = [{ n: 1, reason: 'x', at: 'now', closed_at: null }]; f.blockers = [{ id: 'B-1', kind: 'external', text: 't', open: true }]; });
  const r = bad(run('deliver', 'F-001'));
  assert.match(r.err, /rework round 1 is open/);
  assert.match(r.err, /1 open blocker/);
  patchBacklog(fx.root, (b) => { const f = b.features[0]; f.rework = []; f.blockers = []; });
  // dirty + stale evidence + no origin, all reported together
  commit(fx.be);
  fs.writeFileSync(path.join(fx.be, 'dirty.txt'), 'x');
  sh(fx.be, 'git', ['remote', 'remove', 'origin']);
  const e = bad(run('deliver', 'F-001')).err;
  assert.match(e, /verification is stale/);
  assert.match(e, /uncommitted changes/);
  assert.match(e, /no "origin" remote/);
  sh(fx.be, 'git', ['switch', '-q', '-c', 'other']);
  assert.match(bad(run('deliver', 'F-001')).err, /on branch other, the item's branch is 001-x/);
  assert.deepEqual(t.gh(), [], 'gh was never called');
  t.cleanup();
});

test('P3-2. deliver --dry-run changes nothing and prints the plan', () => {
  const t = setup();
  const before = fs.readFileSync(bl(t.fx.root), 'utf8');
  const d = JSON.parse(ok(t.run('deliver', 'F-001', '--dry-run', '--json')).out);
  assert.equal(d.dry_run, true);
  assert.equal(d.repos[0].action, 'create');
  assert.equal(d.repos[0].target, 'main');
  assert.equal(fs.readFileSync(bl(t.fx.root), 'utf8'), before);
  assert.equal(t.remoteBranches('backend'), '', 'nothing pushed');
  assert.ok(!t.gh().some((c) => c.args[1] === 'create'));
  assert.match(ok(t.run('deliver', 'F-001', '--dry-run')).out, /PR create -> main/);
  t.cleanup();
});

test('P3-3. deliver pushes to the bare remote, opens one PR, records it; a second deliver updates the same PR', () => {
  const t = setup();
  const { fx, run } = t;
  ok(run('deliver', 'F-001'));
  assert.match(t.remoteBranches('backend'), /001-x/);
  const create = t.gh().filter((c) => c.args[1] === 'create');
  assert.equal(create.length, 1);
  const a = create[0].args;
  assert.deepEqual([a[a.indexOf('--base') + 1], a[a.indexOf('--head') + 1], a[a.indexOf('--title') + 1]], ['main', '001-x', 'F-001 Thing']);
  assert.ok(!a.includes('--force'));
  assert.match(create[0].body, /Generated by specflow deliver/);
  assert.match(create[0].body, /\| backend \| pass \|/);
  assert.ok(create[0].body.split('\n').length < 40);
  const f = readBacklog(fx.root).features[0];
  assert.equal(f.delivery.backend.pr_state, 'OPEN');
  assert.equal(f.delivery.backend.pr_number, 1);
  assert.equal(f.delivery.backend.branch, '001-x');
  assert.equal(f.delivery.backend.pushed_sha, sh(fx.be, 'git', ['rev-parse', 'HEAD']));
  assert.match(evidenceText(fx.root), /· delivery · backend[\s\S]*https:\/\/example\.test\/backend\/pull\/1/);
  assert.match(fs.readFileSync(path.join(fx.root, 'specs', '001-x', 'handoff.md'), 'utf8'), /## Delivery[\s\S]*pull\/1 \(OPEN\)/);
  assert.match(ok(run('status', 'F-001')).out, /delivery backend: .*pull\/1 \(OPEN\)/);
  // second delivery after a new verified commit: the same PR is reused
  commit(fx.be);
  ok(cli(fx.root, 'evidence', 'add', 'F-001', '--kind', 'test', '--repo', 'backend', '--result', 'pass'));
  const out = ok(run('deliver', 'F-001')).out;
  assert.match(out, /backend: updated/);
  assert.equal(t.gh().filter((c) => c.args[1] === 'create').length, 1, 'no second PR');
  assert.equal(readBacklog(fx.root).features[0].delivery.backend.pushed_sha, sh(fx.be, 'git', ['rev-parse', 'HEAD']));
  t.cleanup();
});

test('P3-4. deliver refuses a MERGED or CLOSED PR for the branch and needs a target branch', () => {
  const t = setup();
  ok(t.run('deliver', 'F-001'));
  for (const state of ['MERGED', 'CLOSED']) {
    t.setPr((s) => { s.prs['backend:001-x'].state = state; });
    const r = bad(t.run('deliver', 'F-001'));
    assert.match(r.out, new RegExp(`backend: refused.*${state}`));
  }
  assert.equal(t.gh().filter((c) => c.args[1] === 'create').length, 1);
  // no target branch anywhere
  const u = setup();
  patchCfg(u.fx.root, (c) => { c.delivery.target_branch = null; });
  assert.match(bad(u.run('deliver', 'F-001', '--dry-run')).out, /no target branch/);
  // origin/HEAD fallback
  sh(u.fx.be, 'git', ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk']);
  assert.equal(JSON.parse(ok(u.run('deliver', 'F-001', '--dry-run', '--json')).out).repos[0].target, 'trunk');
  t.cleanup(); u.cleanup();
});

test('P3-5. partial failure: other repos still run, exit code 1', () => {
  const t = setup({ both: true });
  sh(t.fx.fe, 'git', ['remote', 'set-url', 'origin', path.join(t.tools, 'does-not-exist.git')]);
  const r = t.run('deliver', 'F-001');
  assert.equal(r.code, 1);
  assert.match(r.out, /backend: created/);
  assert.match(r.out, /frontend: failed - git push failed/);
  const f = readBacklog(t.fx.root).features[0];
  assert.ok(f.delivery.backend);
  assert.equal(f.delivery.frontend, undefined);
  // gh failure after a successful push is reported too
  const u = setup();
  const r2 = cliEnv(u.fx.root, { ...u.env, FAKE_GH_FAIL_CREATE: '1' }, 'deliver', 'F-001');
  assert.equal(r2.code, 1);
  assert.match(r2.out, /gh pr create failed \(branch was pushed\)/);
  t.cleanup(); u.cleanup();
});

test('P3-6. deliver status refreshes PR state and records merge evidence once; merge mode and gate checks', () => {
  const t = setup({ both: true });
  ok(t.run('deliver', 'F-001'));
  assert.match(ok(t.run('deliver', 'status', 'F-001')).out, /backend .*OPEN/);
  assert.ok(!/· merge ·/.test(evidenceText(t.fx.root)));
  bad(t.run('deliver', 'merge', 'F-001'), /delivery mode is push-pr/);
  t.setPr((s) => { for (const p of Object.values(s.prs)) p.state = 'MERGED'; });
  ok(t.run('deliver', 'status', 'F-001'));
  ok(t.run('deliver', 'status', 'F-001'));
  assert.equal(evidenceText(t.fx.root).split('· merge ·').length - 1, 1, 'merge evidence recorded once');
  assert.equal(readBacklog(t.fx.root).features[0].delivery.backend.pr_state, 'MERGED');
  t.cleanup();

  const m = setup({ both: true, mode: 'push-pr-merge' });
  ok(m.run('deliver', 'F-001'));
  bad(m.run('deliver', 'merge', 'F-001'), /acceptance gate/);
  ok(cli(m.fx.root, 'gate', 'approve', 'F-001', 'acceptance'));
  const out = ok(m.run('deliver', 'merge', 'F-001')).out;
  assert.match(out, /backend: merged/);
  assert.match(out, /all pull requests are merged/);
  const merges = m.gh().filter((c) => c.args[1] === 'merge');
  assert.equal(merges.length, 2);
  for (const c of merges) assert.deepEqual(c.args.filter((x) => x.startsWith('--')), ['--merge'], 'no --admin, no --delete-branch');
  assert.equal(evidenceText(m.fx.root).split('· merge ·').length - 1, 1);
  assert.match(ok(m.run('deliver', 'merge', 'F-001')).out, /skipped - PR is MERGED/);
  m.cleanup();
});

test('P3-7. deliver is refused during a rework round', () => {
  const t = setup();
  ok(t.run('deliver', 'F-001'));
  ok(cli(t.fx.root, 'rework', 'start', 'F-001', '--reason', 'review findings'));
  bad(t.run('deliver', 'F-001'), /rework round 1 is open/);
  assert.equal(t.gh().filter((c) => c.args[1] === 'create').length, 1);
  t.cleanup();
});

test('P3-8. guard: deliver asks in the main session, is denied unattended and for subagents; status and --dry-run are free', () => {
  const t = setup();
  const root = t.fx.root;
  const run = (command, extra = {}) => hook('pre-tool-use', root, { tool_name: 'Bash', tool_input: { command }, ...extra });
  const cmd = 'node ".../specflow.mjs" deliver F-001';
  assert.equal(dec(run(cmd)), 'ask');
  assert.match(run(cmd).json.hookSpecificOutput.permissionDecisionReason, /F-001/);
  assert.equal(dec(run('specflow deliver merge F-001')), 'ask');
  assert.equal(dec(run(cmd, { permission_mode: 'bypassPermissions' })), 'deny');
  assert.equal(dec(run(cmd, { agent_id: 'a1' })), 'deny');
  assert.equal(dec(run('specflow deliver F-001 --dry-run', { agent_id: 'a1' })), null);
  assert.equal(dec(run('specflow deliver status F-001', { agent_id: 'a1' })), null);
  assert.equal(dec(run('specflow deliver status F-001')), null);
  assert.equal(dec(run('specflow deliver F-001 --dry-run')), null);
  t.cleanup();
});

// ---------- release configuration ----------
const rel = (root) => readCfg(root).release;

test('P3-9. release step add/rm/list, defaults, validation and settings', () => {
  const t = setup();
  const { fx } = t;
  const c = (...a) => cli(fx.root, 'release', ...a);
  assert.match(c('step', 'list').out, /no release steps/);
  ok(c('step', 'add', 'deploy-backend', '--run', 'node -e "0"', '--repo', 'backend', '--kind', 'deploy', '--approval', 'none', '--timeout', '30'));
  ok(c('step', 'add', 'migrate-db', '--run', 'node -e "0"', '--repo', 'backend', '--kind', 'migrate', '--approval', 'none'));
  ok(c('step', 'add', 'plain', '--run', 'node -e "0"'));
  ok(c('step', 'add', 'health', '--run', 'node -e "0"', '--post'));
  const r = rel(fx.root);
  assert.deepEqual(r.steps[0], { name: 'deploy-backend', repo: 'backend', run: 'node -e "0"', kind: 'deploy', approval: 'none', timeout_s: 30 });
  assert.deepEqual([r.steps[2].kind, r.steps[2].approval, r.steps[2].timeout_s, r.steps[2].repo], ['deploy', 'ask', 900, undefined]);
  assert.deepEqual(r.post_release, [{ name: 'health', run: 'node -e "0"', timeout_s: 120 }]);
  const l = JSON.parse(c('step', 'list', '--json').out);
  assert.equal(l.steps.find((s) => s.name === 'migrate-db').approval, 'ask', 'migrate is always asked');
  bad(c('step', 'add', 'plain', '--run', 'x'), /already exists/);
  bad(c('step', 'add', 'n1', '--run', 'x', '--repo', 'ghost'), /Unknown repo/);
  bad(c('step', 'add', 'n2', '--run', 'x', '--kind', 'party'), /--kind/);
  bad(c('step', 'add', 'n3', '--run', 'x', '--approval', 'maybe'), /--approval/);
  bad(c('step', 'add', 'n4', '--run', 'x', '--timeout', '0'), /--timeout/);
  bad(c('step', 'add', 'n5'), /--run/);
  bad(c('step', 'rm', 'ghost'), /unknown step/);
  ok(c('step', 'rm', 'plain'));
  ok(c('step', 'rm', 'health', '--post'));
  assert.deepEqual([rel(fx.root).steps.length, rel(fx.root).post_release.length], [2, 0]);
  ok(c('set', '--by-ai', 'true'));
  ok(c('set', '--require-merged', 'false'));
  assert.deepEqual([rel(fx.root).by_ai, rel(fx.root).require_merged], [true, false]);
  bad(c('set', '--by-ai', 'maybe'), /--by-ai/);
  bad(c('set'), /give --by-ai/);
  assert.equal(j(fx.root, 'validate').ok, true);
  patchCfg(fx.root, (x) => { x.release.steps.push({ name: 'deploy-backend', run: 'x', kind: 'zzz' }, { name: 'q', run: 'x', repo: 'ghost' }); });
  const v = JSON.parse(cli(fx.root, 'validate', '--json').out);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /duplicate name/.test(e)) && v.errors.some((e) => /kind must be/.test(e)) && v.errors.some((e) => /unknown repo "ghost"/.test(e)));
  t.cleanup();
});

// ---------- release runs ----------
const MERGED = { branch: '001-x', pushed_sha: 'abc', pr_url: 'https://example.test/backend/pull/1', pr_number: 1, pr_state: 'MERGED', at: 'now' };
const logCmd = (tag) => `node -e "require('fs').appendFileSync('ran.log','${tag};')"`;
const ran = (root) => (fs.existsSync(path.join(root, 'ran.log')) ? fs.readFileSync(path.join(root, 'ran.log'), 'utf8') : '');

// An accepted item whose acceptance gate is approved and whose PR is merged, with three harmless steps.
function releaseSetup(opts = {}) {
  const t = setup(opts);
  patchBacklog(t.fx.root, (b) => { const f = b.features[0]; f.gates.acceptance = { approved_at: 'now', by: 'human', note: '' }; f.delivery = { backend: { ...MERGED } }; });
  patchCfg(t.fx.root, (c) => {
    c.release = {
      by_ai: true,
      require_merged: true,
      steps: [
        { name: 's1', run: logCmd('s1'), kind: 'deploy', approval: 'none', timeout_s: 30 },
        { name: 's2', run: logCmd('s2'), kind: 'migrate', approval: 'none', timeout_s: 30 },
        { name: 's3', run: logCmd('s3'), kind: 'smoke', approval: 'none', timeout_s: 30 },
      ],
      post_release: [{ name: 'health', run: 'node -e "process.exit(0)"', timeout_s: 30 }],
    };
  });
  return t;
}

test('P3-10. release plan writes release.md (also with release by AI off) and keeps the rollback notes', () => {
  const t = releaseSetup();
  patchCfg(t.fx.root, (c) => { c.release.by_ai = false; });
  const out = ok(cli(t.fx.root, 'release', 'plan', 'F-001')).out;
  assert.match(out, /Wrote specs\/001-x\/release.md/);
  const file = path.join(t.fx.root, 'specs', '001-x', 'release.md');
  let md = fs.readFileSync(file, 'utf8');
  assert.match(md, /Release by AI: no/);
  assert.match(md, /backend: https:\/\/example.test\/backend\/pull\/1 \(MERGED\)/);
  assert.match(md, /1\. s1 \[deploy, approval: none\]/);
  assert.match(md, /2\. s2 \[migrate, approval: ask\]/, 'migrate is always asked');
  assert.match(md, /## Post-release checks\n1\. health/);
  assert.match(md, /## Rollback\n\(to be filled/);
  assert.match(md, /Generated by specflow release plan\n$/);
  fs.writeFileSync(file, md.replace(/\(to be filled[^\n]*\)/, 'Undo: redeploy the previous tag.'));
  ok(cli(t.fx.root, 'release', 'plan', 'F-001'));
  md = fs.readFileSync(file, 'utf8');
  assert.match(md, /## Rollback\nUndo: redeploy the previous tag\.\n\nGenerated by specflow release plan/);
  t.cleanup();
});

test('P3-11. release run preconditions: each refusal', () => {
  const t = releaseSetup();
  const { fx } = t;
  const run = () => cli(fx.root, 'release', 'run', 'F-001');
  patchCfg(fx.root, (c) => { c.release.by_ai = false; });
  bad(run(), /release by AI is off/);
  patchCfg(fx.root, (c) => { c.release.by_ai = true; });
  patchBacklog(fx.root, (b) => { const f = b.features[0]; f.stage = 'verifying'; });
  bad(run(), /releasing runs from accepted/);
  patchBacklog(fx.root, (b) => { const f = b.features[0]; f.stage = 'accepted'; f.gates.acceptance = null; f.blockers = [{ id: 'B-1', kind: 'external', text: 't', open: true }]; });
  const e = bad(run()).err;
  assert.match(e, /acceptance gate is not approved/);
  assert.match(e, /1 open blocker/);
  patchBacklog(fx.root, (b) => { const f = b.features[0]; f.gates.acceptance = { approved_at: 'now', by: 'human' }; f.blockers = []; f.delivery.backend.pr_state = 'OPEN'; });
  bad(run(), /backend: PR is OPEN, not MERGED/);
  patchBacklog(fx.root, (b) => { b.features[0].delivery = {}; });
  bad(run(), /backend: no delivered PR/);
  patchCfg(fx.root, (c) => { c.release.require_merged = false; c.release.steps = []; });
  bad(run(), /no release steps configured/);
  assert.equal(ran(fx.root), '', 'nothing ran');
  t.cleanup();
});

test('P3-12. release run: stops at the first approval step, --step, progress skip, --again, released needs every step', () => {
  const t = releaseSetup();
  const { fx } = t;
  const c = (...a) => cli(fx.root, 'release', ...a);
  const r1 = ok(c('run', 'F-001')).out;
  assert.match(r1, /s1: PASS/);
  assert.match(r1, /s2 needs approval: .*release run F-001 --step s2/);
  assert.equal(ran(fx.root), 's1;', 'ran s1 and stopped before the migrate step');
  assert.ok(!/s3/.test(ran(fx.root)));
  assert.equal(readBacklog(fx.root).features[0].release_progress.s1.result, 'pass');
  assert.match(evidenceText(fx.root), /· release · all[\s\S]*- result: pass[\s\S]*- note: s1/);
  // released needs every configured step
  ok(cli(fx.root, 'gate', 'approve', 'F-001', 'acceptance'));
  const blocked = bad(cli(fx.root, 'stage', 'set', 'F-001', 'released')).err;
  assert.match(blocked, /release step "s2" has not passed/);
  assert.match(blocked, /release step "s3" has not passed/);
  // --step runs exactly that step
  ok(c('run', 'F-001', '--step', 's2'));
  assert.equal(ran(fx.root), 's1;s2;');
  bad(c('run', 'F-001', '--step', 's2'), /already passed; use --again/);
  bad(c('run', 'F-001', '--step', 'ghost'), /unknown release step/);
  // a plain run skips what passed and finishes the rest
  const r3 = ok(c('run', 'F-001')).out;
  assert.match(r3, /s1: already passed, skipped/);
  assert.match(r3, /all release steps passed: run `specflow stage set F-001 released`/);
  assert.equal(ran(fx.root), 's1;s2;s3;');
  ok(c('run', 'F-001', '--step', 's1', '--again'));
  assert.equal(ran(fx.root), 's1;s2;s3;s1;');
  ok(cli(fx.root, 'stage', 'set', 'F-001', 'released'));
  t.cleanup();
});

test('P3-13. a failing step stops the run, records failing evidence, and is retried on the next run', () => {
  const t = releaseSetup();
  const { fx } = t;
  patchCfg(fx.root, (c) => { c.release.steps[0].run = 'node -e "console.log(\'boom\'); process.exit(3)"'; });
  const r = cli(fx.root, 'release', 'run', 'F-001');
  assert.equal(r.code, 1);
  assert.match(r.out, /s1: FAIL \(exit 3\)/);
  assert.match(r.out, /boom/);
  assert.equal(ran(fx.root), '');
  const f = readBacklog(fx.root).features[0];
  assert.equal(f.release_progress.s1.result, 'fail');
  assert.match(evidenceText(fx.root), /· release · all[\s\S]*- exit_code: 3[\s\S]*- result: fail/);
  patchCfg(fx.root, (c) => { c.release.steps[0].run = logCmd('s1'); });
  ok(cli(fx.root, 'release', 'run', 'F-001'));
  assert.equal(ran(fx.root), 's1;', 'failed step ran again');
  t.cleanup();
});

test('P3-14. release verify runs post-release checks at released and records evidence per check', () => {
  const t = releaseSetup();
  const { fx } = t;
  bad(cli(fx.root, 'release', 'verify', 'F-001'), /runs at stage released/);
  patchBacklog(fx.root, (b) => { b.features[0].stage = 'released'; });
  patchCfg(fx.root, (c) => { c.release.post_release.push({ name: 'bad', run: 'node -e "process.exit(2)"', timeout_s: 30 }); });
  const r = cli(fx.root, 'release', 'verify', 'F-001');
  assert.equal(r.code, 1);
  assert.match(r.out, /health: PASS/);
  assert.match(r.out, /bad: FAIL \(exit 2\)/);
  const ev = evidenceText(fx.root);
  assert.match(ev, /· post-release · all[\s\S]*- result: pass[\s\S]*- note: health/);
  assert.match(ev, /· post-release · all[\s\S]*- result: fail[\s\S]*- note: bad/);
  patchCfg(fx.root, (c) => { c.release.post_release = []; });
  bad(cli(fx.root, 'release', 'verify', 'F-001'), /no post-release checks/);
  t.cleanup();
});

test('P3-15. guard: release run and verify ask (with step names), deny unattended and for subagents; plan and step list are free', () => {
  const t = releaseSetup();
  const root = t.fx.root;
  const run = (command, extra = {}) => hook('pre-tool-use', root, { tool_name: 'Bash', tool_input: { command }, ...extra });
  const base = 'node ".../specflow.mjs" release';
  assert.equal(dec(run(`${base} run F-001`)), 'ask');
  assert.match(run(`${base} run F-001`).json.hookSpecificOutput.permissionDecisionReason, /s1/);
  assert.match(run(`${base} run F-001 --step s2`).json.hookSpecificOutput.permissionDecisionReason, /s2/);
  assert.match(run(`${base} verify F-001`).json.hookSpecificOutput.permissionDecisionReason, /health/);
  assert.equal(dec(run(`${base} run F-001`, { permission_mode: 'dontAsk' })), 'deny');
  assert.equal(dec(run(`${base} run F-001`, { agent_id: 'a1' })), 'deny');
  assert.equal(dec(run(`${base} verify F-001`, { agent_id: 'a1' })), 'deny');
  for (const free of ['release plan F-001', 'release step list', 'release step add x --run y']) assert.equal(dec(run(`${'specflow'} ${free}`, { agent_id: 'a1' })), null, free);
  t.cleanup();
});

// ---------- release role, dispatch, setup, migration ----------
const roleOf = (team, r) => team.roles.find((x) => x.role === r);
const disp = (root, ...a) => JSON.parse(ok(cli(root, 'dispatch', ...a, '--json')).out);
const AGENTS = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'plugins', 'specflow', 'agents');

test('P3-16. release role: agent file, default off, follows release.by_ai unless locked', () => {
  const t = setup();
  const { fx } = t;
  const text = fs.readFileSync(path.join(AGENTS, 'release-manager.md'), 'utf8');
  assert.match(text, /^---\nname: release-manager\n/);
  assert.match(text, /\nmodel: sonnet\n/);
  assert.doesNotMatch(text.split('\n---\n')[0], /Agent/);
  assert.match(text, /## Subagent contract/);
  assert.match(text, /never add them yourself/i);
  assert.match(text, /Never run `release run`/);
  let team = j(fx.root, 'team');
  assert.deepEqual([roleOf(team, 'release').enabled, roleOf(team, 'release').model, roleOf(team, 'release').agent], [false, 'sonnet', 'specflow:release-manager']);
  ok(cli(fx.root, 'release', 'set', '--by-ai', 'true'));
  assert.equal(roleOf(j(fx.root, 'team'), 'release').enabled, true);
  ok(cli(fx.root, 'release', 'set', '--by-ai', 'false'));
  assert.equal(roleOf(j(fx.root, 'team'), 'release').enabled, false);
  ok(cli(fx.root, 'team', 'set', 'release', '--enabled', 'true'));
  ok(cli(fx.root, 'release', 'set', '--by-ai', 'false'));
  assert.equal(roleOf(j(fx.root, 'team'), 'release').enabled, true, 'a role set by hand keeps its setting');
  assert.equal(j(fx.root, 'validate').ok, true);
  t.cleanup();
});

test('P3-17. dispatch: accepted + acceptance gate goes to the release role (or the PM); testing line for builder, lead, verifier', () => {
  const t = setup();
  const { fx } = t;
  let d = disp(fx.root, 'F-001');
  assert.equal(d.role, 'product', 'accepted without the gate: product');
  patchBacklog(fx.root, (b) => { b.features[0].gates.acceptance = { approved_at: 'now', by: 'human' }; });
  d = disp(fx.root, 'F-001');
  assert.equal(d.role, 'pm');
  assert.equal(d.requested_role, 'release');
  assert.match(d.prompt, /specflow deliver/);
  ok(cli(fx.root, 'release', 'set', '--by-ai', 'true'));
  d = disp(fx.root, 'F-001');
  assert.deepEqual([d.role, d.agent, d.model], ['release', 'specflow:release-manager', 'sonnet']);
  assert.match(d.prompt, /Release: 0 step\(s\) configured \(propose some/);
  assert.match(d.prompt, /specs\/001-x\/release\.md/);
  assert.match(d.prompt, /Never run release run/);
  assert.ok(d.prompt.length <= 1200);
  // testing line
  patchBacklog(fx.root, (b) => { b.features[0].stage = 'implementing'; });
  d = disp(fx.root, 'F-001');
  assert.equal(d.role, 'builder');
  assert.match(d.prompt, /Testing: unit tests required: yes\./);
  assert.doesNotMatch(d.prompt, /Test data rules/);
  patchCfg(fx.root, (c) => { c.testing = { unit_required: false, data_rules: 'use yopmail.com addresses' }; });
  assert.match(disp(fx.root, 'F-001').prompt, /Testing: unit tests required: no\. Test data rules: use yopmail\.com addresses/);
  patchBacklog(fx.root, (b) => { b.features[0].stage = 'verifying'; });
  assert.match(disp(fx.root, 'F-001').prompt, /Testing: unit tests required: no\. Test data rules: use yopmail/);
  ok(cli(fx.root, 'team', 'lead', 'add', 'api', '--repos', 'backend'));
  patchBacklog(fx.root, (b) => { b.features[0].stage = 'implementing'; });
  d = disp(fx.root, 'F-001');
  assert.equal(d.role, 'lead');
  assert.match(d.prompt, /Testing: unit tests required: no/);
  assert.ok(d.prompt.length <= 1200);
  patchBacklog(fx.root, (b) => { b.features[0].stage = 'proposed'; });
  assert.doesNotMatch(disp(fx.root, 'F-001').prompt, /Testing:/, 'planning roles get no testing line');
  t.cleanup();
});

test('P3-18. setup: release.steps appears when release.by_ai is on; why texts describe real behavior', () => {
  const t = setup();
  const { fx } = t;
  const qs = j(fx.root, 'setup', 'questions');
  assert.ok(!qs.some((q) => q.id === 'release.steps'));
  const byAi = qs.find((q) => q.id === 'release.by_ai');
  assert.doesNotMatch(byAi.why, /later phase/);
  assert.match(byAi.why, /release role/);
  assert.match(qs.find((q) => q.id === 'testing.unit_required').why, /blocking finding/);
  assert.match(qs.find((q) => q.id === 'testing.data_rules').why, /builder, lead and verifier dispatch/);
  assert.match(qs.find((q) => q.id === 'tools.graphify').why, /Recorded only/);
  const file = path.join(fx.root, 'answers.json');
  fs.writeFileSync(file, JSON.stringify({ 'release.by_ai': 'yes', 'release.steps': 'draft from docs' }));
  ok(cli(fx.root, 'setup', 'apply', '--answers', file));
  assert.equal(readCfg(fx.root).release.by_ai, true);
  assert.equal(roleOf(j(fx.root, 'team'), 'release').enabled, true);
  const q2 = j(fx.root, 'setup', 'questions').find((q) => q.id === 'release.steps');
  assert.equal(q2.default, 'draft from docs');
  assert.match(q2.text, /Which commands deploy each repo\? The release role can draft them from your docs/);
  assert.ok(readCfg(fx.root).release.steps.length === 0, 'steps are only proposed, never added by setup');
  const st = j(fx.root, 'setup', 'status').find((x) => x.id === 'release.steps');
  assert.equal(st.answered, true);
  t.cleanup();
});

const V7 = { SPECFLOW_FAKE_FRAMEWORK_VERSION: '0.7.0' };
const up = (root, ...a) => JSON.parse(cliEnv(root, V7, 'upgrade', ...a, '--json').out);

test('P3-19. migration 0.7.0 from 0.6.0 is additive; chained from 0.4.0', () => {
  const t = setup();
  const { fx } = t;
  patchCfg(fx.root, (c) => {
    c.framework_version = '0.6.0';
    c.release = { by_ai: true };
    delete c.team.roles.release;
    c.autonomy = 'guided';
  });
  const dry = up(fx.root);
  assert.equal(dry.applied, false);
  assert.ok(dry.migrations.find((m) => m.to === '0.7.0').changes.length);
  assert.deepEqual(readCfg(fx.root).release, { by_ai: true }, 'dry run writes nothing');
  assert.equal(up(fx.root, '--apply').applied, true);
  const c = readCfg(fx.root);
  assert.equal(c.framework_version, '0.7.0');
  assert.deepEqual(c.release, { by_ai: true, steps: [], post_release: [], require_merged: true });
  assert.deepEqual(c.team.roles.release, { enabled: true, model: 'sonnet' });
  assert.equal(c.autonomy, 'guided');
  assert.equal(JSON.parse(cli(fx.root, 'validate', '--json').out).ok, true);
  assert.equal(up(fx.root, '--apply').migrations.length, 0, 'idempotent');
  t.cleanup();

  const u = setup();
  patchCfg(u.fx.root, (c) => {
    c.framework_version = '0.4.0'; c.schema_version = 1;
    for (const k of ['current_milestone', 'slicing', 'lanes', 'team', 'delivery', 'release', 'testing', 'tools']) delete c[k];
  });
  fs.rmSync(path.join(u.fx.root, '.specflow', 'memory.json'), { force: true });
  const r = up(u.fx.root, '--apply');
  assert.deepEqual(r.migrations.map((m) => m.to), ['0.5.0', '0.6.0', '0.7.0']);
  const after = readCfg(u.fx.root);
  assert.equal(after.framework_version, '0.7.0');
  assert.deepEqual(after.release, { by_ai: false, steps: [], post_release: [], require_merged: true });
  assert.equal(after.team.roles.release.enabled, false);
  u.cleanup();
});

// ---------- skills, docs, version ----------
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const readRepo = (...p) => fs.readFileSync(path.join(REPO, ...p), 'utf8');
const PLUGIN = ['plugins', 'specflow'];

test('P3-20. skills, docs and workspace block describe delivery and release', () => {
  const flow = readRepo(...PLUGIN, 'skills', 'flow', 'SKILL.md');
  assert.ok(Buffer.byteLength(flow) < 7000, `flow is ${Buffer.byteLength(flow)} bytes`);
  for (const re of [/deliver <id> --dry-run/, /deliver status/, /release plan/, /release run/, /release verify/, /never during a rework round/]) assert.match(flow, re);
  assert.match(readRepo(...PLUGIN, 'skills', 'verify', 'SKILL.md'), /testing\.unit_required[\s\S]*blocking finding/);
  assert.match(readRepo(...PLUGIN, 'skills', 'setup', 'SKILL.md'), /release\.steps/);
  assert.match(readRepo(...PLUGIN, 'skills', '_shared', 'lifecycle.md'), /Delivery and release \(PM only\)/);
  assert.match(readRepo(...PLUGIN, 'skills', '_shared', 'lifecycle.md'), /specflow:release-manager/);
  assert.match(readRepo(...PLUGIN, 'templates', 'workspace', 'claude-md-block.md'), /Pushes, PRs and releases go through `specflow deliver` and `specflow release`, run by the PM\./);
  const readme = readRepo('README.md');
  assert.match(readme, /## Releasing with specflow/);
  assert.doesNotMatch(readme.split('## Releasing with specflow')[1].split('## Updating')[0], /https?:\/\/|\.com\b/, 'neutral example: no real hosts');
  assert.match(readRepo('CHANGELOG.md'), /## \[0\.7\.0\]/);
  assert.match(readRepo('docs', 'architecture.md'), /A12\. Delivery and release pipelines/);
  assert.match(readRepo(...PLUGIN, 'agents', 'release-manager.md'), /release step add/);
});
