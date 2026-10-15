// Pure decision logic for the PreToolUse hook. Returns null (fall through) or { decision, reason }.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_DESTRUCTIVE_PATTERNS } from './lifecycle.mjs';
import { norm } from './state.mjs';

const INSTRUCTION_FILES = /(^|[\\/])(CLAUDE\.md|CLAUDE\.local\.md|AGENTS\.md|GEMINI\.md|\.cursorrules|\.windsurfrules|copilot-instructions\.md)$/i;
const BEGIN = '<!-- sdlc:begin -->';
const END = '<!-- sdlc:end -->';
const NON_SOURCE = ['specs', '.sdlc', '.specify', '.claude'];

const deny = (reason) => ({ decision: 'deny', reason });
const ask = (reason) => ({ decision: 'ask', reason });
// Permission modes in which a hook-forced "ask" may never reach a human.
const UNATTENDED_MODES = ['bypassPermissions', 'dontAsk'];

function within(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function editOnlyTouchesMarkers(file, input) {
  if (input.old_string === undefined) return false; // Write/MultiEdit: can't prove it
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return false; }
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  if (b < 0 || e < b) return false;
  const block = text.slice(b, e + END.length);
  return block.includes(input.old_string) && text.split(input.old_string).length === 2;
}

export function decide({ root, config, backlog, input, cwd }) {
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const unattended = UNATTENDED_MODES.includes(input.permission_mode) && config.guards?.deny_in_unattended_modes !== false;
  // High-stakes actions need a real human prompt; where none can be shown, refuse instead of asking.
  const gate = (reason) => (unattended
    ? deny(`${reason} Refused: permission mode "${input.permission_mode}" cannot show an interactive prompt. Switch to a mode that asks (default, acceptEdits or auto) and retry.`)
    : ask(reason));

  if (tool === 'Bash') {
    const cmd = String(ti.command || '');
    const g = cmd.match(/sdlc(?:\.mjs)?["']?\s+gate\s+approve\s+(\S+)\s+(\S+)/i);
    if (g || /sdlc(?:\.mjs)?["']?\s+gate\s+approve\b/i.test(cmd)) {
      return gate(g ? `Human approval of gate "${g[2]}" for ${g[1]}. Only approve if you reviewed the artifacts.` : 'Human approval of a lifecycle gate.');
    }
    if (/sdlc(?:\.mjs)?["']?\s+(init|branches\s+create|upgrade\s+--apply)\b/i.test(cmd) || /\bspecify\s+init\b/i.test(cmd)) {
      return gate('Framework/Spec Kit setup or branch creation changes the workspace; please confirm.');
    }
    if (/\.sdlc.(backlog|config)\.json/i.test(cmd) && /(>|\btee\b|sed\s+-i|Set-Content|Out-File|Add-Content|writeFile|\brm\b|\bmv\b|\bcp\b|Remove-Item|Move-Item|Rename-Item)/i.test(cmd)) {
      return gate('Shell command appears to modify sdlc state files directly. Use the sdlc CLI instead.');
    }
    const patterns = [...(config.guards?.destructive_bash_patterns || DEFAULT_DESTRUCTIVE_PATTERNS), ...(config.guards?.extra_bash_patterns || [])];
    for (const p of patterns) {
      let re;
      try { re = new RegExp(p, 'i'); } catch { continue; }
      if (re.test(cmd)) return gate(`Destructive or outward-facing command (matched /${p}/).`);
    }
    return null;
  }

  const raw = ti.file_path || ti.notebook_path;
  if (!raw) return null;
  const file = path.resolve(cwd || root, raw);
  const rootN = norm(root);
  const fileN = norm(file);
  if (!within(fileN, rootN)) return null;

  const rel = path.relative(root, file).split(path.sep).join('/');
  if (rel === '.sdlc/backlog.json' || rel === '.sdlc/config.json') {
    return deny('Lifecycle state is managed by the sdlc CLI. Use `sdlc` subcommands instead of editing this file.');
  }
  if (INSTRUCTION_FILES.test(file) && fs.existsSync(file)) {
    if (rel === 'CLAUDE.md' && editOnlyTouchesMarkers(file, ti)) return null;
    return ask('Editing an existing instruction file. The framework only manages its own marked block; confirm this change.');
  }

  const first = rel.split('/')[0];
  if (NON_SOURCE.includes(first)) return null;
  const mode = config.guards?.source_edit_outside_implementing || 'ask';
  if (mode === 'off') return null;
  // Longest matching registered repo path owns the file.
  const owner = [...(config.repos || [])]
    .filter((r) => within(fileN, norm(path.resolve(root, r.path))))
    .sort((a, b) => path.resolve(root, b.path).length - path.resolve(root, a.path).length)[0];
  if (!owner) return null;
  const active = backlog.features.some((f) => f.stage === 'implementing' && f.repos.includes(owner.name));
  if (active) return null;
  const reason = `Source edit in repo "${owner.name}" while no feature touching it is in stage "implementing".`;
  return mode === 'deny' ? deny(reason) : ask(reason);
}
