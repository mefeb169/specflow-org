// specflow usage: tokens per item and role, read from Claude Code transcripts (fake ones here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeFixture, cli } from './make-fixture.mjs';

const ok = (r) => { assert.equal(r.code, 0, r.err || r.out); return r; };
const j = (root, ...a) => JSON.parse(ok(cli(root, ...a, '--json')).out);
const usage = (u) => ({ input_tokens: u[0], cache_creation_input_tokens: u[1], cache_read_input_tokens: u[2], output_tokens: u[3] });
const asst = (id, u, extra = {}, content = []) => JSON.stringify({ type: 'assistant', timestamp: extra.at || '2026-11-20T10:00:00.000Z', isSidechain: !!extra.side, message: { id, model: extra.model || 'claude-opus-5-5', usage: usage(u), content } });
const bash = (command) => [{ type: 'tool_use', name: 'Bash', input: { command } }];
const user = (content) => JSON.stringify({ type: 'user', message: { role: 'user', content } });

function setup() {
  const fx = makeFixture();
  ok(cli(fx.root, 'init'));
  ok(cli(fx.root, 'repo', 'set', 'backend', '--ui', 'false'));
  const a = ok(cli(fx.root, 'feature', 'add', '--title', 'Alpha', '--repos', 'backend')).out.trim();
  const b = ok(cli(fx.root, 'feature', 'add', '--title', 'Beta', '--repos', 'backend')).out.trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specflow-tx-'));
  const sid = 'sess-1';
  fs.writeFileSync(path.join(dir, `${sid}.jsonl`), [
    user('hi'),
    asst('m1', [10, 0, 100, 5]), // before any item: unattributed
    asst('m2', [1, 0, 200, 5], {}, bash(`node specflow.mjs dispatch ${a} --json`)), // the naming turn itself: still unattributed
    asst('m2', [1, 0, 200, 5]), // same message split into two lines: counted once
    asst('m3', [1, 0, 300, 5]), // after naming A: A
    asst('m4', [1, 0, 400, 5], {}, bash('git log F-999 && specflow status')), // unknown id: no switch
    asst('m5', [1, 0, 500, 5], {}, bash(`specflow status ${b}`)), // still A (switch applies after)
    asst('m6', [1, 0, 600, 5]), // B
    asst('m7', [1, 0, 700, 5], { side: true }), // inline sidechain: skipped
    asst('m8', [1, 0, 800, 5], { at: '2026-10-01T00:00:00.000Z' }), // old turn, for --since
    'not json',
  ].join('\n'));
  const sub = path.join(dir, sid, 'subagents');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, 'agent-1.jsonl'), [
    user(`specflow dispatch: role builder. ${a} "Alpha" (feature, lane full, stage implementing).\nRepo: backend`),
    asst('s1', [5, 50, 1000, 20], { model: 'claude-sonnet-5-5' }),
    asst('s2', [5, 0, 2000, 20], { model: 'claude-sonnet-5-5' }),
  ].join('\n'));
  fs.writeFileSync(path.join(sub, 'agent-1.meta.json'), JSON.stringify({ agentType: 'specflow:builder' }));
  fs.writeFileSync(path.join(sub, 'agent-2.jsonl'), [
    user([{ type: 'text', text: `Review the diff of ${b} in backend.` }]),
    asst('s3', [5, 0, 3000, 20], { model: 'claude-sonnet-5-5' }),
  ].join('\n'));
  fs.writeFileSync(path.join(sub, 'agent-2.meta.json'), JSON.stringify({ agentType: 'specflow:independent-reviewer' }));
  return { fx, a, b, dir };
}

test('U-1. usage attributes PM turns by the last specflow command and subagents by their dispatch prompt', () => {
  const { fx, a, b, dir } = setup();
  const all = j(fx.root, 'usage', '--transcripts', dir, '--all');
  const by = Object.fromEntries(all.items.map((x) => [x.id, x]));
  assert.equal(by['(unattributed)'].tokens, (10 + 100 + 5) + (201 + 5));
  assert.equal(by[a].pm, (301 + 5) + (401 + 5) + (501 + 5));
  assert.equal(by[a].team, (5 + 50 + 1000 + 20) + (5 + 2000 + 20));
  assert.equal(by[a].agents, 1);
  assert.equal(by[b].pm, (601 + 5) + (801 + 5));
  assert.equal(by[b].team, 5 + 3000 + 20);
  assert.equal(all.finished_items, 0);
  assert.equal(all.tokens_per_finished_item, null);

  const one = j(fx.root, 'usage', a, '--transcripts', dir);
  const roles = Object.fromEntries(one.roles.map((r) => [r.role, r]));
  assert.equal(roles.builder.turns, 2);
  assert.deepEqual(Object.keys(roles.builder.models), ['claude-sonnet-5-5']);
  assert.equal(roles.pm.turns, 3);
  assert.equal(j(fx.root, 'usage', b, '--transcripts', dir).roles.find((r) => r.role === 'independent-reviewer').agents, 1);
});

test('U-2. usage --since skips older turns; text output and errors', () => {
  const { fx, b, dir } = setup();
  assert.equal(j(fx.root, 'usage', b, '--transcripts', dir).roles.find((r) => r.role === 'pm').turns, 2);
  const since = j(fx.root, 'usage', b, '--transcripts', dir, '--since', '2026-11-01');
  assert.equal(since.roles.find((r) => r.role === 'pm').turns, 1);
  const txt = ok(cli(fx.root, 'usage', '--transcripts', dir)).out;
  assert.match(txt, /transcript\(s\) scanned/);
  assert.match(txt, /Alpha/);
  assert.notEqual(cli(fx.root, 'usage', '--transcripts', dir, '--since', 'soon').code, 0);
  assert.notEqual(cli(fx.root, 'usage', 'F-999', '--transcripts', dir).code, 0);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'specflow-tx-'));
  assert.equal(j(fx.root, 'usage', '--transcripts', empty).total_tokens, 0);
});
