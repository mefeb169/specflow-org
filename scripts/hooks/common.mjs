import fs from 'node:fs';
import { findRoot, load } from '../lib/state.mjs';

export function readInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Returns { input, ctx } or null when not inside an sdlc workspace (hooks must then be no-ops). */
export function open() {
  const input = readInput();
  const root = findRoot(input.cwd || process.cwd());
  if (!root) return null;
  try {
    return { input, ctx: load(root) };
  } catch {
    return null;
  }
}
