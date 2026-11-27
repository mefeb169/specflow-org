// Token usage per work item, read from Claude Code's own transcripts. Read-only, no AI.
// Subagents: one transcript per agent (<session>/subagents/agent-*.jsonl, with a .meta.json naming the agent type);
// the dispatch prompt starts "specflow dispatch: role <r>. <id> ...", which attributes it. Other subagents are
// attributed to the first known item id in their first prompt.
// Main session (the PM): each turn counts toward the item named by the last specflow command the PM ran
// (dispatch, status, gate, checkpoint, ...); turns before any such command are unattributed. This is an estimate.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ID_RE = /\bF-\d{1,6}\b/g;
const DISPATCH_RE = /^specflow dispatch: role (\w+)\. (F-\d{1,6})\b/;
const CLI_RE = /\b(specflow|sflow)(\.mjs)?\b/;
export const UNATTRIBUTED = '(unattributed)';

/** Claude Code's transcript folder for a workspace root: <config>/projects/<root with every non-alphanumeric as ->. */
export function transcriptDir(root, override) {
  if (override) return path.resolve(override);
  const base = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
  const slug = path.resolve(root).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  let names = [];
  try { names = fs.readdirSync(base); } catch { return null; }
  const hit = names.find((n) => n.toLowerCase() === slug);
  return hit ? path.join(base, hit) : null;
}

const emptyTotals = () => ({ input: 0, cache_write: 0, cache_read: 0, output: 0, turns: 0 });
const add = (t, u) => {
  t.input += u.input_tokens || 0;
  t.cache_write += u.cache_creation_input_tokens || 0;
  t.cache_read += u.cache_read_input_tokens || 0;
  t.output += u.output_tokens || 0;
  t.turns += 1;
};
export const total = (t) => t.input + t.cache_write + t.cache_read + t.output;

function lines(file) {
  try { return fs.readFileSync(file, 'utf8').split('\n'); } catch { return []; }
}

const textOf = (content) => (typeof content === 'string' ? content
  : Array.isArray(content) ? content.filter((c) => c.type === 'text').map((c) => c.text).join('\n') : '');

/**
 * Scans the transcripts and returns { dir, sessions, items: { <id|UNATTRIBUTED>: { roles: { <role>: totals+models+agents } } } }.
 * `known` is the set of item ids in the backlog (other ids are ignored); `since` an ISO date (turns before it are skipped).
 */
export function scanUsage(dir, known, { since } = {}) {
  const items = {};
  const bucket = (id, role) => {
    const it = (items[id] ??= { roles: {} });
    return (it.roles[role] ??= { ...emptyTotals(), agents: 0, models: {} });
  };
  const count = (b, j) => {
    add(b, j.message.usage);
    const m = j.message.model;
    if (m && m !== '<synthetic>') b.models[m] = (b.models[m] || 0) + 1;
  };
  const after = (j) => !since || !j.timestamp || j.timestamp >= since;
  let sessions = 0;
  let files = [];
  try { files = fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')); } catch { return { dir, sessions, items }; }

  for (const name of files) {
    sessions++;
    let current = UNATTRIBUTED;
    const seen = new Set();
    for (const l of lines(path.join(dir, name))) {
      if (!l.includes('"assistant"')) continue;
      let j;
      try { j = JSON.parse(l); } catch { continue; }
      if (j.type !== 'assistant' || j.isSidechain || !j.message) continue;
      const usage = j.message.usage;
      const mid = j.message.id;
      if (usage && after(j) && !(mid && seen.has(mid))) {
        if (mid) seen.add(mid);
        count(bucket(current, 'pm'), j);
      }
      for (const c of Array.isArray(j.message.content) ? j.message.content : []) {
        const cmd = c.type === 'tool_use' && (c.name === 'Bash' || c.name === 'PowerShell') ? String(c.input?.command || '') : '';
        if (!cmd || !CLI_RE.test(cmd)) continue;
        const ids = (cmd.match(ID_RE) || []).filter((id) => known.has(id));
        if (ids.length) current = ids[ids.length - 1];
      }
    }

    const subDir = path.join(dir, name.slice(0, -'.jsonl'.length), 'subagents');
    let subs = [];
    try { subs = fs.readdirSync(subDir).filter((n) => n.endsWith('.jsonl')); } catch { /* no subagents */ }
    for (const s of subs) {
      const file = path.join(subDir, s);
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8')); } catch { /* older versions */ }
      const type = String(meta.agentType || 'subagent');
      let role = type.startsWith('specflow:') ? type.slice('specflow:'.length) : `other:${type}`;
      let id = null;
      const seenSub = new Set();
      let counted = false;
      for (const l of lines(file)) {
        if (!l) continue;
        let j;
        try { j = JSON.parse(l); } catch { continue; }
        if (id === null && j.type === 'user') {
          const text = textOf(j.message?.content);
          const d = text.match(DISPATCH_RE);
          if (d && known.has(d[2])) { id = d[2]; role = d[1] === 'reviewer' ? 'reviewer' : role; }
          else id = (text.match(ID_RE) || []).find((x) => known.has(x)) || UNATTRIBUTED;
          continue;
        }
        if (j.type !== 'assistant' || !j.message?.usage || !after(j)) continue;
        const mid = j.message.id;
        if (mid && seenSub.has(mid)) continue;
        if (mid) seenSub.add(mid);
        const b = bucket(id || UNATTRIBUTED, role);
        count(b, j);
        if (!counted) { b.agents += 1; counted = true; }
      }
    }
  }
  return { dir, sessions, items };
}

/** Sums a role map into totals (+ agent count). */
export function sumRoles(roles, filter = () => true) {
  const t = { ...emptyTotals(), agents: 0 };
  for (const [r, v] of Object.entries(roles)) {
    if (!filter(r)) continue;
    for (const k of Object.keys(emptyTotals())) t[k] += v[k];
    t.agents += v.agents;
  }
  return t;
}

export const fmtTokens = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
