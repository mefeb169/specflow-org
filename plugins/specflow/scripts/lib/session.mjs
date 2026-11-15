// Session budget: long main sessions re-read their whole context on every turn, which dominates token use.
// The Stop hook measures the context of the last main-session turn from the transcript and, past the budget,
// asks the PM to checkpoint and hand over to a fresh session. Pure helpers; the hook does the I/O around them.
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './state.mjs';

export const SESSION_DEFAULTS = { context_budget: 150000, repeat_every: 100000 };
const TAIL_BYTES = 512 * 1024;
const KEEP_SESSIONS = 20;

export const sessionCfg = (ctx) => ({ ...SESSION_DEFAULTS, ...(ctx.config.session || {}) });

export function validateSession(ctx) {
  const s = sessionCfg(ctx);
  const e = [];
  for (const k of ['context_budget', 'repeat_every']) {
    if (!(Number.isInteger(s[k]) && s[k] >= 0)) e.push(`session.${k} must be a whole number >= 0 (0 turns it off)`);
  }
  return e;
}

/** Context size (input + cache read + cache write tokens) of the last main-session assistant turn, or null. */
export function lastContextTokens(transcriptPath) {
  let text;
  try {
    const size = fs.statSync(transcriptPath).size;
    const fd = fs.openSync(transcriptPath, 'r');
    try {
      const len = Math.min(size, TAIL_BYTES);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      text = buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return null; }
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l.includes('"usage"')) continue;
    let j;
    try { j = JSON.parse(l); } catch { continue; } // the first line of the tail may be cut
    if (j.type !== 'assistant' || j.isSidechain || !j.message?.usage) continue;
    const u = j.message.usage;
    return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  }
  return null;
}

const markerFile = (ctx) => path.join(paths(ctx.root).cache, 'session-budget.json');

/**
 * Decides whether this stop should be turned into a hand-over request. Returns the reason text or null.
 * Fires once when the context passes the budget, then again every `repeat_every` tokens above the last warning.
 * Never fires twice in a row (`stop_hook_active`), and resets after a compaction shrinks the context.
 */
export function budgetCheck(ctx, input, tokens = lastContextTokens(input.transcript_path)) {
  const cfg = sessionCfg(ctx);
  if (!cfg.context_budget || input.stop_hook_active || !input.session_id || tokens === null) return null;
  const file = markerFile(ctx);
  let marks = {};
  try { marks = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  const sid = input.session_id;
  let last = marks[sid]?.warned_at || 0;
  if (last && tokens < last / 2) last = 0; // compacted or cleared: start over
  const due = last ? (cfg.repeat_every > 0 && tokens >= last + cfg.repeat_every) : tokens >= cfg.context_budget;
  if (!due) {
    if (marks[sid] && last === 0) { delete marks[sid]; save(file, marks); }
    return null;
  }
  marks[sid] = { warned_at: tokens, at: new Date().toISOString() };
  save(file, marks);
  const focus = ctx.backlog.focus && ctx.backlog.features.find((f) => f.id === ctx.backlog.focus);
  const k = (n) => `${Math.round(n / 1000)}k`;
  return [
    `specflow session budget: this session's context is about ${k(tokens)} tokens (budget ${k(cfg.context_budget)}). Every further turn re-reads all of it.`,
    focus
      ? `Before you stop: run \`specflow checkpoint ${focus.id} --next "<the next concrete step>"\`, then tell the user in one or two lines that the state is saved and that a fresh session (/clear, then "continue") resumes ${focus.id} from its handoff.`
      : 'Before you stop: tell the user in one or two lines that the state is on disk and that a fresh session (/clear) will continue more cheaply.',
    'Do not start new work in this session. (Budget: config session.context_budget; 0 turns this off.)',
  ].join(' ');
}

function save(file, marks) {
  const keep = Object.entries(marks).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at))).slice(0, KEEP_SESSIONS);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(keep), null, 2));
  } catch { /* best effort */ }
}
