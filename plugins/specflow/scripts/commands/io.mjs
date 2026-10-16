import { UserError, getRepo } from '../lib/state.mjs';

const BOOL = new Set(['json', 'mvp', 'confirm', 'root-is-repo', 'help', 'apply', 'version', 'remove-marketplace']);

export function parseArgs(argv) {
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

/** Output mode shared by all commands (set once by the dispatcher). */
export const io = { json: false };
export const emit = (data, text) => { console.log(io.json ? JSON.stringify(data, null, 2) : (typeof text === 'function' ? text() : text ?? JSON.stringify(data, null, 2))); };
export const need = (v, msg) => { if (v === undefined || v === null || v === '' || v === true) throw new UserError(msg); return v; };
export const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

export function checkRepos(ctx, names) {
  for (const n of names) getRepo(ctx, n);
  return names;
}
