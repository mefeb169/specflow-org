#!/usr/bin/env node
// sdlc CLI: the only sanctioned way to mutate lifecycle state. Zero dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  UserError, getFeature, getRepo, load, logHistory, now, paths, posix, readJson, repoDir, requireRoot, specDirAbs, writeJson,
} from './lib/state.mjs';
import {
  BLOCKER_KINDS, DEFAULT_DESTRUCTIVE_PATTERNS, DEP_TYPES, EVIDENCE_KINDS, GATES, GATE_STAGE, PRIORITIES, RISKS, STAGES, stageIdx,
} from './lib/lifecycle.mjs';
import { scanWorkspace } from './lib/scan.mjs';
import { checkEntry, checkTasks, clearDownstreamGates, requiredGates, traits } from './lib/gates.mjs';
import { branchExists, headSha, isDirty, isGitRepo, switchBranch } from './lib/git.mjs';
import { appendEvidence, runVerify, tail } from './lib/verify.mjs';
import { brief, featureDetail, ranking, statusRow, table } from './lib/render.mjs';
import { validate } from './lib/validate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.resolve(HERE, '..', 'templates', 'workspace');
const BOOL = new Set(['json', 'mvp', 'confirm', 'root-is-repo', 'help']);
const BEGIN = '<!-- sdlc:begin -->';
const END = '<!-- sdlc:end -->';

function parseArgs(argv) {
  const a = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      if (BOOL.has(k) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) a.flags[k] = true;
      else a.flags[k] = argv[++i];
    } else a._.push(t);
  }
  return a;
}

let JSON_OUT = false;
const emit = (data, text) => { console.log(JSON_OUT ? JSON.stringify(data, null, 2) : (typeof text === 'function' ? text() : text ?? JSON.stringify(data, null, 2))); };
const need = (v, msg) => { if (v === undefined || v === null || v === '' || v === true) throw new UserError(msg); return v; };
const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function checkRepos(ctx, names) {
  for (const n of names) getRepo(ctx, n);
  return names;
}

