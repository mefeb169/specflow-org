import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture, cli, cliEnv } from './make-fixture.mjs';

test('DOC-1. doctor skips the tool probe when asked and runs it otherwise', () => {
  const fx = makeFixture();
  assert.equal(cli(fx.root, 'init').code, 0);
  const skipped = cli(fx.root, 'doctor');
  assert.match(skipped.out, /specify CLI: probe skipped/);
  const real = cliEnv(fx.root, { SDLC_SKIP_TOOL_PROBE: '0' }, 'doctor');
  assert.doesNotMatch(real.out, /probe skipped/);
  assert.match(real.out, /specify CLI: (v\d|not found)/);
  fx.cleanup();
});
