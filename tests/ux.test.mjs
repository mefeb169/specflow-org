import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeFixture, cli, w, UX_MD } from './make-fixture.mjs';

const j = (root, ...a) => JSON.parse(cli(root, ...a, '--json').out);
const readBacklog = (root) => JSON.parse(fs.readFileSync(path.join(root, '.sdlc', 'backlog.json'), 'utf8'));
const readCfg = (root) => JSON.parse(fs.readFileSync(path.join(root, '.sdlc', 'config.json'), 'utf8'));
const setCfg = (root, fn) => {
  const p = path.join(root, '.sdlc', 'config.json');
  const c = readCfg(root);
  fn(c);
  fs.writeFileSync(p, JSON.stringify(c));
};

function setup() {
  const fx = makeFixture();
  assert.equal(cli(fx.root, 'init').code, 0);
  return fx;
}

/** A UI feature (backend + frontend) linked to a spec dir with spec/plan; ux.md optional. */
function uiFeature(root, { ux = false } = {}) {
  const id = cli(root, 'feature', 'add', '--title', 'Password reset', '--summary', 'AC', '--value', 'v', '--repos', 'backend,frontend').out.trim();
  const dir = path.join(root, 'specs', '001-password-reset');
  w(path.join(dir, 'spec.md'), '# Spec\n');
  w(path.join(dir, 'plan.md'), '# Plan\n## Repository Impact\n| backend | x |\n');
  if (ux) w(path.join(dir, 'ux.md'), UX_MD);
  assert.equal(cli(root, 'feature', 'link', id, 'specs/001-password-reset').code, 0);
  for (const s of ['defined', 'specified']) assert.equal(cli(root, 'stage', 'set', id, s).code, 0);
  return { id, dir };
}

test('UX-1. scan marks UI repos and finds design-system evidence', () => {
  const fx = makeFixture();
  w(path.join(fx.fe, 'tailwind.config.js'), 'module.exports = {}\n');
  w(path.join(fx.fe, 'playwright.config.ts'), 'export default {}\n');
  assert.equal(cli(fx.root, 'init').code, 0);
  const scan = JSON.parse(fs.readFileSync(path.join(fx.root, '.sdlc', 'cache', 'scan.json'), 'utf8'));
  const fe = scan.repos.find((r) => r.name === 'frontend');
  const be = scan.repos.find((r) => r.name === 'backend');
  assert.equal(fe.ui.is_ui, true);
  assert.ok(fe.ui.design_system.includes('tailwind.config.js'));
  assert.ok(fe.ui.visual_test_tools.includes('playwright'));
  assert.equal(be.ui.is_ui, false);
  const cfg = readCfg(fx.root);
  assert.equal(cfg.repos.find((r) => r.name === 'frontend').ui, true);
  assert.equal(cfg.repos.find((r) => r.name === 'backend').ui, false);
  // status surfaces the scan's design-system evidence for sdlc-ux's mode choice
  const id = cli(fx.root, 'feature', 'add', '--title', 'FE', '--repos', 'frontend').out.trim();
  const d = j(fx.root, 'status', id);
  assert.ok(d.ui_evidence.frontend.design_system.includes('tailwind.config.js'));
  assert.match(cli(fx.root, 'status', id).out, /ui evidence frontend: design system tailwind\.config\.js/);
  fx.cleanup();
});

test('UX-2. feature ui is derived, overridable and logged; repo set --ui works', () => {
  const fx = setup();
  const a = cli(fx.root, 'feature', 'add', '--title', 'FE', '--repos', 'frontend').out.trim();
  const b = cli(fx.root, 'feature', 'add', '--title', 'BE', '--repos', 'backend').out.trim();
  const c = cli(fx.root, 'feature', 'add', '--title', 'FE no ui', '--repos', 'frontend', '--ui', 'false').out.trim();
  const feats = readBacklog(fx.root).features;
  assert.equal(feats.find((f) => f.id === a).ui, true);
  assert.equal(feats.find((f) => f.id === b).ui, false);
  assert.equal(feats.find((f) => f.id === c).ui, false);
  assert.equal(cli(fx.root, 'feature', 'set', b, 'ui', 'true').code, 0);
  const fb = readBacklog(fx.root).features.find((f) => f.id === b);
  assert.equal(fb.ui, true);
  assert.ok(fb.history.some((h) => /set ui/.test(h.detail)));
  assert.equal(cli(fx.root, 'feature', 'set', b, 'ui', 'maybe').code, 1);
  assert.equal(cli(fx.root, 'repo', 'set', 'backend', '--ui', 'true').code, 0);
  assert.equal(readCfg(fx.root).repos.find((r) => r.name === 'backend').ui, true);
  assert.equal(cli(fx.root, 'repo', 'set', 'backend', '--ui', 'nope').code, 1);
  fx.cleanup();
});

