import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { load, paths, readJson, repoDir, writeJson } from '../lib/state.mjs';
import { DEFAULT_DESTRUCTIVE_PATTERNS } from '../lib/lifecycle.mjs';
import { scanWorkspace } from '../lib/scan.mjs';
import { isGitRepo } from '../lib/git.mjs';
import { validate } from '../lib/validate.mjs';
import { emit } from './io.mjs';
import { MIN_NODE, nodeOk } from '../lib/runtime.mjs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.resolve(HERE, '..', '..', 'templates', 'workspace');
const BEGIN = '<!-- sdlc:begin -->';
const END = '<!-- sdlc:end -->';
// ---------- init / scan / doctor ----------
export function cmdInit(args) {
  const root = path.resolve(args.flags.root || process.cwd());
  const p = paths(root);
  const created = []; const skipped = [];
  fs.mkdirSync(path.join(p.sdlc, 'decisions'), { recursive: true });
  for (const f of ['config.json', 'backlog.json', 'product.md', 'workspace-map.md']) {
    const dest = path.join(p.sdlc, f);
    if (fs.existsSync(dest)) { skipped.push(`.sdlc/${f}`); continue; }
    if (f === 'config.json') {
      const c = readJson(path.join(TEMPLATES, f));
      c.workspace.name = path.basename(root);
      c.workspace.root_is_repo = !!args.flags['root-is-repo'] || isGitRepo(root);
      c.guards.destructive_bash_patterns = [...DEFAULT_DESTRUCTIVE_PATTERNS];
      writeJson(dest, c);
    } else fs.copyFileSync(path.join(TEMPLATES, f), dest);
    created.push(`.sdlc/${f}`);
  }
  // CLAUDE.md managed block
  const block = fs.readFileSync(path.join(TEMPLATES, 'claude-md-block.md'), 'utf8').trim();
  const claude = path.join(root, 'CLAUDE.md');
  let claudeStatus;
  if (!fs.existsSync(claude)) { fs.writeFileSync(claude, block + '\n'); claudeStatus = 'created'; } else {
    const text = fs.readFileSync(claude, 'utf8');
    const b = text.indexOf(BEGIN); const e = text.indexOf(END);
    let next;
    if (b >= 0 && e > b) next = text.slice(0, b) + block + text.slice(e + END.length);
    else next = text.replace(/\s*$/, '') + '\n\n' + block + '\n';
    if (next === text) claudeStatus = 'unchanged'; else { fs.writeFileSync(claude, next); claudeStatus = b >= 0 ? 'block updated' : 'block appended'; }
  }
  const scan = scanWorkspace(root);
  // .gitignore
  const gi = path.join(root, '.gitignore');
  const wanted = ['.sdlc/cache/'];
  if (args.flags['root-is-repo']) for (const r of scan.repos.filter((x) => !x.is_root)) wanted.push(`/${r.path}/`);
  const have = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const lines = have.split(/\r?\n/);
  const add = wanted.filter((w) => !lines.includes(w));
  if (add.length) fs.writeFileSync(gi, have.replace(/\s*$/, have ? '\n' : '') + add.join('\n') + '\n');
  const ctx = load(root);
  const sc = applyScan(ctx, scan);
  if (ctx.config.repos.some((r) => r.ui === true)) {
    const ds = path.join(p.sdlc, 'design-system.md');
    if (fs.existsSync(ds)) skipped.push('.sdlc/design-system.md');
    else { fs.copyFileSync(path.join(TEMPLATES, 'design-system.md'), ds); created.push('.sdlc/design-system.md'); }
  }
  const doc = doctor(ctx);
  emit({ root, created, skipped, claude_md: claudeStatus, gitignore_added: add, scan: sc, doctor: doc }, () => [
    `Initialized sdlc workspace at ${root}`,
    created.length ? `  created: ${created.join(', ')}` : '  created: (nothing new)',
    skipped.length ? `  skipped (already exist): ${skipped.join(', ')}` : '',
    `  CLAUDE.md: ${claudeStatus}`,
    add.length ? `  .gitignore += ${add.join(', ')}` : '',
    renderScan(sc), renderDoctor(doc),
  ].filter(Boolean).join('\n'));
}

function applyScan(ctx, scan) {
  fs.mkdirSync(paths(ctx.root).cache, { recursive: true });
  writeJson(paths(ctx.root).scan, scan);
  const added = []; const missing = [];
  for (const r of scan.repos) {
    const known = ctx.config.repos.find((x) => path.resolve(ctx.root, x.path) === path.resolve(ctx.root, r.path));
    if (known) { if (known.ui === undefined) known.ui = r.ui.is_ui; continue; }
    const cmds = { test: r.command_candidates.test?.cmd || null, build: r.command_candidates.build?.cmd || null, lint: r.command_candidates.lint?.cmd || null };
    ctx.config.repos.push({
      name: r.name, path: r.path, kind: r.is_root ? 'root' : 'git', purpose: '', stack: r.stack, commands: cmds, commands_confirmed: false,
      ui: r.ui.is_ui,
      speckit: !scan.workspace_speckit.present && r.speckit.present && !r.is_root ? 'repo-local' : 'root', deploy_order: null,
    });
    added.push(r.name);
  }
  for (const x of ctx.config.repos) if (!fs.existsSync(repoDir(ctx, x))) missing.push(x.name);
  ctx.config.workspace.root_is_repo = scan.root_is_repo;
  ctx.saveConfig();
  return { repos_found: scan.repos.map((r) => r.name), added, missing_from_disk: missing, workspace_speckit: scan.workspace_speckit };
}

