// Pure decision logic for the PreToolUse hook. Returns null (fall through) or { decision, reason }.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_DESTRUCTIVE_PATTERNS } from './lifecycle.mjs';
import { norm } from './state.mjs';

const INSTRUCTION_FILES = /(^|[\\/])(CLAUDE\.md|CLAUDE\.local\.md|AGENTS\.md|GEMINI\.md|\.cursorrules|\.windsurfrules|copilot-instructions\.md)$/i;
// Managed CLAUDE.md block markers: current and legacy (workspaces created before 0.4 use `sdlc:`).
const MARKERS = [['<!-- specflow:begin -->', '<!-- specflow:end -->'], ['<!-- sdlc:begin -->', '<!-- sdlc:end -->']];
// State directories: current and legacy.
const STATE_DIRS = ['.specflow', '.sdlc'];
const NON_SOURCE = ['specs', ...STATE_DIRS, '.specify', '.claude'];

// Actions only the PM (main session) may take. Hook input carries agent_id when the call comes from inside a subagent.
// `deliver status` and `deliver ... --dry-run` only read, so they are not guarded. The dry-run exemption is judged per
// shell segment with comments removed, so `deliver F-1 # --dry-run` or `deliver F-1; echo --dry-run` is still guarded.
const DELIVER_CALL = /(?:specflow|sflow|sdlc)(?:\.mjs)?["']?\s+deliver\b(?!\s+status\b)/i;
const DELIVER = {
  test: (cmd) => cmd.split(/[;&|\n]/).some((seg) => {
    const code = seg.replace(/(^|\s)#.*$/, '');
    return DELIVER_CALL.test(code) && !/(^|\s)--dry-run\b/.test(code);
  }),
};
const RELEASE = /(?:specflow|sflow|sdlc)(?:\.mjs)?["']?\s+release\s+(run|verify)\b/i;
const PM_ONLY = [
  DELIVER,
  RELEASE,
  /(?:specflow|sflow|sdlc)(?:\.mjs)?["']?\s+(?:gate\s+approve|init|upgrade\s+--apply|install|uninstall)\b/i,
  /\bspecify\s+init\b/i,
  /\bgit\s+(?:-C\s+\S+\s+)?push\b/i,
  /\bgh\s+pr\s+(?:create|merge)\b/i,
];
const PM_ONLY_REASON = 'Only the specflow PM (main session) may do this; return it to the PM in your report.';

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
  for (const [BEGIN, END] of MARKERS) {
    const b = text.indexOf(BEGIN);
    const e = text.indexOf(END);
    if (b < 0 || e < b) continue;
    const block = text.slice(b, e + END.length);
    if (block.includes(input.old_string) && text.split(input.old_string).length === 2) return true;
  }
  return false;
}

/**
 * Drops the BODY of `cat ... <<EOF` heredocs (file content being written, e.g. a spec that mentions
 * `specflow branches create`) so prose is not mistaken for commands. The first line (including any
 * redirect target) is kept, and heredocs fed to other programs (`bash <<EOF`) are left intact.
 */
export function stripCatHeredocBodies(cmd) {
  return cmd.replace(/(\bcat\b[^\n<]*<<-?\s*(['"]?)([A-Za-z_]\w*)\2[^\n]*)\n[\s\S]*?\n[ \t]*\3[ \t]*(?=\n|$)/g, '$1');
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
    const cmd = stripCatHeredocBodies(String(ti.command || ''));
    // The CLI is invoked as specflow, sflow, specflow.mjs, or (legacy) sdlc / sdlc.mjs.
    if (input.agent_id && PM_ONLY.some((re) => re.test(cmd))) return deny(PM_ONLY_REASON);
    const g = cmd.match(/(?:specflow|sflow|sdlc)(?:\.mjs)?["']?\s+gate\s+approve\s+(\S+)\s+(\S+)/i);
    if (g || /(?:specflow|sflow|sdlc)(?:\.mjs)?["']?\s+gate\s+approve\b/i.test(cmd)) {
      return gate(g ? `Human approval of gate "${g[2]}" for ${g[1]}. Only approve if you reviewed the artifacts.` : 'Human approval of a lifecycle gate.');
    }
    if (DELIVER.test(cmd)) {
      const m = cmd.match(/deliver\s+(merge\s+)?(\S+)/i);
      return gate(`${m && m[1] ? 'Merging' : 'Pushing branches and opening or updating'} pull requests for ${m ? m[2] : 'the item'} (specflow deliver). Outward-facing: confirm.`);
    }
    const rl = cmd.match(RELEASE);
    if (rl) {
      const verify = rl[1].toLowerCase() === 'verify';
      const rc = config.release || {};
      const one = cmd.match(/--step\s+(\S+)/);
      const list = verify ? (rc.post_release || []) : (rc.steps || []).filter((s) => s.approval === 'none' && !['migrate', 'restart'].includes(s.kind));
      const names = one ? [one[1]] : list.map((s) => s.name);
      return gate(`Release ${verify ? 'post-release checks' : 'steps'} run commands against real systems: ${names.join(', ') || '(none configured)'}. Confirm.`);
    }
    if (/(?:specflow|sflow|sdlc)(?:\.mjs)?["']?\s+(init|branches\s+create|upgrade\s+--apply|install|uninstall)\b/i.test(cmd) || /\bspecify\s+init\b/i.test(cmd)) {
      return gate('Framework/Spec Kit setup, install/uninstall or branch creation changes the workspace; please confirm.');
    }
    if (/\.(specflow|sdlc).(backlog|config|memory)\.json/i.test(cmd) && /(>|\btee\b|sed\s+-i|Set-Content|Out-File|Add-Content|writeFile|\brm\b|\bmv\b|\bcp\b|Remove-Item|Move-Item|Rename-Item)/i.test(cmd)) {
      return gate('Shell command appears to modify specflow state files directly. Use the specflow CLI instead.');
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
  if (STATE_DIRS.some((d) => rel === `${d}/backlog.json` || rel === `${d}/config.json` || rel === `${d}/memory.json`)) {
    return deny('Lifecycle state is managed by the specflow CLI. Use `specflow` subcommands instead of editing this file.');
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
