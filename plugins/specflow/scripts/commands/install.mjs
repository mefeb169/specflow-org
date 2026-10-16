// `specflow install|uninstall`: set the plugin up for a project without any marketplace listing,
// by driving the `claude plugin ...` CLI. It never edits Claude settings files itself.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { UserError, readJson } from '../lib/state.mjs';
import { emit, io } from './io.mjs';

export const PLUGIN = 'specflow';
export const MARKETPLACE = 'specflow-marketplace';
const SCOPES = ['project', 'user', 'local'];
// scripts/commands -> scripts -> plugins/specflow -> plugins -> repository (marketplace) root
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

/** Runs the claude CLI. SPECFLOW_CLAUDE_BIN may name a .mjs/.js script (used by tests) or an executable. */
function runClaude(args, cwd) {
  const bin = process.env.SPECFLOW_CLAUDE_BIN || 'claude';
  let r;
  if (/\.m?js$/i.test(bin)) r = spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });
  else if (process.platform === 'win32') r = spawnSync([q(bin), ...args.map(q)].join(' '), { cwd, encoding: 'utf8', shell: true });
  else r = spawnSync(bin, args, { cwd, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim(), error: r.error };
}

const show = (args) => `claude ${args.map((a) => (/\s/.test(a) ? q(a) : a)).join(' ')}`;

/** Old 0.3 installs (plugin `specflow-org`) found in the project's settings: report, never edit. */
function legacyCleanup(dir, scope) {
  const settings = readJson(path.join(dir, '.claude', 'settings.json'), {});
  const hasMarketplace = !!settings.extraKnownMarketplaces?.['specflow-org-marketplace'];
  const plugin = Object.keys(settings.enabledPlugins || {}).find((k) => k.startsWith('specflow-org@'));
  const cmds = [];
  if (plugin) cmds.push(show(['plugin', 'uninstall', plugin, '--scope', scope]));
  if (hasMarketplace) cmds.push(show(['plugin', 'marketplace', 'remove', 'specflow-org-marketplace', '--scope', scope]));
  return cmds;
}

const LEGACY_MARKETPLACE = 'specflow-org-marketplace';
const samePath = (a, b) => path.resolve(a).replace(/[\\/]+$/, '').toLowerCase() === path.resolve(b).replace(/[\\/]+$/, '').toLowerCase();

/**
 * A 0.3 install registered the marketplace `specflow-org-marketplace` for this very folder. Claude Code reuses a
 * registration by path, so the stale entry would shadow the renamed marketplace and the plugin would "not be found".
 */
function findLegacyMarketplace(dir, source) {
  const r = runClaude(['plugin', 'marketplace', 'list'], dir);
  if (r.status !== 0) return null;
  const lines = r.out.split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes(LEGACY_MARKETPLACE));
  if (i < 0) return null;
  const src = (lines[i + 1] || '').replace(/^\s*Source:\s*/, '').trim();
  const folder = (src.match(/\(([^)]+)\)/) || [])[1] || src;
  return { name: LEGACY_MARKETPLACE, source: src, shadows: fs.existsSync(source) && samePath(folder, source) };
}

function common(args, verb) {
  const f = args.flags;
  const scope = typeof f.scope === 'string' ? f.scope : 'project';
  if (!SCOPES.includes(scope)) throw new UserError(`--scope must be one of ${SCOPES.join(', ')}`);
  const dir = path.resolve(typeof f.dir === 'string' ? f.dir : process.cwd());
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new UserError(`--dir is not a directory: ${dir}`);
  const probe = runClaude(['--version'], dir);
  if (probe.error || probe.status !== 0) {
    throw new UserError(`The \`claude\` CLI was not found or did not run (${probe.error?.message || probe.out || 'exit ' + probe.status}). Install Claude Code, or set SPECFLOW_CLAUDE_BIN.`);
  }
  return { scope, dir, verb };
}

function execute(steps, dir) {
  const done = [];
  const say = io.json ? console.error : console.log; // keep stdout clean for --json
  for (const args of steps) {
    const cmd = show(args);
    say(`$ ${cmd}`);
    const r = runClaude(args, dir);
    if (r.out) say(r.out);
    done.push({ command: cmd, status: r.status });
    if (r.status !== 0) {
      throw new UserError(`Failed: ${cmd} (exit ${r.status}). Run the remaining steps by hand:\n${steps.slice(steps.indexOf(args)).map((a) => `  ${show(a)}`).join('\n')}`);
    }
  }
  return done;
}

export function cmdInstall(args) {
  const { scope, dir } = common(args, 'install');
  const source = typeof args.flags.source === 'string' ? args.flags.source : PACKAGE_ROOT;
  const isPath = fs.existsSync(source);
  if (isPath && !fs.existsSync(path.join(source, '.claude-plugin', 'marketplace.json'))) {
    throw new UserError(`No .claude-plugin/marketplace.json under ${source}. Pass --source <repo folder or owner/repo>.`);
  }
  const steps = [
    ['plugin', 'marketplace', 'add', isPath ? path.resolve(source) : source, '--scope', scope],
    ['plugin', 'install', `${PLUGIN}@${MARKETPLACE}`, '--scope', scope],
  ];
  const legacy = legacyCleanup(dir, scope);
  const stale = findLegacyMarketplace(dir, source);
  if (stale?.shadows) {
    const fix = ['plugin', 'marketplace', 'remove', LEGACY_MARKETPLACE];
    if (!args.flags['fix-legacy']) {
      throw new UserError(`An old marketplace entry "${LEGACY_MARKETPLACE}" (${stale.source}) points at this folder and would shadow the new "${MARKETPLACE}", so the plugin would not be found.\nRemove it and run install again:\n  ${show(fix)}\nor re-run with --fix-legacy to do that for you.`);
    }
    steps.unshift(fix);
  }
  const done = execute(steps, dir);
  const next = 'Open `claude` in this folder and say "set up specflow here".';
  emit({ ok: true, scope, dir, source, commands: done, legacy_cleanup: legacy, next }, () => [
    `specflow installed (scope: ${scope}) for ${dir}`,
    legacy.length ? `Old specflow-org entries found in this project's settings. Remove them with:\n${legacy.map((c) => `  ${c}`).join('\n')}` : '',
    next,
  ].filter(Boolean).join('\n'));
}

export function cmdUninstall(args) {
  const { scope, dir } = common(args, 'uninstall');
  const steps = [['plugin', 'uninstall', `${PLUGIN}@${MARKETPLACE}`, '--scope', scope]];
  if (args.flags['remove-marketplace']) steps.push(['plugin', 'marketplace', 'remove', MARKETPLACE, '--scope', scope]);
  const legacy = legacyCleanup(dir, scope);
  const done = execute(steps, dir);
  emit({ ok: true, scope, dir, commands: done, legacy_cleanup: legacy }, () => [
    `specflow uninstalled (scope: ${scope}) for ${dir}. Workspace files (.specflow/, specs/) are untouched.`,
    legacy.length ? `Old specflow-org entries found. Remove them with:\n${legacy.map((c) => `  ${c}`).join('\n')}` : '',
  ].filter(Boolean).join('\n'));
}