// ---------- init / scan / doctor ----------
function cmdInit(args) {
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

function cmdScan(args, ctx) {
  const sc = applyScan(ctx, scanWorkspace(ctx.root));
  emit(sc, () => `Scan written to .sdlc/cache/scan.json\n${renderScan(sc)}`);
}

function specifyCli() {
  const r = spawnSync('specify version', { encoding: 'utf8', shell: true });
  if (r.status !== 0 && r.status !== null) return { available: false };
  if (r.error || r.status === null) return { available: false };
  const m = (r.stdout || '').match(/(\d+\.\d+\.\d+)/);
  return { available: true, version: m ? m[1] : 'unknown' };
}

function doctor(ctx) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  add('node', true, process.version);
  const g = spawnSync('git', ['--version'], { encoding: 'utf8' });
  add('git', g.status === 0, g.status === 0 ? g.stdout.trim() : 'not found');
  const cli = specifyCli();
  add('specify CLI', cli.available, cli.available ? `v${cli.version}` : 'not found on PATH (needed only to initialize Spec Kit)');
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
    if (process.platform === 'win32' && fs.existsSync(path.join(dir, '.specify', 'scripts', 'powershell'))) {
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

const renderDoctor = (c) => c.map((x) => `  [${x.ok ? 'ok' : '!!'}] ${x.name}: ${x.detail}`).join('\n');

// ---------- registry / backlog ----------
function cmdRepo(args, ctx) {
  const [sub, name] = args._;
  if (sub !== 'set') throw new UserError('usage: repo set <name> [--test c] [--build c] [--lint c] [--purpose s] [--stack a,b] [--confirm] [--deploy-order n]');
  const repo = getRepo(ctx, need(name, 'repo name required'));
  const f = args.flags;
  let cmdChanged = false;
  for (const k of ['test', 'build', 'lint']) if (typeof f[k] === 'string') { repo.commands[k] = f[k]; cmdChanged = true; }
  if (cmdChanged) repo.commands_confirmed = false;
  if (typeof f.purpose === 'string') repo.purpose = f.purpose;
  if (f.ui !== undefined) {
    if (!['true', 'false'].includes(String(f.ui))) throw new UserError('--ui must be true or false');
    repo.ui = String(f.ui) === 'true';
  }
  if (typeof f.stack === 'string') repo.stack = csv(f.stack);
  if (f['deploy-order'] !== undefined) repo.deploy_order = Number(f['deploy-order']);
  if (f.confirm) repo.commands_confirmed = true;
  ctx.saveConfig();
  emit(repo, () => `Updated repo ${repo.name}: ${JSON.stringify(repo.commands)} confirmed=${repo.commands_confirmed}`);
}

function cmdFeature(args, ctx) {
  const [sub, id, field, ...rest] = args._;
  const f = args.flags;
  if (sub === 'add') {
    const title = need(f.title, '--title required');
    const repos = checkRepos(ctx, csv(f.repos));
    const prio = f.priority || 'P2';
    if (!PRIORITIES.includes(prio)) throw new UserError(`priority must be one of ${PRIORITIES.join(', ')}`);
    const fid = `F-${String(ctx.backlog.next_id++).padStart(3, '0')}`;
    const feat = {
      id: fid, title, summary: f.summary || '', priority: prio, mvp: !!f.mvp, value: f.value || '', risk: f.risk || 'med',
      ui: f.ui === undefined ? repos.some((n) => ctx.config.repos.find((r) => r.name === n)?.ui === true) : String(f.ui) === 'true',
      stage: 'proposed', spec_dir: null, repos, branches: {}, deps: [],
      gates: Object.fromEntries(GATES.map((g) => [g, null])), blockers: [], revisit: null, history: [],
    };
    logHistory(feat, 'stage', 'created at stage proposed');
    ctx.backlog.features.push(feat);
    ctx.saveBacklog();
    return emit(feat, fid);
  }
  const feat = getFeature(ctx, need(id, 'feature id required'));
  if (sub === 'set') {
    const value = rest.join(' ');
    switch (field) {
      case 'title': case 'summary': case 'value': feat[field] = value; break;
      case 'priority': if (!PRIORITIES.includes(value)) throw new UserError(`priority must be one of ${PRIORITIES.join(', ')}`); feat.priority = value; break;
      case 'risk': if (!RISKS.includes(value)) throw new UserError(`risk must be one of ${RISKS.join(', ')}`); feat.risk = value; break;
      case 'mvp': feat.mvp = value === 'true'; break;
      case 'ui': if (!['true', 'false'].includes(value)) throw new UserError('ui must be true or false'); feat.ui = value === 'true'; break;
      case 'repos': feat.repos = checkRepos(ctx, csv(value)); break;
      case 'stage': case 'gates': throw new UserError('stage and gates cannot be set here; use `stage set` / `gate approve`');
      default: throw new UserError('settable fields: title, summary, priority, mvp, value, risk, repos, ui');
    }
    logHistory(feat, 'link', `set ${field}`);
    ctx.saveBacklog();
    return emit(feat, `${feat.id}: ${field} updated`);
  }
  if (sub === 'link') {
    let dir = need(field, 'spec directory required');
    const abs = [path.resolve(ctx.root, dir), path.resolve(ctx.root, 'specs', dir)].find((x) => fs.existsSync(x) && fs.statSync(x).isDirectory());
    if (!abs) throw new UserError(`Spec directory not found: ${dir}`);
    feat.spec_dir = posix(path.relative(ctx.root, abs));
    logHistory(feat, 'link', `spec_dir ${feat.spec_dir}`);
    ctx.saveBacklog();
    return emit(feat, `${feat.id} linked to ${feat.spec_dir}`);
  }
  if (sub === 'activate') {
    if (!feat.spec_dir) {
      throw new UserError(`${feat.id} has no spec_dir yet. Run speckit-specify for it first (it creates specs/NNN-name and its own feature.json), then \`sdlc feature link ${feat.id} <dir>\`.`);
    }
    let loc = ctx.root; let fd = feat.spec_dir;
    const repos = feat.repos.map((n) => getRepo(ctx, n));
    if (repos.length === 1 && repos[0].speckit === 'repo-local') { loc = repoDir(ctx, repos[0]); fd = posix(path.relative(loc, path.resolve(ctx.root, feat.spec_dir))); }
    fs.mkdirSync(path.join(loc, '.specify'), { recursive: true });
    fs.writeFileSync(path.join(loc, '.specify', 'feature.json'), JSON.stringify({ feature_directory: fd }));
    return emit({ id: feat.id, feature_json: posix(path.relative(ctx.root, path.join(loc, '.specify', 'feature.json'))) || '.specify/feature.json', feature_directory: fd }, `Active feature for Spec Kit: ${fd}`);
  }
  throw new UserError('usage: feature add|set|link|activate');
}

function reaches(ctx, from, target, seen = new Set()) {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  const f = ctx.backlog.features.find((x) => x.id === from);
  return !!f && f.deps.filter((d) => d.type === 'requires' || d.type === 'technical').some((d) => reaches(ctx, d.id, target, seen));
}

function cmdDep(args, ctx) {
  const [sub, id, depId] = args._;
  const f = getFeature(ctx, id);
  getFeature(ctx, need(depId, 'dependency id required'));
  if (sub === 'add') {
    const type = need(args.flags.type, `--type required (${DEP_TYPES.join('|')})`);
    if (!DEP_TYPES.includes(type)) throw new UserError(`type must be one of ${DEP_TYPES.join(', ')}`);
    if (id === depId) throw new UserError('a feature cannot depend on itself');
    if ((type === 'requires' || type === 'technical') && reaches(ctx, depId, id)) throw new UserError(`Refused: ${depId} already depends (transitively) on ${id}; this would create a cycle.`);
    f.deps = f.deps.filter((d) => d.id !== depId);
    f.deps.push({ id: depId, type, note: typeof args.flags.note === 'string' ? args.flags.note : '' });
    logHistory(f, 'link', `dep ${type} ${depId}`);
  } else if (sub === 'rm') {
    f.deps = f.deps.filter((d) => d.id !== depId);
    logHistory(f, 'link', `dep removed ${depId}`);
  } else throw new UserError('usage: dep add|rm <id> <dep_id> --type t');
  ctx.saveBacklog();
  emit(f.deps, `${id} deps: ${f.deps.map((d) => `${d.id}(${d.type})`).join(', ') || '(none)'}`);
}

function cmdBlocker(args, ctx) {
  const [sub, id, a] = args._;
  const f = getFeature(ctx, id);
  if (sub === 'add') {
    const text = need(a, 'blocker text required');
    const kind = args.flags.kind || 'decision';
    if (!BLOCKER_KINDS.includes(kind)) throw new UserError(`kind must be one of ${BLOCKER_KINDS.join(', ')}`);
    const b = { id: `B-${f.blockers.length + 1}`, kind, text, open: true, created: now(), resolved: null };
    f.blockers.push(b);
    logHistory(f, 'blocker', `${b.id} opened: ${text}`);
    ctx.saveBacklog();
    return emit(b, `${f.id} blocker ${b.id} opened`);
  }
  if (sub === 'resolve') {
    const b = f.blockers.find((x) => x.id === a);
    if (!b) throw new UserError(`unknown blocker ${a}`);
    b.open = false; b.resolved = now();
    logHistory(f, 'blocker', `${b.id} resolved${typeof args.flags.note === 'string' ? `: ${args.flags.note}` : ''}`);
    ctx.saveBacklog();
    return emit(b, `${f.id} blocker ${b.id} resolved`);
  }
  throw new UserError('usage: blocker add <id> "<text>" --kind k | blocker resolve <id> <B-n>');
}

// ---------- lifecycle ----------
function cmdStage(args, ctx) {
  const [sub, id, target] = args._;
  if (sub !== 'set') throw new UserError('usage: stage set <id> <stage> [--reason s]');
  const f = getFeature(ctx, id);
  if (!STAGES.includes(target)) throw new UserError(`stage must be one of ${STAGES.join(', ')}`);
  const cur = stageIdx(f.stage); const tgt = stageIdx(target);
  const reason = typeof args.flags.reason === 'string' ? args.flags.reason : '';
  if (tgt === cur) throw new UserError(`${id} is already at ${target}`);
  if (tgt < cur) {
    need(reason, 'Moving a feature backward requires --reason');
    const cleared = clearDownstreamGates(f, target);
    f.revisit = { stage: target, reason };
    logHistory(f, 'stage', `${f.stage} -> ${target} (revisit: ${reason}); cleared gates: ${cleared.join(', ') || 'none'}`);
    f.stage = target;
    ctx.saveBacklog();
    return emit({ id, stage: target, cleared_gates: cleared }, `${id} moved back to ${target}; cleared gates: ${cleared.join(', ') || 'none'}`);
  }
  if (tgt !== cur + 1) throw new UserError(`${id} is at ${f.stage}; advance one stage at a time (next: ${STAGES[cur + 1]})`);
  let failures = checkEntry(ctx, f, target);
  if (target === 'done' && reason) failures = failures.filter((x) => !x.startsWith('no post-release evidence'));
  if (failures.length) {
    const msg = `Cannot move ${id} ${f.stage} -> ${target}:\n${failures.map((x) => `  - ${x}`).join('\n')}`;
    if (JSON_OUT) { console.log(JSON.stringify({ ok: false, failures }, null, 2)); process.exit(1); }
    throw new UserError(msg);
  }
  logHistory(f, 'stage', `${f.stage} -> ${target}${reason ? ` (${reason})` : ''}`);
  f.stage = target; f.revisit = null;
  ctx.saveBacklog();
  emit({ id, stage: target }, `${id} is now ${target}`);
}

function cmdGate(args, ctx) {
  const [sub, id, gate] = args._;
  const f = getFeature(ctx, id);
  if (sub === 'required') {
    const req = requiredGates(ctx, f);
    return emit({ required: req, pending: req.filter((g) => !f.gates[g]), traits: traits(ctx, f) }, () => `required: ${req.join(', ') || '(none)'}\npending: ${req.filter((g) => !f.gates[g]).join(', ') || '(none)'}`);
  }
  if (sub !== 'approve') throw new UserError('usage: gate approve <id> <gate> [--note s] | gate required <id>');
  if (!GATES.includes(gate)) throw new UserError(`gate must be one of ${GATES.join(', ')}`);
  if (f.stage !== GATE_STAGE[gate]) throw new UserError(`Gate "${gate}" is approved while the feature is at stage "${GATE_STAGE[gate]}"; ${id} is at "${f.stage}".`);
  f.gates[gate] = { approved_at: now(), by: 'human', note: typeof args.flags.note === 'string' ? args.flags.note : '' };
  logHistory(f, 'gate', `${gate} approved`);
  ctx.saveBacklog();
  emit({ id, gate, approved: true }, `${id}: gate "${gate}" approved`);
}

function cmdCheck(args, ctx) {
  const [sub, id] = args._;
  if (sub !== 'tasks') throw new UserError('usage: check tasks <id>');
  const f = getFeature(ctx, id);
  const r = checkTasks(ctx, f);
  emit(r, () => `${r.done}/${r.total} tasks done. ${Object.entries(r.perRepo).map(([k, v]) => `${k}: ${v.done}/${v.total}`).join(', ')}${r.errors.length ? `\nERRORS:\n${r.errors.map((e) => `  - ${e}`).join('\n')}` : '\nall tasks tagged'}`);
  if (r.errors.length) process.exitCode = 1;
}

function cmdBranches(args, ctx) {
  const [sub, id] = args._;
  if (sub !== 'create') throw new UserError('usage: branches create <id>');
  const f = getFeature(ctx, id);
  if (!['planned', 'implementing'].includes(f.stage)) throw new UserError(`Branches are created once the feature is "planned" (implement gate approved); ${id} is at "${f.stage}".`);
  if (requiredGates(ctx, f).includes('implement') && !f.gates.implement) throw new UserError(`Gate "implement" must be approved first (sdlc gate approve ${id} implement).`);
  need(f.spec_dir, `${id} has no spec_dir`);
  const slug = path.basename(f.spec_dir);
  const name = (ctx.config.branch_pattern || '{spec_slug}').replace('{spec_slug}', slug).replace('{id}', f.id);
  const results = [];
  for (const rn of f.repos) {
    const repo = getRepo(ctx, rn); const dir = repoDir(ctx, repo);
    if (!isGitRepo(dir)) { results.push({ repo: rn, status: 'skipped', detail: 'not a git repository' }); continue; }
    const existed = branchExists(dir, name);
    if (isDirty(dir) && !(existed && f.branches[rn] === name)) { results.push({ repo: rn, status: 'refused', detail: 'uncommitted changes; commit or stash first' }); continue; }
    const r = switchBranch(dir, name);
    if (!r.ok) { results.push({ repo: rn, status: 'failed', detail: r.err }); continue; }
    f.branches[rn] = name;
    results.push({ repo: rn, status: existed ? 'switched' : 'created', branch: name });
  }
  logHistory(f, 'link', `branches: ${results.map((r) => `${r.repo}=${r.status}`).join(', ')}`);
  ctx.saveBacklog();
  emit(results, () => results.map((r) => `${r.repo}: ${r.status}${r.branch ? ` (${r.branch})` : ''}${r.detail ? ` - ${r.detail}` : ''}`).join('\n'));
  if (results.some((r) => r.status === 'refused' || r.status === 'failed')) process.exitCode = 1;
}

function cmdVerify(args, ctx) {
  const [sub, id] = args._;
  if (sub !== 'run') throw new UserError('usage: verify run <id> --repo r [--kind test|build|lint]');
  const f = getFeature(ctx, id);
  const repo = getRepo(ctx, need(args.flags.repo, '--repo required'));
  const kind = args.flags.kind || 'test';
  if (!['test', 'build', 'lint'].includes(kind)) throw new UserError('kind must be test, build or lint');
  const e = runVerify(ctx, f, repo, kind);
  logHistory(f, 'link', `verify ${kind} ${repo.name}: ${e.result}`);
  ctx.saveBacklog();
  emit(e, () => `${kind} on ${repo.name}: ${e.result.toUpperCase()} (exit ${e.exit_code}) at ${String(e.sha).slice(0, 8)}\n${e.tail.split('\n').slice(-8).join('\n')}`);
  if (e.result !== 'pass') process.exitCode = 1;
}

function cmdEvidence(args, ctx) {
  const [sub, id] = args._;
  if (sub !== 'add') throw new UserError('usage: evidence add <id> --kind k [--repo r] --result pass|fail --note s');
  const f = getFeature(ctx, id);
  const kind = need(args.flags.kind, `--kind required (${EVIDENCE_KINDS.join('|')})`);
  if (!EVIDENCE_KINDS.includes(kind)) throw new UserError(`kind must be one of ${EVIDENCE_KINDS.join(', ')}`);
  const result = args.flags.result;
  if (!['pass', 'fail'].includes(result)) throw new UserError('--result must be pass or fail');
  let sha = '';
  if (args.flags.repo) sha = headSha(repoDir(ctx, getRepo(ctx, args.flags.repo))) || 'none';
  const e = appendEvidence(ctx, f, { kind, repo: args.flags.repo, result, note: typeof args.flags.note === 'string' ? args.flags.note : '', sha, tail: '' });
  logHistory(f, 'link', `evidence ${kind} ${result}`);
  ctx.saveBacklog();
  emit(e, `${f.id}: ${kind} evidence recorded (${result})`);
}

// ---------- views ----------
function cmdStatus(args, ctx) {
  const id = args._[0];
  if (id) {
    const d = featureDetail(ctx, getFeature(ctx, id));
    return emit(d, () => [
      `${d.id} ${d.title} [${d.stage}]${d.blocked ? ' BLOCKED' : ''}  priority ${d.priority}  repos: ${d.repos.join(', ')}`,
      `spec: ${d.spec_dir || '(none)'}   branches: ${JSON.stringify(d.branches)}`,
      `gates required: ${d.required_gates.join(', ') || '-'} | pending: ${d.pending_gates.join(', ') || '-'}`,
      d.ui ? `ui: yes | ux.md: ${d.ux.complete ? 'complete' : `incomplete (${d.ux.failures.length})`}` : '',
      ...Object.entries(d.ui_evidence).map(([r, u]) => `ui evidence ${r}: design system ${u.design_system.length ? u.design_system.join(', ') : 'NONE found'}; visual tools: ${u.visual_test_tools.join(', ') || 'none'}`),
      d.tasks ? `tasks: ${d.tasks.done}/${d.tasks.total}` : '',
      ...d.evidence.map((e) => `evidence ${e.repo}: ${e.last ? `${e.last.result} @${String(e.last.sha).slice(0, 8)} ${e.fresh ? '(fresh)' : '(STALE vs HEAD ' + String(e.head).slice(0, 8) + ')'}` : 'none'}`),
      ...d.held_by.map((h) => `held by: ${h}`),
      ...d.blockers.filter((b) => b.open).map((b) => `blocker ${b.id} [${b.kind}]: ${b.text}`),
      `next: ${d.next}`,
    ].filter(Boolean).join('\n'));
  }
  const rows = ctx.backlog.features.map((f) => statusRow(ctx, f));
  emit(rows, () => (rows.length ? table(rows.map((r) => ({ ...r, blocked: r.blocked ? 'yes' : '' })), ['id', 'title', 'stage', 'priority', 'blocked', 'next']) : 'Backlog is empty.'));
}

function cmdNext(args, ctx) {
  const r = ranking(ctx);
  emit(r, () => [
    r.ready.length ? 'Ready (best first):' : 'No ready features.',
    ...r.ready.map((x, i) => `${i + 1}. ${x.id} ${x.title} [${x.stage}]: ${x.reasons.join('; ')}\n   next: ${x.next_action}`),
    r.not_ready.length ? 'Not ready:' : '',
    ...r.not_ready.map((x) => `- ${x.id} ${x.title}: ${x.held_by.join(' | ')}`),
  ].filter(Boolean).join('\n'));
}

function cmdValidate(args, ctx) {
  const errors = validate(ctx);
  emit({ ok: errors.length === 0, errors }, errors.length ? errors.map((e) => `- ${e}`).join('\n') : 'valid');
  if (errors.length) process.exitCode = 1;
}

// ---------- main ----------
const HELP = `sdlc <command>
  init [--root-is-repo] | scan | doctor | validate | brief | status [id] | next
  repo set <name> [--test c --build c --lint c --purpose s --stack a,b --ui true|false --confirm --deploy-order n]
  feature add --title s [--priority P2 --mvp --repos a,b --summary s --value s --risk low|med|high --ui true|false]
  feature set|link|activate <id> ...   dep add|rm <id> <dep> --type t   blocker add|resolve <id> ...
  stage set <id> <stage> [--reason s]  gate approve|required <id> [gate]  check tasks <id>
  branches create <id>  verify run <id> --repo r [--kind k]  evidence add <id> --kind k --result r --note s
All commands accept --json.`;

function main() {
  const args = parseArgs(process.argv.slice(2));
  JSON_OUT = !!args.flags.json;
  const cmd = args._.shift();
  if (!cmd || cmd === 'help' || args.flags.help) { console.log(HELP); return; }
  if (cmd === 'init') return cmdInit(args);
  if (cmd === 'brief') {
    const root = args.flags.root ? path.resolve(args.flags.root) : require_root_soft();
    if (!root) { console.log('No .sdlc/ workspace here. Run `sdlc init` to set one up.'); return; }
    const lines = brief(load(root));
    return emit({ lines }, lines.join('\n'));
  }
  const root = args.flags.root ? path.resolve(args.flags.root) : requireRoot();
  const ctx = load(root);
  const table_ = { scan: cmdScan, doctor: (a, c) => { const d = doctor(c); emit(d, renderDoctor(d)); if (d.some((x) => !x.ok && ['state validation'].includes(x.name))) process.exitCode = 1; }, repo: cmdRepo, feature: cmdFeature, dep: cmdDep, blocker: cmdBlocker, stage: cmdStage, gate: cmdGate, check: cmdCheck, branches: cmdBranches, verify: cmdVerify, evidence: cmdEvidence, status: cmdStatus, next: cmdNext, validate: cmdValidate };
  const fn = table_[cmd];
  if (!fn) throw new UserError(`Unknown command "${cmd}". Run \`sdlc help\`.`);
  fn(args, ctx);
}

import { findRoot } from './lib/state.mjs';
function require_root_soft() { return findRoot(process.cwd()); }

try {
  main();
} catch (e) {
  if (e instanceof UserError) { console.error(e.message); process.exit(1); }
  console.error(`internal error: ${e.stack || e}`);
  process.exit(2);
}
