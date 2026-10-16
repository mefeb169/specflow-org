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
  assert.equal(dec(run("cat > .specflow/backlog.json <<'EOF'\n{}\nEOF\n")), 'ask', 'redirect to a state file on the first line is still caught');
  fx.cleanup();
});
