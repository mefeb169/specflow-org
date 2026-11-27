// Session budget: long main sessions re-read their whole context on every turn, which dominates token use.
// The Stop hook measures the context of the last main-session turn from the transcript and, past the budget,
// asks the PM to checkpoint and hand over to a fresh session. Pure helpers; the hook does the I/O around them.
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './state.mjs';

// 0.9.0 lowered the budget from 150k/100k: measured on three workspaces, 100k cuts PM context tokens by about 20-25%.
// 0.10.0: boundary clearing measured at +1.3 points over the plain budget (docs/usage-findings.md section 7), so it is opt-in.
export const SESSION_DEFAULTS = { context_budget: 100000, repeat_every: 50000, clear_at: "budget", soft_budget: 80000 };
export const CLEAR_MODES = ["budget", "boundary"];
export const SESSION_DEFAULTS_0_8 = { context_budget: 150000, repeat_every: 100000 };
const TAIL_BYTES = 512 * 1024;
const KEEP_SESSIONS = 20;

export const sessionCfg = (ctx) => ({ ...SESSION_DEFAULTS, ...(ctx.config.session || {}) });

export function validateSession(ctx) {
  const s = sessionCfg(ctx);
  const e = [];
  for (const k of ['context_budget', 'repeat_every', 'soft_budget']) {
    if (!(Number.isInteger(s[k]) && s[k] >= 0)) e.push(`session.${k} must be a whole number >= 0 (0 turns it off)`);
  }
  if (!CLEAR_MODES.includes(s.clear_at)) e.push(`session.clear_at must be one of ${CLEAR_MODES.join(", ")}`);
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
    if (marks[sid]?.warned_at && last === 0) { delete marks[sid].warned_at; save(file, marks); }
    return null;
  }
  marks[sid] = { ...marks[sid], warned_at: tokens, at: new Date().toISOString() };
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

/** SessionStart hook: remember when this session began (boundary events before it do not count). Best effort. */
export function markSessionStart(ctx, input) {
  if (!input.session_id) return;
  const file = markerFile(ctx);
  let marks = {};
  try { marks = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  if (marks[input.session_id]?.started_at) return;
  const at = new Date().toISOString();
  marks[input.session_id] = { ...marks[input.session_id], started_at: at, at };
  save(file, marks);
}

const BOUNDARY_STAGE = /-> (verifying|accepted|released|done)\b|rework round \d+:/;
/** History entries after `since` that end a unit of work: a gate approved, verifying/accepted/released/done reached, a rework round started. */
export function boundaryEvents(ctx, since) {
  const out = [];
  for (const f of ctx.backlog.features) {
    for (const h of f.history || []) {
      if (!(h.at > since)) continue;
      if (h.event === 'gate' && /approved/.test(h.detail || '')) out.push({ id: f.id, at: h.at, text: `${f.id} ${h.detail}` });
      else if (h.event === 'stage' && BOUNDARY_STAGE.test(h.detail || '')) out.push({ id: f.id, at: h.at, text: `${f.id} ${String(h.detail).split(' (')[0].replace(/^\S+ -> /, 'moved to ')}` });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * Opt-in (session.clear_at: boundary): once the context is past soft_budget and a unit of work finished since the session
 * started (or since the last clear point), ask the PM to checkpoint and tell the user it is safe to /clear.
 * Runs after budgetCheck (the hard budget wins). Returns the reason text or null.
 */
export function boundaryCheck(ctx, input, tokens = lastContextTokens(input.transcript_path)) {
  const cfg = sessionCfg(ctx);
  if (cfg.clear_at !== 'boundary' || !cfg.soft_budget || input.stop_hook_active || !input.session_id || tokens === null || tokens < cfg.soft_budget) return null;
  const file = markerFile(ctx);
  let marks = {};
  try { marks = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  const sid = input.session_id;
  const now = new Date().toISOString();
  const since = marks[sid]?.boundary_at || marks[sid]?.started_at;
  if (!since) { marks[sid] = { ...marks[sid], started_at: now, at: now }; save(file, marks); return null; } // no start marker: begin counting now
  const events = boundaryEvents(ctx, since);
  if (!events.length) return null;
  marks[sid] = { ...marks[sid], boundary_at: now, at: now };
  save(file, marks);
  const last = events[events.length - 1];
  return [
    `specflow clear point: ${last.text}, and this session's context is about ${Math.round(tokens / 1000)}k tokens.`,
    `Before you stop: run \`specflow checkpoint ${last.id} --next "<the next concrete step>"\`, then tell the user in one line that the state is saved and it is safe to /clear and say "continue".`,
    'Do not start new work in this session. (Config: session.clear_at, session.soft_budget.)',
  ].join(' ');
}

function save(file, marks) {
  const keep = Object.entries(marks).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at))).slice(0, KEEP_SESSIONS);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(keep), null, 2));
  } catch { /* best effort */ }
}
