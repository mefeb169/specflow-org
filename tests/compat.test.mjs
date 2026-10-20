import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeFixture, cli, hook, w } from './make-fixture.mjs';

const readCfg = (root) => JSON.parse(fs.readFileSync(path.join(root, '.specflow', 'config.json'), 'utf8'));
const writeCfg = (root, c) => fs.writeFileSync(path.join(root, '.specflow', 'config.json'), JSON.stringify(c, null, 2));

function fakeSpecKit(root, { version = '1.2.0', style = 'skills' } = {}) {
  w(path.join(root, '.specify', 'init-options.json'), JSON.stringify({ speckit_version: version, integration: 'claude' }));
  w(path.join(root, '.specify', 'memory', 'constitution.md'), '# c\n');
  if (style === 'skills') {
    for (const s of ['specify', 'plan', 'tasks']) w(path.join(root, '.claude', 'skills', `speckit-${s}`, 'SKILL.md'), '---\nname: x\n---\n');
  } else {
    for (const s of ['specify', 'plan', 'tasks']) w(path.join(root, '.claude', 'commands', `speckit.${s}.md`), '# cmd\n');
  }
}

test('CMP-1. doctor detects Spec Kit install style and out-of-range versions', () => {
  const fx = makeFixture();
  fakeSpecKit(fx.root, { style: 'skills' });
  assert.equal(cli(fx.root, 'init').code, 0);
  assert.equal(readCfg(fx.root).speckit.style, 'skills');
  assert.equal(readCfg(fx.root).speckit.version, '1.2.0');
  assert.doesNotMatch(cli(fx.root, 'doctor').out, /outside the tested range/);
  fx.cleanup();

  const old = makeFixture();
  fakeSpecKit(old.root, { version: '0.9.1', style: 'commands' });
  cli(old.root, 'init');
  const r = cli(old.root, 'doctor');
  assert.equal(readCfg(old.root).speckit.style, 'commands');
  assert.match(r.out, /older command-style install/);
  assert.match(r.out, /outside the tested range/);
  old.cleanup();

  const none = makeFixture();
  cli(none.root, 'init');
  assert.equal(readCfg(none.root).speckit.style, 'none');
  none.cleanup();
});

test('CMP-2. upgrade is a dry run by default, additive when applied, and never touches user content', () => {
  const fx = makeFixture();
  cli(fx.root, 'init');
  // simulate a workspace created by v0.1.0 with user customizations
  const c = readCfg(fx.root);
  c.framework_version = '0.1.0';
  delete c.ux;
  delete c.guards.deny_in_unattended_modes;
  delete c.speckit.style;
  c.guards.extra_bash_patterns = ['my-custom-pattern'];
  c.autonomy = 'guided';
  writeCfg(fx.root, c);
  const claudeBefore = fs.readFileSync(path.join(fx.root, 'CLAUDE.md'), 'utf8');
  fs.writeFileSync(path.join(fx.root, 'CLAUDE.md'), claudeBefore.replace('Gates are human approvals', 'OLD BLOCK TEXT'));
  const product = path.join(fx.root, '.specflow', 'product.md');
  fs.writeFileSync(product, 'MY PRODUCT VISION\n');

  assert.match(cli(fx.root, 'brief').out, /run `specflow upgrade`/);
  const dry = cli(fx.root, 'upgrade', '--json');
  assert.equal(dry.code, 0, dry.err);
  const plan = JSON.parse(dry.out);
  assert.equal(plan.applied, false);
  assert.equal(plan.from, '0.1.0');
  assert.ok(plan.migrations.some((m) => m.to === '0.2.0' && m.changes.length));
  assert.match(plan.claude_md_block, /would be: block updated/);
  assert.equal(readCfg(fx.root).framework_version, '0.1.0', 'dry run changes nothing');
  assert.match(fs.readFileSync(path.join(fx.root, 'CLAUDE.md'), 'utf8'), /OLD BLOCK TEXT/);

  const done = cli(fx.root, 'upgrade', '--apply', '--json');
  assert.equal(done.code, 0, done.err);
  const after = readCfg(fx.root);
  assert.equal(after.framework_version, '0.7.0');
  assert.deepEqual(after.ux, { design_gate_for_ui: true, require_ux_review: true });
  assert.equal(after.guards.deny_in_unattended_modes, true);
  assert.deepEqual(after.guards.extra_bash_patterns, ['my-custom-pattern'], 'user customization preserved');
  assert.equal(after.autonomy, 'guided');
  const claudeAfter = fs.readFileSync(path.join(fx.root, 'CLAUDE.md'), 'utf8');
  assert.match(claudeAfter, /User content that must survive/);
  assert.match(claudeAfter, /Gates are human approvals/);
  assert.equal(fs.readFileSync(product, 'utf8'), 'MY PRODUCT VISION\n');

  assert.match(cli(fx.root, 'upgrade').out, /up to date/);
  assert.doesNotMatch(cli(fx.root, 'brief').out, /specflow upgrade/);
  assert.equal(cli(fx.root, 'validate').code, 0);
  fx.cleanup();
});

test('CMP-3. upgrade --apply is gated by the pre-tool-use hook', () => {
  const fx = makeFixture();
  cli(fx.root, 'init');
  const r = hook('pre-tool-use', fx.root, { tool_name: 'Bash', tool_input: { command: 'node "/p/scripts/specflow.mjs" upgrade --apply' } });
  assert.equal(r.json.hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(hook('pre-tool-use', fx.root, { tool_name: 'Bash', tool_input: { command: 'node /p/scripts/specflow.mjs upgrade' } }).json, null);
  fx.cleanup();
});
