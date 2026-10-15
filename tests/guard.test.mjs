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
  const approve = 'node "/p/scripts/sdlc.mjs" gate approve F-001 spec';
  for (const mode of ['default', 'acceptEdits', 'auto', 'plan']) {
    assert.equal(dec(run(mode, approve)), 'ask', `approve in ${mode}`);
    assert.equal(dec(run(mode, 'git push origin main')), 'ask', `push in ${mode}`);
  }
  for (const mode of ['bypassPermissions', 'dontAsk']) {
    const a = run(mode, approve);
    assert.equal(dec(a), 'deny', `approve in ${mode}`);
    assert.match(a.json.hookSpecificOutput.permissionDecisionReason, /cannot show an interactive prompt/);
    assert.equal(dec(run(mode, 'git push origin main')), 'deny', `push in ${mode}`);
    assert.equal(dec(run(mode, 'node /p/scripts/sdlc.mjs init')), 'deny', `init in ${mode}`);
    assert.equal(run(mode, 'git status').json, null, `harmless command in ${mode}`);
  }
  fx.cleanup();
});

test('GRD-2. unattended-mode denial can be switched off in config', () => {
  const fx = makeFixture();
  cli(fx.root, 'init');
  const p = path.join(fx.root, '.sdlc', 'config.json');
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
  const r = cliEnv(fx.root, { SDLC_FAKE_NODE_MAJOR: '16' }, 'status');
  assert.equal(r.code, 1);
  assert.match(r.err, /requires Node\.js >= 18/);
  const h = hook('pre-tool-use', fx.root, { tool_name: 'Bash', tool_input: { command: 'git push' } }, { SDLC_FAKE_NODE_MAJOR: '16' });
  assert.equal(h.code, 0);
  assert.equal(h.out, '');
  fx.cleanup();
});
