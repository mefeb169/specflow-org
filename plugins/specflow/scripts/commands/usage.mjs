import { UserError, getFeature } from '../lib/state.mjs';
import { UNATTRIBUTED, fmtTokens, scanUsage, sumRoles, total, transcriptDir } from '../lib/usage.mjs';
import { emit } from './io.mjs';

const FINISHED = new Set(['accepted', 'released', 'done']);
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

function row(t) {
  return { tokens: total(t), input: t.input, cache_write: t.cache_write, cache_read: t.cache_read, output: t.output, turns: t.turns, agents: t.agents };
}

export function cmdUsage(args, ctx) {
  const dir = transcriptDir(ctx.root, typeof args.flags.transcripts === 'string' ? args.flags.transcripts : undefined);
  if (!dir) throw new UserError(`No Claude Code transcripts found for ${ctx.root} (looked in ~/.claude/projects). Pass --transcripts <dir>.`);
  const since = typeof args.flags.since === 'string' ? args.flags.since : undefined;
  if (since && Number.isNaN(Date.parse(since))) throw new UserError('--since must be a date, e.g. 2026-11-01');
  const byId = new Map(ctx.backlog.features.map((f) => [f.id, f]));
  const scan = scanUsage(dir, new Set(byId.keys()), { since: since && new Date(since).toISOString() });
  const id = args._[0];

  if (id) {
    const f = getFeature(ctx, id);
    const roles = scan.items[f.id]?.roles || {};
    const out = Object.entries(roles).map(([role, v]) => ({ role, ...row(v), models: v.models })).sort((a, b) => b.tokens - a.tokens);
    const all = row(sumRoles(roles));
    return emit({ id: f.id, stage: f.stage, dir, since: since || null, total: all, roles: out }, () => [
      `${f.id} "${f.title}" (${f.stage}): ${fmtTokens(all.tokens)} tokens in ${all.turns} turns, ${all.agents} subagent(s)${since ? ` since ${since}` : ''}`,
      `${pad('role', 26)}${lpad('tokens', 9)}${lpad('fresh', 8)}${lpad('cache rd', 10)}${lpad('output', 9)}${lpad('turns', 7)}${lpad('agents', 8)}  models`,
      ...out.map((r) => `${pad(r.role, 26)}${lpad(fmtTokens(r.tokens), 9)}${lpad(fmtTokens(r.input + r.cache_write), 8)}${lpad(fmtTokens(r.cache_read), 10)}${lpad(fmtTokens(r.output), 9)}${lpad(r.turns, 7)}${lpad(r.agents, 8)}  ${Object.keys(r.models).map((m) => m.replace(/^claude-/, '')).join(', ')}`),
      out.length ? 'pm = main-session turns after the PM last named this item in a specflow command (an estimate).' : 'No usage recorded for this item.',
    ].join('\n'));
  }

  const items = Object.entries(scan.items).map(([k, v]) => {
    const f = byId.get(k);
    return { id: k, title: f?.title || '', stage: f?.stage || '', pm: total(sumRoles(v.roles, (r) => r === 'pm')), team: total(sumRoles(v.roles, (r) => r !== 'pm')), ...row(sumRoles(v.roles)) };
  }).sort((a, b) => b.tokens - a.tokens);
  const grand = items.reduce((s, x) => s + x.tokens, 0);
  const finished = items.filter((x) => FINISHED.has(x.stage));
  const perFinished = finished.length ? Math.round(finished.reduce((s, x) => s + x.tokens, 0) / finished.length) : null;
  const shown = args.flags.all ? items : items.slice(0, 20);
  emit({ dir, since: since || null, sessions: scan.sessions, total_tokens: grand, finished_items: finished.length, tokens_per_finished_item: perFinished, items }, () => [
    `${scan.sessions} transcript(s) scanned: ${fmtTokens(grand)} tokens${since ? ` since ${since}` : ''} (input + cache write + cache read + output; fresh = input + cache write, which costs far more per token than a cache read).`,
    perFinished !== null ? `Per finished item (accepted, released or done): ${fmtTokens(perFinished)} tokens on average over ${finished.length}.` : 'No finished item has recorded usage yet.',
    `${pad('item', 16)}${pad('stage', 14)}${lpad('total', 8)}${lpad('fresh', 8)}${lpad('output', 8)}${lpad('pm', 8)}${lpad('team', 8)}${lpad('agents', 8)}  title`,
    ...shown.map((x) => `${pad(x.id, 16)}${pad(x.stage, 14)}${lpad(fmtTokens(x.tokens), 8)}${lpad(fmtTokens(x.input + x.cache_write), 8)}${lpad(fmtTokens(x.output), 8)}${lpad(fmtTokens(x.pm), 8)}${lpad(fmtTokens(x.team), 8)}${lpad(x.agents, 8)}  ${x.title.slice(0, 40)}`),
    items.length > shown.length ? `(+${items.length - shown.length} more: --all)` : '',
    `${UNATTRIBUTED}: main-session turns before the PM named an item, and subagents whose prompt names none. Details: specflow usage <id>.`,
  ].filter(Boolean).join('\n'));
}
