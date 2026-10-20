// Work items beyond features: slices, issues, questions, intake.
import fs from 'node:fs';
import path from 'node:path';
import { UserError, getFeature, now, posix } from '../lib/state.mjs';
import { ISSUE_KINDS, KINDS, PRIORITIES, QUESTION_TARGETS, defaultLane } from '../lib/lifecycle.mjs';
import { addDecision } from '../lib/memory.mjs';
import { table } from '../lib/render.mjs';
import { emit, need, csv, checkRepos } from './io.mjs';
import { createItem } from './feature.mjs';

export function cmdSlice(args, ctx) {
  const [sub, parentId] = args._;
  if (sub !== 'add') throw new UserError('usage: slice add <feature> --title s [--repos a,b] [--summary s] [--value s]');
  const parent = getFeature(ctx, need(parentId, 'parent feature id required'));
  if (parent.kind !== 'feature') throw new UserError(`${parent.id} is a ${parent.kind}; slices belong to a feature`);
  if (parent.dropped) throw new UserError(`${parent.id} is dropped`);
  const f = args.flags;
  const slice = createItem(ctx, {
    title: need(f.title, '--title required'),
    kind: 'slice', lane: 'lite', parent: parent.id,
    repos: typeof f.repos === 'string' ? checkRepos(ctx, csv(f.repos)) : [...parent.repos],
    summary: typeof f.summary === 'string' ? f.summary : '', value: typeof f.value === 'string' ? f.value : '',
    priority: parent.priority, mvp: parent.mvp, ui: parent.ui, risk: parent.risk, milestone: parent.milestone, tags: [...parent.tags],
  });
  ctx.saveBacklog();
  emit(slice, slice.id);
}

/** Creates a lite-lane backlog item for a problem found outside the current scope (caller saves). */
export function newIssue(ctx, text, f, extra = {}) {
  const kind = f.kind || 'bug';
  if (!ISSUE_KINDS.includes(kind)) throw new UserError(`kind must be one of ${ISSUE_KINDS.join(', ')}`);
  const from = typeof f.from === 'string' ? getFeature(ctx, f.from).id : null;
  const prio = extra.priority || f.priority || 'P2';
  if (!PRIORITIES.includes(prio)) throw new UserError(`priority must be one of ${PRIORITIES.join(', ')}`);
  return createItem(ctx, {
    title: text.length > 80 ? `${text.slice(0, 77)}...` : text, summary: text, kind, lane: 'lite', priority: prio,
    repos: typeof f.repos === 'string' ? checkRepos(ctx, csv(f.repos)) : [], milestone: typeof f.milestone === 'string' ? f.milestone : null,
    origin: { from, source: null, note: '' }, ...extra,
  });
}

export function cmdIssue(args, ctx) {
  const [sub, text] = args._;
  if (sub === 'add') {
    const item = newIssue(ctx, need(text, 'issue text required'), args.flags);
    ctx.saveBacklog();
    return emit(item, item.id);
  }
  if (sub === 'list') {
    const rows = ctx.backlog.features
      .filter((f) => ISSUE_KINDS.includes(f.kind) && f.stage !== 'done' && !f.dropped)
      .map((f) => ({ id: f.id, kind: f.kind, priority: f.priority, stage: f.stage, from: f.origin?.from || '', title: f.title }));
    return emit(rows, () => (rows.length ? table(rows, ['id', 'kind', 'priority', 'stage', 'from', 'title']) : 'No open issues.'));
  }
  throw new UserError('usage: issue add "<text>" [--kind bug|debt|chore] [--from id] [--repos a,b] [--priority P] [--milestone m] | issue list');
}

export function cmdQuestion(args, ctx) {
  const [sub, a, b] = args._;
  const f = args.flags;
  const bl = ctx.backlog;
  if (sub === 'add') {
    const text = need(a, 'question text required');
    const to = f.to || 'user';
    if (!QUESTION_TARGETS.includes(to)) throw new UserError(`--to must be one of ${QUESTION_TARGETS.join(', ')}`);
    const feature = typeof f.feature === 'string' ? getFeature(ctx, f.feature).id : null;
    const q = { id: `Q-${bl.next_question++}`, at: now(), text, feature, to, status: 'open', answer: null, by: null, answered_at: null };
    bl.questions.push(q);
    ctx.saveBacklog();
    return emit(q, q.id);
  }
  if (sub === 'answer') {
    const q = bl.questions.find((x) => x.id === a);
    if (!q) throw new UserError(`unknown question ${a}`);
    if (q.status !== 'open') throw new UserError(`${q.id} is already answered`);
    const answer = need(b, 'answer text required');
    q.status = 'answered'; q.answer = answer; q.by = typeof f.by === 'string' ? f.by : 'user'; q.answered_at = now();
    const d = addDecision(ctx, { question: q.text, answer, scope: q.feature, by: q.by });
    ctx.saveBacklog();
    ctx.saveMemory();
    return emit({ question: q, decision: d }, `${q.id} answered; logged as decision ${d.id}`);
  }
  if (sub === 'list') {
    const rows = bl.questions.filter((q) => (!f.open || q.status === 'open') && (typeof f.feature !== 'string' || q.feature === f.feature))
      .map((q) => ({ id: q.id, status: q.status, to: q.to, feature: q.feature || '', text: q.text }));
    return emit(rows, () => (rows.length ? table(rows, ['id', 'status', 'to', 'feature', 'text']) : 'No questions.'));
  }
  throw new UserError('usage: question add "<text>" [--feature id] [--to user|product|architect|ux|build|verify] | question answer Q-n "<answer>" [--by who] | question list [--open] [--feature id]');
}

/** Title from the first "# " heading (fallback: file name); summary from the first plain paragraph. */
export function parseIntake(text, file) {
  const lines = text.split(/\r?\n/);
  const h = lines.find((l) => /^#\s+\S/.test(l));
  const title = h ? h.replace(/^#\s+/, '').trim() : path.basename(file, path.extname(file));
  const para = [];
  for (const l of lines) {
    if (/^\s*#/.test(l) || !l.trim()) { if (para.length) break; continue; }
    para.push(l.trim());
  }
  return { title, summary: para.join(' ').slice(0, 400) };
}

export function cmdIntake(args, ctx) {
  const f = args.flags;
  const given = need(args._[0], 'usage: intake <file> [--kind feature|bug|debt|chore] [--title s]');
  const abs = [path.resolve(given), path.resolve(ctx.root, given)].find((x) => fs.existsSync(x) && fs.statSync(x).isFile());
  if (!abs) throw new UserError(`File not found: ${given}`);
  const kind = f.kind || 'feature';
  if (!KINDS.includes(kind) || kind === 'slice') throw new UserError('--kind must be feature, bug, debt or chore');
  const source = posix(path.relative(ctx.root, abs));
  const dup = ctx.backlog.features.find((x) => x.origin?.source === source);
  if (dup) throw new UserError(`${source} was already imported as ${dup.id}`);
  const p = parseIntake(fs.readFileSync(abs, 'utf8'), abs);
  const prio = f.priority || 'P2';
  if (!PRIORITIES.includes(prio)) throw new UserError(`priority must be one of ${PRIORITIES.join(', ')}`);
  const item = createItem(ctx, {
    title: typeof f.title === 'string' ? f.title : p.title, summary: p.summary, kind, lane: defaultLane(kind), priority: prio,
    repos: typeof f.repos === 'string' ? checkRepos(ctx, csv(f.repos)) : [], origin: { from: null, source, note: '' },
  });
  ctx.saveBacklog();
  emit(item, `${item.id} ${item.title} (from ${source})`);
}
