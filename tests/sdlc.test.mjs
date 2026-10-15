import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeFixture, cli, hook, w, sh, UX_MD } from './make-fixture.mjs';

const j = (root, ...a) => JSON.parse(cli(root, ...a, '--json').out);
const readBacklog = (root) => JSON.parse(fs.readFileSync(path.join(root, '.sdlc', 'backlog.json'), 'utf8'));

function setup() {
  const fx = makeFixture();
  const r = cli(fx.root, 'init');
  assert.equal(r.code, 0, r.err);
  return fx;
}

/** Adds a defined feature touching both repos; returns id. */
function addFeature(root, extra = []) {
  const out = cli(root, 'feature', 'add', '--title', 'Password reset', '--summary', 'AC: user can reset', '--value', 'retention', '--repos', 'backend,frontend', '--priority', 'P1', '--mvp', ...extra);
  assert.equal(out.code, 0, out.err);
  return out.out.trim();
}

function writeSpec(root, { clarify = false, plan = true, tasks = 'tagged', ux = true } = {}) {
  const dir = path.join(root, 'specs', '001-password-reset');
  if (ux) w(path.join(dir, 'ux.md'), UX_MD);
  w(path.join(dir, 'spec.md'), `# Spec\n${clarify ? '[NEEDS CLARIFICATION: token lifetime]\n' : ''}`);
  if (plan) w(path.join(dir, 'plan.md'), '# Plan\n## Repository Impact\n| backend | endpoints |\n');
  if (tasks === 'tagged') w(path.join(dir, 'tasks.md'), '- [ ] T001 [repo:backend] endpoint\n- [ ] T002 [repo:frontend] page\n');
  if (tasks === 'untagged') w(path.join(dir, 'tasks.md'), '- [ ] T001 endpoint\n');
  return dir;
}

function toStage(root, id, stage, order) {
  for (const s of order) {
    const r = cli(root, 'stage', 'set', id, s);
    assert.equal(r.code, 0, `${s}: ${r.err}`);
    if (s === stage) return;
  }
}

