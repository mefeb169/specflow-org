import fs from 'node:fs';
import path from 'node:path';
import { SLICING_DEFAULTS, LITE_GATES_DEFAULT, defaultLane } from './lifecycle.mjs';

export class UserError extends Error {}

export const now = () => new Date().toISOString();
export const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
export const posix = (p) => p.split(path.sep).join('/');

// Workspace state lives in .specflow/. Workspaces created before 0.4 use the legacy .sdlc/ and keep working until upgraded.
export const STATE_DIR = '.specflow';
export const LEGACY_STATE_DIR = '.sdlc';

/** Name of the state dir in use at `root`: legacy only when it exists and the new one does not. */
export function stateDirName(root) {
  if (fs.existsSync(path.join(root, STATE_DIR, 'config.json'))) return STATE_DIR;
  if (fs.existsSync(path.join(root, LEGACY_STATE_DIR, 'config.json'))) return LEGACY_STATE_DIR;
  return STATE_DIR;
}
export const isLegacy = (root) => stateDirName(root) === LEGACY_STATE_DIR;

export function findRoot(start) {
  let d = path.resolve(start || process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(d, STATE_DIR, 'config.json')) || fs.existsSync(path.join(d, LEGACY_STATE_DIR, 'config.json'))) return d;
    const p = path.dirname(d);
    if (p === d) return null;
    d = p;
  }
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (fallback !== undefined && e.code === 'ENOENT') return fallback;
    throw new UserError(`Cannot read ${file}: ${e.message}`);
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export const paths = (root) => {
  const dir = path.join(root, stateDirName(root));
  return {
    specflow: dir,
    config: path.join(dir, 'config.json'),
    backlog: path.join(dir, 'backlog.json'),
    memory: path.join(dir, 'memory.json'),
    cache: path.join(dir, 'cache'),
    scan: path.join(dir, 'cache', 'scan.json'),
    specs: path.join(root, 'specs'),
  };
};

export const emptyMemory = () => ({ schema_version: 2, preferences: {}, decisions: [], lessons: [] });

/** Fills schema-v2 fields on a feature in memory (0.4.0 workspaces lack them). Never overwrites a value. */
export function normalizeFeature(f) {
  f.kind ??= 'feature';
  f.lane ??= defaultLane(f.kind);
  f.parent ??= null;
  f.milestone ??= null;
  f.tags ??= [];
  f.origin ??= null;
  f.rework ??= [];
  f.size_waiver ??= null;
  f.checkpoint ??= null;
  f.dropped ??= null;
  f.delivery ??= {};
  f.release_progress ??= {};
  return f;
}

export function normalizeBacklog(b) {
  b.focus ??= null;
  b.parked ??= [];
  b.next_question ??= 1;
  b.questions ??= [];
  for (const f of b.features) normalizeFeature(f);
  return b;
}

// Config reads go through helpers so a 0.4.0 config needs no rewrite.
export const slicingCfg = (ctx) => ({ ...SLICING_DEFAULTS, ...(ctx.config.slicing || {}) });
export const liteGates = (ctx) => ctx.config.lanes?.lite?.gates || LITE_GATES_DEFAULT;
export const currentMilestone = (ctx) => ctx.config.current_milestone || null;

/** Milestone filter for next/status: items in the current milestone, plus urgent-tagged and bug items. No milestone set = everything. */
export function inMilestoneScope(ctx, f) {
  const m = currentMilestone(ctx);
  return !m || f.milestone === m || f.tags.includes('urgent') || f.kind === 'bug';
}

export function load(root) {
  const p = paths(root);
  const ctx = {
    root,
    config: readJson(p.config),
    backlog: normalizeBacklog(readJson(p.backlog, { schema_version: 1, next_id: 1, features: [] })),
    memory: { ...emptyMemory(), ...readJson(p.memory, {}) },
    saveMemory() { writeJson(paths(root).memory, ctx.memory); },
    // Paths are resolved at save time: an upgrade may rename the legacy state dir mid-run.
    saveConfig() { writeJson(paths(root).config, ctx.config); },
    saveBacklog() { writeJson(paths(root).backlog, ctx.backlog); },
  };
  return ctx;
}

export function requireRoot(start) {
  const root = findRoot(start);
  if (!root) throw new UserError('No .specflow/ workspace found. Run `specflow init` at the product root first.');
  return root;
}

export function getFeature(ctx, id) {
  const f = ctx.backlog.features.find((x) => x.id === id);
  if (!f) throw new UserError(`Unknown feature ${id}`);
  return f;
}

/** Non-dropped slices of a feature. A feature with any is a container: work happens in its slices. */
export const childrenOf = (ctx, id) => ctx.backlog.features.filter((x) => x.parent === id && !x.dropped);
export const isContainer = (ctx, f) => childrenOf(ctx, f.id).length > 0;

/** Where a work item's handoff file lives: next to its spec, or under .specflow/handoff/. */
export const handoffRel = (ctx, f) => (f.spec_dir ? `${f.spec_dir}/handoff.md` : `${stateDirName(ctx.root)}/handoff/${f.id}.md`);

export function getRepo(ctx, name) {
  const r = ctx.config.repos.find((x) => x.name === name);
  if (!r) throw new UserError(`Unknown repo "${name}". Registered: ${ctx.config.repos.map((x) => x.name).join(', ') || '(none)'}`);
  return r;
}

export const repoDir = (ctx, repo) => path.resolve(ctx.root, repo.path);

export const uxConfig = (ctx) => ({ design_gate_for_ui: true, require_ux_review: true, ...(ctx.config.ux || {}) });

/** A feature is UI when `ui` is a boolean, otherwise derived from its repos' `ui` flags (old backlogs lack the field). */
export function isUi(ctx, f) {
  if (typeof f.ui === 'boolean') return f.ui;
  return f.repos.some((n) => ctx.config.repos.find((r) => r.name === n)?.ui === true);
}

export function logHistory(f, event, detail) {
  f.history.push({ at: now(), event, detail });
}

export function specDirAbs(ctx, f) {
  return f.spec_dir ? path.resolve(ctx.root, f.spec_dir) : null;
}

/** Repo names sorted by deploy_order (repos without one keep their registered order, after the numbered ones). */
export function inDeployOrder(ctx, names) {
  const key = (n) => { const i = ctx.config.repos.findIndex((r) => r.name === n); return ctx.config.repos[i]?.deploy_order ?? 1e6 + i; };
  return [...names].sort((a, b) => key(a) - key(b));
}
