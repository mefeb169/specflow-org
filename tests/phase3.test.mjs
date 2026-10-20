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