test('1. init preserves user content and is idempotent', () => {
  const fx = makeFixture();
  const first = cli(fx.root, 'init');
  assert.equal(first.code, 0, first.err);
  const claude = fs.readFileSync(path.join(fx.root, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /User content that must survive/);
  assert.match(claude, /<!-- sdlc:begin -->/);
  const cfgBefore = fs.readFileSync(path.join(fx.root, '.sdlc', 'config.json'), 'utf8');
  const second = cli(fx.root, 'init', '--json');
  assert.equal(second.code, 0, second.err);
  const res = JSON.parse(second.out);
  assert.equal(res.created.length, 0);
  assert.ok(res.skipped.length >= 4);
  assert.equal(res.claude_md, 'unchanged');
  assert.equal(fs.readFileSync(path.join(fx.root, 'CLAUDE.md'), 'utf8'), claude);
  assert.equal(fs.readFileSync(path.join(fx.root, '.sdlc', 'config.json'), 'utf8'), cfgBefore);
  fx.cleanup();
});

test('2. scan finds repos, manifests, contracts, migrations, instruction files', () => {
  const fx = setup();
  const scan = JSON.parse(fs.readFileSync(path.join(fx.root, '.sdlc', 'cache', 'scan.json'), 'utf8'));
  const names = scan.repos.map((r) => r.name).sort();
  assert.deepEqual(names, ['backend', 'frontend']);
  const be = scan.repos.find((r) => r.name === 'backend');
  assert.ok(be.manifests.some((m) => m.file === 'package.json' && m.scripts.includes('test')));
  assert.ok(be.contracts.includes('openapi.yaml'));
  assert.ok(be.data.some((d) => d.startsWith('migrations/')));
  assert.ok(be.instructions.includes('CLAUDE.md'));
  assert.ok(scan.repos.find((r) => r.name === 'frontend').instructions.includes('AGENTS.md'));
  assert.equal(be.command_candidates.test.cmd, 'npm test');
  fx.cleanup();
});

test('3. features, dependency cycles and next-ranking', () => {
  const fx = setup();
  const a = addFeature(fx.root);
  const b = cli(fx.root, 'feature', 'add', '--title', 'Profile page', '--repos', 'frontend').out.trim();
  assert.equal(cli(fx.root, 'dep', 'add', b, a, '--type', 'requires').code, 0);
  const cyc = cli(fx.root, 'dep', 'add', a, b, '--type', 'requires');
  assert.equal(cyc.code, 1);
  assert.match(cyc.err, /cycle/);
  assert.equal(cli(fx.root, 'dep', 'add', a, b, '--type', 'after').code, 0, 'soft dep never cycles');
  const n = j(fx.root, 'next');
  assert.equal(n.ready[0].id, a);
  assert.ok(!n.ready.some((x) => x.id === b));
  assert.match(n.not_ready.find((x) => x.id === b).held_by.join(' '), new RegExp(a));
  assert.ok(n.ready[0].reasons.some((r) => /MVP/.test(r)));
  fx.cleanup();
});

test('4. stage refusals are driven by real files and evidence', () => {
  const fx = setup();
  const id = addFeature(fx.root);
  assert.equal(cli(fx.root, 'stage', 'set', id, 'defined').code, 0);
  assert.equal(cli(fx.root, 'stage', 'set', id, 'implementing').code, 1, 'cannot skip stages');

  let r = cli(fx.root, 'stage', 'set', id, 'specified');
  assert.equal(r.code, 1);
  assert.match(r.err, /spec_dir|spec\.md/);

  const dir = writeSpec(fx.root, { clarify: true });
  assert.equal(cli(fx.root, 'feature', 'link', id, 'specs/001-password-reset').code, 0);
  r = cli(fx.root, 'stage', 'set', id, 'specified');
  assert.equal(r.code, 1);
  assert.match(r.err, /NEEDS CLARIFICATION/);
  fs.writeFileSync(path.join(dir, 'spec.md'), '# Spec clean\n');
  assert.equal(cli(fx.root, 'stage', 'set', id, 'specified').code, 0);

  r = cli(fx.root, 'stage', 'set', id, 'designed');
  assert.equal(r.code, 1);
  assert.match(r.err, /gate "spec"/);
  assert.equal(cli(fx.root, 'gate', 'approve', id, 'design').code, 1, 'gate only at its stage');
  assert.equal(cli(fx.root, 'gate', 'approve', id, 'spec').code, 0);
  assert.equal(cli(fx.root, 'stage', 'set', id, 'designed').code, 0);

  // planned with untagged tasks
  w(path.join(dir, 'tasks.md'), '- [ ] T001 endpoint without tag\n');
  assert.equal(cli(fx.root, 'gate', 'approve', id, 'design').code, 0);
  r = cli(fx.root, 'stage', 'set', id, 'planned');
  assert.equal(r.code, 1);
  assert.match(r.err, /no \[repo:/);
  w(path.join(dir, 'tasks.md'), '- [ ] T001 [repo:backend] endpoint\n- [ ] T002 [repo:frontend] page\n');
  assert.equal(cli(fx.root, 'check', 'tasks', id).code, 0);
  assert.equal(cli(fx.root, 'stage', 'set', id, 'planned').code, 0);

  // implementing needs gate + branches
  assert.equal(cli(fx.root, 'stage', 'set', id, 'implementing').code, 1);
  assert.equal(cli(fx.root, 'gate', 'approve', id, 'implement').code, 0);
  assert.equal(cli(fx.root, 'branches', 'create', id).code, 0);
  assert.equal(cli(fx.root, 'stage', 'set', id, 'implementing').code, 0);

  // verifying needs all tasks checked
  r = cli(fx.root, 'stage', 'set', id, 'verifying');
  assert.equal(r.code, 1);
  assert.match(r.err, /unchecked/);
  w(path.join(dir, 'tasks.md'), '- [X] T001 [repo:backend] endpoint\n- [X] T002 [repo:frontend] page\n');
  assert.equal(cli(fx.root, 'stage', 'set', id, 'verifying').code, 0);

  // accepted needs passing evidence at HEAD
  r = cli(fx.root, 'stage', 'set', id, 'accepted');
  assert.equal(r.code, 1);
  assert.match(r.err, /no test\/manual evidence/);
  for (const repo of ['backend', 'frontend']) {
    cli(fx.root, 'repo', 'set', repo, '--confirm');
    assert.equal(cli(fx.root, 'verify', 'run', id, '--repo', repo).code, 0);
  }
  r = cli(fx.root, 'stage', 'set', id, 'accepted');
  assert.equal(r.code, 1);
  assert.match(r.err, /review evidence/);
  assert.equal(cli(fx.root, 'evidence', 'add', id, '--kind', 'review', '--result', 'pass', '--note', 'ok').code, 0);
  r = cli(fx.root, 'stage', 'set', id, 'accepted');
  assert.equal(r.code, 1);
  assert.match(r.err, /ux-review/);
  assert.equal(cli(fx.root, 'evidence', 'add', id, '--kind', 'ux-review', '--repo', 'frontend', '--result', 'pass', '--note', 'manual: no screenshot').code, 0);

  // a new commit makes the evidence stale
  w(path.join(fx.be, 'src', 'index.js'), 'console.log(99)\n');
  sh(fx.be, 'git', ['add', '-A']);
  sh(fx.be, 'git', ['commit', '-q', '-m', 'change']);
  r = cli(fx.root, 'stage', 'set', id, 'accepted');
  assert.equal(r.code, 1);
  assert.match(r.err, /stale/);
  assert.equal(cli(fx.root, 'verify', 'run', id, '--repo', 'backend').code, 0);
  assert.equal(cli(fx.root, 'stage', 'set', id, 'accepted').code, 0);
  assert.equal(cli(fx.root, 'stage', 'set', id, 'released').code, 1, 'needs acceptance gate');
  fx.cleanup();
});

test('5. verify run records pass and fail evidence; unconfirmed commands refused', () => {
  const fx = setup();
  const id = addFeature(fx.root);
  writeSpec(fx.root);
  cli(fx.root, 'feature', 'link', id, 'specs/001-password-reset');
  let r = cli(fx.root, 'verify', 'run', id, '--repo', 'backend');
  assert.equal(r.code, 1);
  assert.match(r.err, /not confirmed/);
  cli(fx.root, 'repo', 'set', 'backend', '--confirm');
  assert.equal(cli(fx.root, 'verify', 'run', id, '--repo', 'backend').code, 0);
  cli(fx.root, 'repo', 'set', 'backend', '--test', 'node -e "console.log(\'boom\');process.exit(3)"', '--confirm');
  r = cli(fx.root, 'verify', 'run', id, '--repo', 'backend');
  assert.equal(r.code, 1);
  const md = fs.readFileSync(path.join(fx.root, 'specs', '001-password-reset', 'verification.md'), 'utf8');
  assert.match(md, /result: pass/);
  assert.match(md, /result: fail/);
  assert.match(md, /exit_code: 3/);
  const jl = fs.readFileSync(path.join(fx.root, '.sdlc', 'cache', 'evidence', `${id}.jsonl`), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(jl.map((e) => e.result), ['pass', 'fail']);
  // mirror rebuild from markdown
  fs.rmSync(path.join(fx.root, '.sdlc', 'cache', 'evidence'), { recursive: true });
  assert.equal(j(fx.root, 'status', id).evidence[0].last.result, 'fail');
  fx.cleanup();
});

test('6. branches create makes branches in both repos and refuses dirty repos', () => {
  const fx = setup();
  const id = addFeature(fx.root);
  const dir = writeSpec(fx.root);
  cli(fx.root, 'feature', 'link', id, 'specs/001-password-reset');
  toStage(fx.root, id, 'defined', ['defined']);
  fs.writeFileSync(path.join(dir, 'spec.md'), '# s\n');
  cli(fx.root, 'stage', 'set', id, 'specified');
  cli(fx.root, 'gate', 'approve', id, 'spec');
  cli(fx.root, 'stage', 'set', id, 'designed');
  cli(fx.root, 'gate', 'approve', id, 'design');
  assert.equal(cli(fx.root, 'stage', 'set', id, 'planned').code, 0);
  assert.equal(cli(fx.root, 'branches', 'create', id).code, 1, 'implement gate not approved');
  cli(fx.root, 'gate', 'approve', id, 'implement');
  w(path.join(fx.fe, 'dirty.txt'), 'x');
  const r = cli(fx.root, 'branches', 'create', id, '--json');
  assert.equal(r.code, 1);
  const res = JSON.parse(r.out);
  assert.equal(res.find((x) => x.repo === 'backend').status, 'created');
  assert.equal(res.find((x) => x.repo === 'frontend').status, 'refused');
  assert.equal(sh(fx.be, 'git', ['rev-parse', '--abbrev-ref', 'HEAD']), '001-password-reset');
  fs.rmSync(path.join(fx.fe, 'dirty.txt'));
  assert.equal(cli(fx.root, 'branches', 'create', id).code, 0);
  assert.equal(sh(fx.fe, 'git', ['rev-parse', '--abbrev-ref', 'HEAD']), '001-password-reset');
  assert.deepEqual(Object.keys(readBacklog(fx.root).features[0].branches).sort(), ['backend', 'frontend']);
  fx.cleanup();
});

test('7. backward stage move requires a reason, clears gates and logs history', () => {
  const fx = setup();
  const id = addFeature(fx.root);
  writeSpec(fx.root);
  cli(fx.root, 'feature', 'link', id, 'specs/001-password-reset');
  for (const s of ['defined', 'specified']) assert.equal(cli(fx.root, 'stage', 'set', id, s).code, 0);
  cli(fx.root, 'gate', 'approve', id, 'spec');
  cli(fx.root, 'stage', 'set', id, 'designed');
  cli(fx.root, 'gate', 'approve', id, 'design');
  assert.equal(cli(fx.root, 'stage', 'set', id, 'specified').code, 1, 'reason required');
  assert.equal(cli(fx.root, 'stage', 'set', id, 'specified', '--reason', 'requirement changed').code, 0);
  const f = readBacklog(fx.root).features[0];
  assert.equal(f.stage, 'specified');
  assert.equal(f.gates.spec, null);
  assert.equal(f.gates.design, null);
  assert.equal(f.revisit.reason, 'requirement changed');
  assert.ok(f.history.some((h) => /revisit: requirement changed/.test(h.detail)));
  fx.cleanup();
});

test('8. pre-tool-use hook decisions', () => {
  const fx = setup();
  const id = addFeature(fx.root);
  const run = (tool_name, tool_input, cwd = fx.root) => hook('pre-tool-use', cwd, { tool_name, tool_input });
  const dec = (r) => r.json?.hookSpecificOutput?.permissionDecision;

  assert.equal(dec(run('Edit', { file_path: path.join(fx.root, '.sdlc', 'backlog.json') })), 'deny');
  assert.equal(dec(run('Write', { file_path: '.sdlc/config.json' })), 'deny');
  assert.equal(dec(run('Bash', { command: `node "/x/scripts/sdlc.mjs" gate approve ${id} spec` })), 'ask');
  assert.equal(dec(run('Bash', { command: 'git push origin main' })), 'ask');
  assert.equal(dec(run('Bash', { command: 'specify init --here' })), 'ask');
  assert.equal(run('Bash', { command: 'git status' }).json, null);
  assert.equal(dec(run('Edit', { file_path: path.join(fx.be, 'src', 'index.js') })), 'ask');
  assert.equal(dec(run('Edit', { file_path: path.join(fx.be, 'CLAUDE.md'), old_string: 'a', new_string: 'b' })), 'ask');
  assert.equal(run('Edit', { file_path: path.join(fx.root, 'specs', '001-x', 'spec.md') }).json, null);
  // CLAUDE.md edit inside the sdlc markers is allowed through; outside is not
  const claude = fs.readFileSync(path.join(fx.root, 'CLAUDE.md'), 'utf8');
  assert.equal(run('Edit', { file_path: path.join(fx.root, 'CLAUDE.md'), old_string: 'Gates are human approvals', new_string: 'x' }).json, null);
  assert.equal(dec(run('Edit', { file_path: path.join(fx.root, 'CLAUDE.md'), old_string: 'User content', new_string: 'x' })), 'ask');
  assert.ok(claude.includes('Gates are human approvals'));
  // guard mode deny / off
  const cfgPath = path.join(fx.root, '.sdlc', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.guards.source_edit_outside_implementing = 'off';
  fs.writeFileSync(cfgPath, JSON.stringify(cfg));
  assert.equal(run('Edit', { file_path: path.join(fx.be, 'src', 'index.js') }).json, null);
  // no .sdlc => no-op
  const bare = fs.mkdtempSync(path.join(fx.root, '..', 'bare-'));
  assert.equal(run('Bash', { command: 'git push' }, bare).json, null);
  fs.rmSync(bare, { recursive: true });
  fx.cleanup();
});

test('8b. source edits allowed when a feature is implementing for that repo', () => {
  const fx = setup();
  const id = addFeature(fx.root);
  const p = path.join(fx.root, '.sdlc', 'backlog.json');
  const b = readBacklog(fx.root);
  b.features[0].stage = 'implementing';
  fs.writeFileSync(p, JSON.stringify(b));
  const r = hook('pre-tool-use', fx.root, { tool_name: 'Edit', tool_input: { file_path: path.join(fx.be, 'src', 'index.js') } });
  assert.equal(r.json, null, id);
  fx.cleanup();
});

test('9. session-start brief is compact and flags stale evidence', () => {
  const fx = setup();
  const id = addFeature(fx.root);
  writeSpec(fx.root);
  cli(fx.root, 'feature', 'link', id, 'specs/001-password-reset');
  cli(fx.root, 'repo', 'set', 'backend', '--confirm');
  cli(fx.root, 'verify', 'run', id, '--repo', 'backend');
  const bp = path.join(fx.root, '.sdlc', 'backlog.json');
  const b = readBacklog(fx.root);
  b.features[0].stage = 'implementing';
  fs.writeFileSync(bp, JSON.stringify(b));
  w(path.join(fx.be, 'src', 'index.js'), 'console.log(5)\n');
  sh(fx.be, 'git', ['add', '-A']);
  sh(fx.be, 'git', ['commit', '-q', '-m', 'later']);
  const r = hook('session-start', fx.root, { hook_event_name: 'SessionStart' });
  const ctx = r.json.hookSpecificOutput.additionalContext;
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.ok(ctx.split('\n').length <= 25);
  assert.match(ctx, /stale/);
  assert.match(ctx, new RegExp(id));
  const none = hook('session-start', fs.mkdtempSync(path.join(fx.root, '..', 'nows-')), {});
  assert.equal(none.json, null);
  fx.cleanup();
});

test('10. validate catches unknown repo names and bad references', () => {
  const fx = setup();
  const id = addFeature(fx.root);
  const bp = path.join(fx.root, '.sdlc', 'backlog.json');
  const b = readBacklog(fx.root);
  b.features[0].repos.push('ghost');
  b.features[0].deps.push({ id: 'F-999', type: 'requires', note: '' });
  fs.writeFileSync(bp, JSON.stringify(b));
  const r = cli(fx.root, 'validate', '--json');
  assert.equal(r.code, 1);
  const res = JSON.parse(r.out);
  assert.ok(res.errors.some((e) => e.includes('unknown repo "ghost"')));
  assert.ok(res.errors.some((e) => e.includes('F-999')));
  assert.ok(id);
  fx.cleanup();
});

test('11. gate required reflects autonomy and traits', () => {
  const fx = setup();
  const single = cli(fx.root, 'feature', 'add', '--title', 'Solo', '--repos', 'frontend').out.trim();
  assert.deepEqual(j(fx.root, 'gate', 'required', single).required, ['spec', 'design', 'implement', 'acceptance', 'release'], 'frontend is a UI repo: design gate required');
  const backendOnly = cli(fx.root, 'feature', 'add', '--title', 'API only', '--repos', 'backend').out.trim();
  assert.deepEqual(j(fx.root, 'gate', 'required', backendOnly).required, ['spec', 'implement', 'acceptance', 'release']);
  const multi = addFeature(fx.root);
  assert.ok(j(fx.root, 'gate', 'required', multi).required.includes('design'));
  fx.cleanup();
});

test('12. shell writes to sdlc state files are gated', () => {
  const fx = setup();
  const run = (command) => hook('pre-tool-use', fx.root, { tool_name: 'Bash', tool_input: { command } });
  assert.equal(run('sed -i s/1/2/ .sdlc/backlog.json').json.hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(run('echo {} > ' + ['.sdlc', 'config.json'].join(String.fromCharCode(92))).json.hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(run('cat .sdlc/backlog.json').json, null);
  fx.cleanup();
});
