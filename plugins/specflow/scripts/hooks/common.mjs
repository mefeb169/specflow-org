import fs from 'node:fs';
import { findRoot, load } from '../lib/state.mjs';
import { nodeOk } from '../lib/runtime.mjs';

export function readInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Returns { input, ctx } or null when not inside a specflow workspace (hooks must then be no-ops). */
export function open() {
  if (!nodeOk()) return null; // too old a runtime: stay silent, never break the session
  const input = readInput();
  const root = findRoot(input.cwd || process.cwd());
  if (!root) return null;
  try {
    return { input, ctx: load(root) };
  } catch {
    return null;
  }
}