const renderScan = (s) => `  repos: ${s.repos_found.join(', ') || '(none)'}${s.added.length ? ` (new: ${s.added.join(', ')})` : ''}${s.missing_from_disk.length ? `\n  MISSING on disk (not removed): ${s.missing_from_disk.join(', ')}` : ''}`;

export function cmdScan(args, ctx) {
  const sc = applyScan(ctx, scanWorkspace(ctx.root));
  emit(sc, () => `Scan written to .sdlc/cache/scan.json\n${renderScan(sc)}`);
}

function specifyCli() {
  if (process.env.SDLC_SKIP_TOOL_PROBE === '1') return { available: false, skipped: true };
  const r = spawnSync('specify version', { encoding: 'utf8', shell: true });
  if (r.status !== 0 && r.status !== null) return { available: false };
  if (r.error || r.status === null) return { available: false };
  const m = (r.stdout || '').match(/(\d+\.\d+\.\d+)/);
  return { available: true, version: m ? m[1] : 'unknown' };
}

export function doctor(ctx) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  add('node', nodeOk(), nodeOk() ? process.version : `${process.version} is older than the required >= ${MIN_NODE}`);
  const g = spawnSync('git', ['--version'], { encoding: 'utf8' });
  add('git', g.status === 0, g.status === 0 ? g.stdout.trim() : 'not found');
  const cli = specifyCli();
  add('specify CLI', cli.available || !!cli.skipped, cli.skipped ? 'probe skipped (SDLC_SKIP_TOOL_PROBE=1)' : cli.available ? `v${cli.version}` : 'not found on PATH (needed only to initialize Spec Kit)');
  // locate Spec Kit state: root first, then repo-local
  let loc = null;
  if (fs.existsSync(path.join(ctx.root, '.specify'))) loc = '.';
  else { const r = ctx.config.repos.find((x) => fs.existsSync(path.join(repoDir(ctx, x), '.specify'))); if (r) loc = r.path; }
  if (loc) {
    const dir = path.resolve(ctx.root, loc);
    const opts = readJson(path.join(dir, '.specify', 'init-options.json'), {});
    const skillsDir = path.join(dir, '.claude', 'skills');
    const skills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir).filter((d) => d.startsWith('speckit-')).sort() : [];
    ctx.config.speckit = { version: opts.speckit_version || null, integration: opts.integration || null, location: loc, skills };
    add('spec kit', true, `initialized at "${loc}" v${opts.speckit_version || '?'} (${opts.integration || '?'}); skills: ${skills.length}`);
    if (!skills.length) add('spec kit skills', false, 'no speckit-* skills in .claude/skills (integration may not be claude)');
    if (process.platform === 'win32' && process.env.SDLC_SKIP_TOOL_PROBE !== '1' && fs.existsSync(path.join(dir, '.specify', 'scripts', 'powershell'))) {
      const ep = spawnSync('powershell -NoProfile -Command "Get-ExecutionPolicy"', { encoding: 'utf8', shell: true });
      const pol = (ep.stdout || '').trim();
      const okPol = ['RemoteSigned', 'Unrestricted', 'Bypass'].includes(pol);
      add('powershell execution policy', okPol, okPol ? pol : `"${pol || 'unknown'}" blocks Spec Kit's .ps1 scripts. Ask the user to run: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned (or re-init Spec Kit with --script sh)`);
    }
    add('constitution', fs.existsSync(path.join(dir, '.specify', 'memory', 'constitution.md')), '.specify/memory/constitution.md');
  } else {
    ctx.config.speckit = { version: null, integration: null, location: '.', skills: [] };
    add('spec kit', false, 'not initialized. Offer: specify init --here --integration claude --non-interactive (needs user approval)');
  }
  ctx.saveConfig();
  const errs = validate(ctx);
  const uiRepos = ctx.config.repos.filter((r) => r.ui === true).map((r) => r.name);
  if (uiRepos.length) add('design system doc', fs.existsSync(path.join(ctx.root, '.sdlc', 'design-system.md')), `UI repos: ${uiRepos.join(', ')}; .sdlc/design-system.md ${fs.existsSync(path.join(ctx.root, '.sdlc', 'design-system.md')) ? 'present' : 'missing (sdlc-discover/sdlc-ux should write it)'}`);
  add('state validation', errs.length === 0, errs.length ? errs.join('; ') : 'config + backlog valid');
  for (const r of ctx.config.repos) add(`repo ${r.name}`, fs.existsSync(repoDir(ctx, r)), `${r.path} ${r.commands_confirmed ? '(commands confirmed)' : '(commands NOT confirmed)'}`);
  return checks;
}

export const renderDoctor = (c) => c.map((x) => `  [${x.ok ? 'ok' : '!!'}] ${x.name}: ${x.detail}`).join('\n');

// ---------- registry / backlog ----------
