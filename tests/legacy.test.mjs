import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeFixture, cli, hook } from './make-fixture.mjs';

const dec = (r) => r.json?.hookSpecificOutput?.permissionDecision ?? null;
const exists = (root, ...p) => fs.existsSync(path.join(root, ...p));

/** A workspace as 0.3 created it: .sdlc/ state dir, sdlc: CLAUDE.md markers, .sdlc/cache/ in .gitignore. */
function legacyWorkspace() {
  const fx = makeFixture();
  assert.equal(cli(fx.root, 'init').code, 0);
  const id = cli(fx.root, 'feature', 'add', '--title', 'Kept feature', '--repos', 'backend').out.trim();
  const cfgPath = path.join(fx.root, '.specflow', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.framework_version = '0.3.0';
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  fs.renameSync(path.join(fx.root, '.specflow'), path.join(fx.root, '.sdlc'));
  const claude = path.join(fx.root, 'CLAUDE.md');
  fs.writeFileSync(claude, fs.readFileSync(claude, 'utf8').replace('specflow:begin', 'sdlc:begin').replace('specflow:end', 'sdlc:end'));
  const gi = path.join(fx.root, '.gitignore');
  fs.writeFileSync(gi, fs.readFileSync(gi, 'utf8').replace('.specflow/cache/', '.sdlc/cache/'));
  return { fx, id };
}

test('LEG-1. a legacy .sdlc/ workspace is found, warned about and still guarded', () => {
  const { fx, id } = legacyWorkspace();
  const st = cli(fx.root, 'status', '--json');
  assert.equal(st.code, 0, st.err);
  assert.equal(JSON.parse(st.out)[0].id, id);
  assert.match(cli(fx.root, 'brief').out, /legacy \.sdlc\/ state dir/);
  const init = cli(fx.root, 'init');
  assert.equal(init.code, 1);
  assert.match(init.err, /legacy \.sdlc\/ state directory/);
  assert.equal(dec(hook('pre-tool-use', fx.root, { tool_name: 'Edit', tool_input: { file_path: path.join(fx.root, '.sdlc', 'backlog.json') } })), 'deny');
  assert.ok(hook('session-start', fx.root, {}).json.hookSpecificOutput.additionalContext.includes('legacy'));
  fx.cleanup();
});

test('LEG-2. upgrade dry run changes nothing; --apply migrates to .specflow/ and is idempotent', () => {
  const { fx, id } = legacyWorkspace();
  const dry = JSON.parse(cli(fx.root, 'upgrade', '--json').out);
  assert.equal(dry.applied, false);
  const step = dry.migrations.find((m) => m.to === '0.4.0');
  assert.ok(step.changes.some((c) => /rename \.sdlc\/ -> \.specflow\//.test(c)));
  assert.ok(step.changes.some((c) => /\.gitignore/.test(c)));
  assert.match(dry.claude_md_block, /would be: block updated/);
  assert.ok(exists(fx.root, '.sdlc', 'config.json') && !exists(fx.root, '.specflow'), 'dry run touched nothing');

  const done = cli(fx.root, 'upgrade', '--apply', '--json');
  assert.equal(done.code, 0, done.err);
  assert.ok(exists(fx.root, '.specflow', 'config.json'));
  assert.ok(!exists(fx.root, '.sdlc'));
  const backlog = JSON.parse(fs.readFileSync(path.join(fx.root, '.specflow', 'backlog.json'), 'utf8'));
  assert.equal(backlog.features[0].id, id, 'backlog preserved');
  const cfg = JSON.parse(fs.readFileSync(path.join(fx.root, '.specflow', 'config.json'), 'utf8'));
  assert.equal(cfg.framework_version, '0.4.0');
  const claude = fs.readFileSync(path.join(fx.root, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /User content that must survive/);
  assert.match(claude, /<!-- specflow:begin -->/);
  assert.doesNotMatch(claude, /sdlc:begin|sdlc:end/);
  const gi = fs.readFileSync(path.join(fx.root, '.gitignore'), 'utf8');
  assert.match(gi, /\.specflow\/cache\//);
  assert.doesNotMatch(gi, /\.sdlc\/cache\//);
  assert.equal(cli(fx.root, 'validate').code, 0);
  assert.match(cli(fx.root, 'upgrade').out, /up to date/);
  assert.doesNotMatch(cli(fx.root, 'brief').out, /legacy/);
  fx.cleanup();
});

test('LEG-3. upgrade refuses when both state directories exist', () => {
  const { fx } = legacyWorkspace();
  fs.mkdirSync(path.join(fx.root, '.specflow'));
  const r = cli(fx.root, 'upgrade', '--apply');
  assert.equal(r.code, 1);
  assert.match(r.err, /Both \.sdlc\/ and \.specflow\/ exist/);
  assert.ok(exists(fx.root, '.sdlc', 'config.json'), 'nothing was moved');
  fx.cleanup();
});

test('LEG-4. every spelling of the gate/install commands is gated, and denied when unattended', () => {
  const fx = makeFixture();
  cli(fx.root, 'init');
  const run = (command, permission_mode = 'default') => hook('pre-tool-use', fx.root, { tool_name: 'Bash', permission_mode, tool_input: { command } });
  const spellings = [
    'specflow gate approve F-001 spec',
    'sflow gate approve F-001 spec',
    'node "/p/plugins/specflow/scripts/specflow.mjs" gate approve F-001 spec',
    'sdlc gate approve F-001 spec',
    'node /p/scripts/sdlc.mjs gate approve F-001 spec',
    'specflow install --scope user',
    'sflow uninstall',
    'specflow upgrade --apply',
  ];
  for (const c of spellings) {
    assert.equal(dec(run(c)), 'ask', c);
    assert.equal(dec(run(c, 'bypassPermissions')), 'deny', `${c} (bypass)`);
  }
  assert.equal(run('specflow status').json, null);
  assert.equal(run('sflow next').json, null);
  assert.equal(run('specflow upgrade').json, null, 'dry run is not gated');
  fx.cleanup();
});

test('LEG-5. legacy CLAUDE.md markers are honored by the guard', () => {
  const { fx } = legacyWorkspace();
  const edit = (old_string) => hook('pre-tool-use', fx.root, { tool_name: 'Edit', tool_input: { file_path: path.join(fx.root, 'CLAUDE.md'), old_string, new_string: 'x' } });
  assert.equal(edit('Gates are human approvals').json, null, 'inside the legacy block');
  assert.equal(dec(edit('User content')), 'ask', 'outside the block');
  fx.cleanup();
});
