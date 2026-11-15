import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeFixture, cli, cliEnv, hook } from './make-fixture.mjs';

const dec = (r) => r.json?.hookSpecificOutput?.permissionDecision ?? null;

test('GRD-1. gate approval and destructive commands follow the permission mode', () => {
  const fx = makeFixture();
  assert.equal(cli(fx.root, 'init').code, 0);
  const run = (permission_mode, command) => hook('pre-tool-use', fx.root, { tool_name: 'Bash', permission_mode, tool_input: { command } });
  const approve = 'node "/p/scripts/specflow.mjs" gate approve F-001 spec';
  for (const mode of ['default', 'acceptEdits', 'auto', 'plan']) {
    assert.equal(dec(run(mode, approve)), 'ask', `approve in ${mode}`);
    assert.equal(dec(run(mode, 'git push origin main')), 'ask', `push in ${mode}`);
  }
  for (const mode of ['bypassPermissions', 'dontAsk']) {
    const a = run(mode, approve);
    assert.equal(dec(a), 'deny', `approve in ${mode}`);
    assert.match(a.json.hookSpecificOutput.permissionDecisionReason, /cannot show an interactive prompt/);
    assert.equal(dec(run(mode, 'git push origin main')), 'deny', `push in ${mode}`);
    assert.equal(dec(run(mode, 'node /p/scripts/specflow.mjs init')), 'deny', `init in ${mode}`);
    assert.equal(run(mode, 'git status').json, null, `harmless command in ${mode}`);
  }
  fx.cleanup();
});

test('GRD-2. unattended-mode denial can be switched off in config', () => {
  const fx = makeFixture();
  cli(fx.root, 'init');
  const p = path.join(fx.root, '.specflow', 'config.json');
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  c.guards.deny_in_unattended_modes = false;
  fs.writeFileSync(p, JSON.stringify(c));
  const r = hook('pre-tool-use', fx.root, { tool_name: 'Bash', permission_mode: 'bypassPermissions', tool_input: { command: 'git push' } });
  assert.equal(dec(r), 'ask');
  fx.cleanup();
});

test('GRD-3. old Node runtimes fail cleanly in the CLI and stay silent in hooks', () => {
  const fx = makeFixture();
  cli(fx.root, 'init');
  const r = cliEnv(fx.root, { SPECFLOW_FAKE_NODE_MAJOR: '16' }, 'status');
  assert.equal(r.code, 1);
  assert.match(r.err, /requires Node\.js >= 18/);
  const h = hook('pre-tool-use', fx.root, { tool_name: 'Bash', tool_input: { command: 'git push' } }, { SPECFLOW_FAKE_NODE_MAJOR: '16' });
  assert.equal(h.code, 0);
  assert.equal(h.out, '');
  fx.cleanup();
});

test('GRD-4. prose inside cat heredocs is not mistaken for commands, real commands still are', () => {
  const fx = makeFixture();
  cli(fx.root, 'init');
  const run = (command, permission_mode = 'default') => hook('pre-tool-use', fx.root, { tool_name: 'Bash', permission_mode, tool_input: { command } });
  const doc = "cat > specs/001-x/spec.md <<'EOF'\n# Spec\nBranches come from `specflow branches create`, never `git push`.\nspecflow gate approve F-001 spec is human only. See .specflow/backlog.json > notes\nEOF\n";
  assert.equal(run(doc).json, null, 'spec prose ignored');
  assert.equal(run(doc, 'bypassPermissions').json, null, 'and not denied in unattended modes');
  assert.equal(dec(run(doc + 'git push origin main')), 'ask', 'a real command after the heredoc is still caught');
  assert.equal(dec(run("bash <<'EOF'\ngit push origin main\nEOF\n")), 'ask', 'heredoc fed to a shell is still inspected');
  assert.equal(dec(run("cat > .specflow/backlog.json <<'EOF'\n{}\nEOF\n")), 'deny', 'redirect to a state file on the first line is still caught');
  fx.cleanup();
});

test('GRD-AUTO. file edits never prompt in modes that already approve edits; gates and denials are unchanged', () => {
  const fx = makeFixture();
  assert.equal(cli(fx.root, 'init').code, 0);
  const edit = (permission_mode, file_path, extra = {}) => hook('pre-tool-use', fx.root, { tool_name: 'Edit', permission_mode, tool_input: { file_path, old_string: 'x', new_string: 'y' }, ...extra });
  const src = path.join(fx.be, 'src', 'index.js');
  const instr = path.join(fx.be, 'CLAUDE.md');
  // Default mode: the file-edit checks ask, as before.
  assert.equal(dec(edit('default', src)), 'ask', 'source edit outside implementing');
  assert.equal(dec(edit('default', instr)), 'ask', 'instruction file');
  for (const mode of ['auto', 'acceptEdits', 'bypassPermissions', 'dontAsk']) {
    assert.equal(edit(mode, src).json, null, `source edit in ${mode}`);
    assert.equal(edit(mode, instr).json, null, `instruction file in ${mode}`);
    assert.equal(dec(edit(mode, path.join(fx.root, '.specflow', 'backlog.json'))), 'deny', `state file in ${mode}`);
  }
  // A configured "deny" is still a deny in auto mode.
  const p = path.join(fx.root, '.specflow', 'config.json');
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  c.guards.source_edit_outside_implementing = 'deny';
  fs.writeFileSync(p, JSON.stringify(c));
  assert.equal(dec(edit('auto', src)), 'deny');
  // Gates still ask in auto mode.
  const bash = (command) => hook('pre-tool-use', fx.root, { tool_name: 'Bash', permission_mode: 'auto', tool_input: { command } });
  assert.equal(dec(bash('node "/p/scripts/specflow.mjs" gate approve F-001 spec')), 'ask');
  assert.equal(dec(bash('git push origin main')), 'ask');
  fx.cleanup();
});
