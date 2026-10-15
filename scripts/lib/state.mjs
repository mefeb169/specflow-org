import fs from 'node:fs';
import path from 'node:path';

export class UserError extends Error {}

export const now = () => new Date().toISOString();
export const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
export const posix = (p) => p.split(path.sep).join('/');

export function findRoot(start) {
  let d = path.resolve(start || process.cwd());
  for (;;) {
    if (fs.existsSync(path.join(d, '.sdlc', 'config.json'))) return d;
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

export const paths = (root) => ({
  sdlc: path.join(root, '.sdlc'),
  config: path.join(root, '.sdlc', 'config.json'),
  backlog: path.join(root, '.sdlc', 'backlog.json'),
  cache: path.join(root, '.sdlc', 'cache'),
  scan: path.join(root, '.sdlc', 'cache', 'scan.json'),
  specs: path.join(root, 'specs'),
});

export function load(root) {
  const p = paths(root);
  const ctx = {
    root,
    config: readJson(p.config),
    backlog: readJson(p.backlog, { schema_version: 1, next_id: 1, features: [] }),
    saveConfig() { writeJson(p.config, ctx.config); },
    saveBacklog() { writeJson(p.backlog, ctx.backlog); },
  };
  return ctx;
}

export function requireRoot(start) {
  const root = findRoot(start);
  if (!root) throw new UserError('No .sdlc/ workspace found. Run `sdlc init` at the product root first.');
  return root;
}

export function getFeature(ctx, id) {
  const f = ctx.backlog.features.find((x) => x.id === id);
  if (!f) throw new UserError(`Unknown feature ${id}`);
  return f;
}

export function getRepo(ctx, name) {
  const r = ctx.config.repos.find((x) => x.name === name);
  if (!r) throw new UserError(`Unknown repo "${name}". Registered: ${ctx.config.repos.map((x) => x.name).join(', ') || '(none)'}`);
  return r;
}

export const repoDir = (ctx, repo) => path.resolve(ctx.root, repo.path);

export function logHistory(f, event, detail) {
  f.history.push({ at: now(), event, detail });
}

export function specDirAbs(ctx, f) {
  return f.spec_dir ? path.resolve(ctx.root, f.spec_dir) : null;
}
