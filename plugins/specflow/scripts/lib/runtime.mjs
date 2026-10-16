import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIN_NODE = 18;
// SPECFLOW_FAKE_NODE_MAJOR lets tests simulate an old runtime.
export const nodeMajor = () => Number(process.env.SPECFLOW_FAKE_NODE_MAJOR || process.versions.node.split('.')[0]);
export const nodeOk = () => nodeMajor() >= MIN_NODE;

// Spec Kit versions this framework has been tested with (min inclusive, max exclusive).
export const TESTED_SPECKIT = { min: '1.2.0', max: '2.0.0' };

/** Version of the installed plugin (from its plugin.json). SPECFLOW_FAKE_FRAMEWORK_VERSION is for tests. */
export function frameworkVersion() {
  if (process.env.SPECFLOW_FAKE_FRAMEWORK_VERSION) return process.env.SPECFLOW_FAKE_FRAMEWORK_VERSION;
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude-plugin', 'plugin.json');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).version || '0.0.0'; } catch { return '0.0.0'; }
}

/** Compares dotted numeric versions: -1, 0 or 1. Non-numeric suffixes are ignored. */
export function cmpVer(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1;
  }
  return 0;
}

/** Message when the workspace was created by an older plugin version than the one running, else null. */
export function workspaceStale(config) {
  const have = config.framework_version || '0.0.0';
  const cur = frameworkVersion();
  return cmpVer(have, cur) < 0 ? `workspace created by v${have}, plugin is v${cur}: run \`specflow upgrade\` (dry run), then \`specflow upgrade --apply\`` : null;
}

export const speckitInRange = (v) => !!v && cmpVer(v, TESTED_SPECKIT.min) >= 0 && cmpVer(v, TESTED_SPECKIT.max) < 0;
