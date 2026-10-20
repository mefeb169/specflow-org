// Project memory: preferences, decisions, lessons (.specflow/memory.json).
import { UserError, getFeature, now } from '../lib/state.mjs';
import { LESSON_STATUSES } from '../lib/lifecycle.mjs';
import { addDecision, addLesson } from '../lib/memory.mjs';
import { table } from '../lib/render.mjs';
import { emit, need } from './io.mjs';

const by = (args) => (typeof args.flags.by === 'string' ? args.flags.by : 'user');

export function cmdPref(args, ctx) {
  const [sub, key, ...rest] = args._;
  const prefs = ctx.memory.preferences;
  if (sub === 'set') {
    const value = need(rest.join(' '), 'usage: pref set <key> <value> [--by role]');
    prefs[need(key, 'preference key required')] = { value, at: now(), by: by(args) };
    ctx.saveMemory();
    return emit({ key, ...prefs[key] }, `${key} = ${value}`);
  }
  if (sub === 'rm') {
    if (!prefs[need(key, 'preference key required')]) throw new UserError(`unknown preference "${key}"`);
    delete prefs[key];
    ctx.saveMemory();
    return emit({ removed: key }, `${key} removed`);
  }
  if (sub === 'list') {
    const rows = Object.entries(prefs).map(([k, v]) => ({ key: k, value: v.value, by: v.by, at: v.at }));
    return emit(rows, () => (rows.length ? table(rows, ['key', 'value', 'by', 'at']) : 'No preferences recorded.'));
  }
  throw new UserError('usage: pref set <key> <value> [--by role] | pref list | pref rm <key>');
}

export function cmdDecision(args, ctx) {
  const [sub, a, b] = args._;
  const f = args.flags;
  if (sub === 'add') {
    const scope = typeof f.feature === 'string' ? getFeature(ctx, f.feature).id : null;
    const d = addDecision(ctx, { question: need(a, 'usage: decision add "<question>" "<answer>" [--feature id] [--by who]'), answer: need(b, 'answer required'), scope, by: by(args) });
    ctx.saveMemory();
    return emit(d, `${d.id} recorded`);
  }
  if (sub === 'list') {
    const limit = f.limit === undefined ? 20 : Number(f.limit);
    if (!Number.isInteger(limit) || limit < 1) throw new UserError('--limit must be a positive integer');
    const rows = ctx.memory.decisions.filter((d) => typeof f.feature !== 'string' || d.scope === f.feature).slice().reverse().slice(0, limit);
    return emit(rows, () => (rows.length ? rows.map((d) => `${d.id} [${d.scope}] ${d.question} -> ${d.answer} (${d.by}, ${d.at.slice(0, 10)})`).join('\n') : 'No decisions recorded.'));
  }
  throw new UserError('usage: decision add "<question>" "<answer>" [--feature id] [--by who] | decision list [--feature id] [--limit n]');
}

export function cmdLesson(args, ctx) {
  const [sub, a] = args._;
  const lessons = ctx.memory.lessons;
  if (sub === 'add') {
    const from = typeof args.flags.from === 'string' ? getFeature(ctx, args.flags.from).id : null;
    const l = addLesson(ctx, { text: need(a, 'usage: lesson add "<text>" [--from id]'), from });
    ctx.saveMemory();
    return emit(l, `${l.id} proposed`);
  }
  if (sub === 'list') {
    const st = args.flags.status;
    if (typeof st === 'string' && !LESSON_STATUSES.includes(st)) throw new UserError(`--status must be one of ${LESSON_STATUSES.join(', ')}`);
    const rows = lessons.filter((l) => typeof st !== 'string' || l.status === st);
    return emit(rows, () => (rows.length ? rows.map((l) => `${l.id} [${l.status}] ${l.text}${l.from ? ` (from ${l.from})` : ''}`).join('\n') : 'No lessons.'));
  }
  if (sub === 'promote' || sub === 'reject') {
    const l = lessons.find((x) => x.id === a);
    if (!l) throw new UserError(`unknown lesson ${a}`);
    l.status = sub === 'promote' ? 'promoted' : 'rejected';
    ctx.saveMemory();
    return emit(l, `${l.id} ${l.status}${sub === 'promote' ? '. Writing the rule into CLAUDE.md or conventions is a separate edit the owner approves.' : ''}`);
  }
  throw new UserError('usage: lesson add "<text>" [--from id] | lesson list [--status s] | lesson promote|reject L-n');
}
