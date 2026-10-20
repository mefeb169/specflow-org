import fs from 'node:fs';
import path from 'node:path';
import { UserError, getFeature, normalizeFeature, getRepo, logHistory, now, posix, repoDir } from '../lib/state.mjs';
import { BLOCKER_KINDS, DEP_TYPES, GATES, LANES, PRIORITIES, RISKS, stageIdx } from '../lib/lifecycle.mjs';
import { emit, need, csv, checkRepos } from './io.mjs';

export function cmdRepo(args, ctx) {
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

/** Creates a backlog item (feature, slice or issue) with every schema-v2 field set; the caller saves. */
export function createItem(ctx, o) {
  const fid = `F-${String(ctx.backlog.next_id++).padStart(3, '0')}`;
  const repos = o.repos || [];
  const feat = {
    id: fid, title: o.title, summary: o.summary || '', priority: o.priority || 'P2', mvp: !!o.mvp, value: o.value || '', risk: o.risk || 'med',
    ui: o.ui === undefined ? repos.some((n) => ctx.config.repos.find((r) => r.name === n)?.ui === true) : o.ui,
    stage: 'proposed', spec_dir: null, repos, branches: {}, deps: [],
    gates: Object.fromEntries(GATES.map((g) => [g, null])), blockers: [], revisit: null, history: [],
    kind: o.kind || 'feature', lane: o.lane, parent: o.parent || null, milestone: o.milestone || null, tags: o.tags || [], origin: o.origin || null,
  };
  normalizeFeature(feat);
  logHistory(feat, 'stage', `created at stage proposed${feat.kind === 'feature' ? '' : ` (${feat.kind})`}`);
  ctx.backlog.features.push(feat);
  return feat;
}

export function cmdFeature(args, ctx) {
  const [sub, id, field, ...rest] = args._;
  const f = args.flags;
  if (sub === 'add') {
    const title = need(f.title, '--title required');
    const repos = checkRepos(ctx, csv(f.repos));
    const prio = f.priority || 'P2';
    if (!PRIORITIES.includes(prio)) throw new UserError(`priority must be one of ${PRIORITIES.join(', ')}`);
    const feat = createItem(ctx, { title, summary: f.summary, priority: prio, mvp: !!f.mvp, value: f.value, risk: f.risk, ui: f.ui === undefined ? undefined : String(f.ui) === 'true', repos });
    ctx.saveBacklog();
    return emit(feat, feat.id);
  }
  const feat = getFeature(ctx, need(id, 'feature id required'));
  if (sub === 'drop') {
    const reason = need(typeof f.reason === 'string' ? f.reason : '', '--reason required');
    if (feat.dropped) throw new UserError(`${feat.id} is already dropped`);
    feat.dropped = { at: now(), reason };
    if (ctx.backlog.focus === feat.id) ctx.backlog.focus = null;
    ctx.backlog.parked = ctx.backlog.parked.filter((x) => x !== feat.id);
    logHistory(feat, 'link', `dropped: ${reason}`);
    ctx.saveBacklog();
    return emit(feat, `${feat.id} dropped`);
  }
  if (sub === 'restore') {
    if (!feat.dropped) throw new UserError(`${feat.id} is not dropped`);
    feat.dropped = null;
    logHistory(feat, 'link', 'restored');
    ctx.saveBacklog();
    return emit(feat, `${feat.id} restored`);
  }
  if (sub === 'set') {
    const value = rest.join(' ');
    switch (field) {
      case 'title': case 'summary': case 'value': feat[field] = value; break;
      case 'priority': if (!PRIORITIES.includes(value)) throw new UserError(`priority must be one of ${PRIORITIES.join(', ')}`); feat.priority = value; break;
      case 'risk': if (!RISKS.includes(value)) throw new UserError(`risk must be one of ${RISKS.join(', ')}`); feat.risk = value; break;
      case 'mvp': feat.mvp = value === 'true'; break;
      case 'ui': if (!['true', 'false'].includes(value)) throw new UserError('ui must be true or false'); feat.ui = value === 'true'; break;
      case 'repos': feat.repos = checkRepos(ctx, csv(value)); break;
      case 'lane':
        if (!LANES.includes(value)) throw new UserError(`lane must be one of ${LANES.join(', ')}`);
        if (stageIdx(feat.stage) >= stageIdx('implementing')) throw new UserError(`lane can only change before implementing; ${feat.id} is at ${feat.stage}`);
        feat.lane = value; break;
      case 'milestone': feat.milestone = ['none', ''].includes(value) ? null : value; break;
      case 'tags': feat.tags = csv(value); break;
      case 'size_waiver': feat.size_waiver = value.trim() || null; break;
      case 'stage': case 'gates': throw new UserError('stage and gates cannot be set here; use `stage set` / `gate approve`');
      default: throw new UserError('settable fields: title, summary, priority, mvp, value, risk, repos, ui, lane, milestone, tags, size_waiver');
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
      throw new UserError(`${feat.id} has no spec_dir yet. Run speckit-specify for it first (it creates specs/NNN-name and its own feature.json), then \`specflow feature link ${feat.id} <dir>\`.`);
    }
    let loc = ctx.root; let fd = feat.spec_dir;
    const repos = feat.repos.map((n) => getRepo(ctx, n));
    if (repos.length === 1 && repos[0].speckit === 'repo-local') { loc = repoDir(ctx, repos[0]); fd = posix(path.relative(loc, path.resolve(ctx.root, feat.spec_dir))); }
    fs.mkdirSync(path.join(loc, '.specify'), { recursive: true });
    fs.writeFileSync(path.join(loc, '.specify', 'feature.json'), JSON.stringify({ feature_directory: fd }));
    return emit({ id: feat.id, feature_json: posix(path.relative(ctx.root, path.join(loc, '.specify', 'feature.json'))) || '.specify/feature.json', feature_directory: fd }, `Active feature for Spec Kit: ${fd}`);
  }
  throw new UserError('usage: feature add|set|link|activate|drop|restore');
}

function reaches(ctx, from, target, seen = new Set()) {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  const f = ctx.backlog.features.find((x) => x.id === from);
  return !!f && f.deps.filter((d) => d.type === 'requires' || d.type === 'technical').some((d) => reaches(ctx, d.id, target, seen));
}

export function cmdDep(args, ctx) {
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

export function cmdBlocker(args, ctx) {
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