test('UX-3. designed is refused for UI features until ux.md is complete', () => {
  const fx = setup();
  const { id, dir } = uiFeature(fx.root);
  cli(fx.root, 'gate', 'approve', id, 'spec');
  let r = cli(fx.root, 'stage', 'set', id, 'designed');
  assert.equal(r.code, 1);
  assert.match(r.err, /ux\.md does not exist/);
  w(path.join(dir, 'ux.md'), '# UX\n\n## Flows\n\n## Screens and states\n\n## Copy\n\n## Accessibility\n');
  r = cli(fx.root, 'stage', 'set', id, 'designed');
  assert.match(r.err, /Mode/);
  w(path.join(dir, 'ux.md'), '# UX\nMode: conform\n\n## Flows\n\n## Screens and states\n\n## Copy\n');
  r = cli(fx.root, 'stage', 'set', id, 'designed');
  assert.match(r.err, /## Accessibility/);
  w(path.join(dir, 'ux.md'), UX_MD);
  assert.equal(cli(fx.root, 'stage', 'set', id, 'designed').code, 0);
  fx.cleanup();
});

test('UX-4. backend-only features need no ux.md', () => {
  const fx = setup();
  const id = cli(fx.root, 'feature', 'add', '--title', 'API', '--summary', 's', '--value', 'v', '--repos', 'backend').out.trim();
  const dir = path.join(fx.root, 'specs', '002-api');
  w(path.join(dir, 'spec.md'), '# s\n');
  w(path.join(dir, 'plan.md'), '# p\n');
  cli(fx.root, 'feature', 'link', id, 'specs/002-api');
  for (const s of ['defined', 'specified']) assert.equal(cli(fx.root, 'stage', 'set', id, s).code, 0);
  cli(fx.root, 'gate', 'approve', id, 'spec');
  assert.equal(cli(fx.root, 'stage', 'set', id, 'designed').code, 0);
  assert.equal(j(fx.root, 'status', id).ux.required, false);
  assert.deepEqual(j(fx.root, 'gate', 'required', id).required, ['spec', 'implement', 'acceptance', 'release']);
  fx.cleanup();
});

test('UX-5. design gate for UI follows config.ux.design_gate_for_ui', () => {
  const fx = setup();
  const id = cli(fx.root, 'feature', 'add', '--title', 'FE', '--repos', 'frontend').out.trim();
  assert.deepEqual(j(fx.root, 'gate', 'required', id).required, ['spec', 'design', 'implement', 'acceptance', 'release']);
  setCfg(fx.root, (c) => { c.ux = { design_gate_for_ui: false }; });
  assert.ok(!j(fx.root, 'gate', 'required', id).required.includes('design'));
  assert.equal(cli(fx.root, 'validate').code, 0);
  setCfg(fx.root, (c) => { c.ux = { design_gate_for_ui: 'no' }; });
  assert.equal(cli(fx.root, 'validate').code, 1);
  fx.cleanup();
});

test('UX-6. accepted needs ux-review for UI features unless config waives it', () => {
  const fx = setup();
  const { id, dir } = uiFeature(fx.root, { ux: true });
  w(path.join(dir, 'tasks.md'), '- [X] T1 [repo:backend] a\n- [X] T2 [repo:frontend] b\n');
  const bp = path.join(fx.root, '.sdlc', 'backlog.json');
  const b = readBacklog(fx.root);
  b.features[0].stage = 'verifying';
  fs.writeFileSync(bp, JSON.stringify(b));
  for (const repo of ['backend', 'frontend']) {
    cli(fx.root, 'repo', 'set', repo, '--confirm');
    assert.equal(cli(fx.root, 'verify', 'run', id, '--repo', repo).code, 0);
  }
  cli(fx.root, 'evidence', 'add', id, '--kind', 'review', '--result', 'pass', '--note', 'ok');
  let r = cli(fx.root, 'stage', 'set', id, 'accepted');
  assert.equal(r.code, 1);
  assert.match(r.err, /ux-review/);
  assert.equal(cli(fx.root, 'evidence', 'add', id, '--kind', 'ux-review', '--repo', 'frontend', '--result', 'pass', '--note', 'manual: no screenshot taken').code, 0);
  assert.equal(cli(fx.root, 'stage', 'set', id, 'accepted').code, 0);
  fx.cleanup();

  const fx2 = setup();
  const f2 = uiFeature(fx2.root, { ux: true });
  w(path.join(f2.dir, 'tasks.md'), '- [X] T1 [repo:backend] a\n- [X] T2 [repo:frontend] b\n');
  const b2 = readBacklog(fx2.root);
  b2.features[0].stage = 'verifying';
  fs.writeFileSync(path.join(fx2.root, '.sdlc', 'backlog.json'), JSON.stringify(b2));
  setCfg(fx2.root, (c) => { c.ux = { require_ux_review: false }; });
  for (const repo of ['backend', 'frontend']) {
    cli(fx2.root, 'repo', 'set', repo, '--confirm');
    cli(fx2.root, 'verify', 'run', f2.id, '--repo', repo);
  }
  cli(fx2.root, 'evidence', 'add', f2.id, '--kind', 'review', '--result', 'pass', '--note', 'ok');
  r = cli(fx2.root, 'stage', 'set', f2.id, 'accepted');
  assert.equal(r.code, 0, r.err);
  fx2.cleanup();
});

test('UX-7. next/status route UI features to sdlc-ux while ux.md is incomplete', () => {
  const fx = setup();
  const { id, dir } = uiFeature(fx.root);
  assert.match(j(fx.root, 'status').find((r) => r.id === id).next, /sdlc-ux/);
  assert.match(j(fx.root, 'next').ready[0].next_action, /sdlc-ux/);
  const d = j(fx.root, 'status', id);
  assert.equal(d.ux.complete, false);
  assert.ok(d.ux.failures.length > 0);
  w(path.join(dir, 'ux.md'), UX_MD);
  assert.match(j(fx.root, 'status').find((r) => r.id === id).next, /sdlc-architect/);
  assert.equal(j(fx.root, 'status', id).ux.complete, true);
  fx.cleanup();
});

test('UX-8. validate flags non-boolean ui; backlogs without ui still work', () => {
  const fx = setup();
  const id = cli(fx.root, 'feature', 'add', '--title', 'FE', '--repos', 'frontend').out.trim();
  const bp = path.join(fx.root, '.sdlc', 'backlog.json');
  const b = readBacklog(fx.root);
  delete b.features[0].ui;
  fs.writeFileSync(bp, JSON.stringify(b));
  assert.equal(cli(fx.root, 'validate').code, 0);
  assert.equal(j(fx.root, 'status', id).ui, true, 'derived from the frontend repo');
  b.features[0].ui = 'yes';
  fs.writeFileSync(bp, JSON.stringify(b));
  const r = cli(fx.root, 'validate', '--json');
  assert.equal(r.code, 1);
  assert.ok(JSON.parse(r.out).errors.some((e) => /ui must be a boolean/.test(e)));
  fx.cleanup();
});

test('UX-9. init writes design-system.md only for UI workspaces and never overwrites it', () => {
  const fx = setup();
  const ds = path.join(fx.root, '.sdlc', 'design-system.md');
  assert.ok(fs.existsSync(ds));
  fs.writeFileSync(ds, 'MY DESIGN SYSTEM\n');
  const r = JSON.parse(cli(fx.root, 'init', '--json').out);
  assert.ok(r.skipped.includes('.sdlc/design-system.md'));
  assert.equal(fs.readFileSync(ds, 'utf8'), 'MY DESIGN SYSTEM\n');
  fx.cleanup();

  const only = makeFixture();
  fs.rmSync(only.fe, { recursive: true, force: true });
  assert.equal(cli(only.root, 'init').code, 0);
  assert.ok(!fs.existsSync(path.join(only.root, '.sdlc', 'design-system.md')));
  only.cleanup();
});
