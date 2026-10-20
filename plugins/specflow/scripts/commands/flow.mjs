// Session flow: focus, interrupts, milestones.
import { UserError, currentMilestone, getFeature, handoffRel, logHistory } from '../lib/state.mjs';
import { currentBranch, isDirty } from '../lib/git.mjs';
import { repoDir } from '../lib/state.mjs';
import { refreshHandoff, writeHandoff } from '../lib/handoff.mjs';
import { now } from '../lib/state.mjs';
import { emit, need } from './io.mjs';
import { newIssue } from './work.mjs';

const line = (f) => `${f.id} ${f.title} [${f.stage}]`;

export function cmdFocus(args, ctx) {
  const bl = ctx.backlog;
  const id = args._[0];
  if (args.flags.clear) {
    bl.focus = null;
    ctx.saveBacklog();
    return emit({ focus: null }, 'Focus cleared.');
  }
  if (!id) {
    const f = bl.focus ? getFeature(ctx, bl.focus) : null;
    return emit({ focus: bl.focus, parked: bl.parked }, f ? `Focus: ${line(f)}` : 'No focus set.');
  }
  const f = getFeature(ctx, id);
  if (f.stage === 'done') throw new UserError(`${id} is done`);
  if (f.dropped) throw new UserError(`${id} is dropped`);
  bl.focus = f.id;
  bl.parked = bl.parked.filter((x) => x !== f.id);
  ctx.saveBacklog();
  emit({ focus: f.id }, `Focus: ${line(f)}`);
}

/** In-flight items (implementing or verifying) whose repos overlap `repos`, with branch and dirty state. */
export function conflictsFor(ctx, selfId, repos) {
  const out = [];
  for (const o of ctx.backlog.features) {
    if (o.id === selfId || o.dropped || !['implementing', 'verifying'].includes(o.stage)) continue;
    for (const r of o.repos.filter((x) => repos.includes(x))) {
      const repo = ctx.config.repos.find((x) => x.name === r);
      const dir = repo && repoDir(ctx, repo);
      out.push({ id: o.id, title: o.title, stage: o.stage, repo: r, branch: o.branches[r] || null, current_branch: dir ? currentBranch(dir) : null, dirty: dir ? isDirty(dir) : false });
    }
  }
  return out;
}

export function cmdInterrupt(args, ctx) {
  const text = need(args._[0], 'usage: interrupt "<text>" [--kind bug|chore] [--repos a,b]');
  const bl = ctx.backlog;
  const kind = args.flags.kind || 'bug';
  if (!['bug', 'chore'].includes(kind)) throw new UserError('--kind must be bug or chore');
  const prev = bl.focus ? getFeature(ctx, bl.focus) : null;
  const item = newIssue(ctx, text, { ...args.flags, kind, from: prev ? prev.id : args.flags.from }, { priority: 'P0', tags: ['urgent'] });
  if (prev) {
    prev.checkpoint = { at: now(), note: prev.checkpoint?.note || `parked for interrupt ${item.id}`, next: prev.checkpoint?.next || '' };
    if (!bl.parked.includes(prev.id)) bl.parked.push(prev.id);
    logHistory(prev, 'link', `parked for interrupt ${item.id}`);
  }
  bl.focus = item.id;
  logHistory(item, 'link', 'interrupt: focused');
  ctx.saveBacklog();
  if (prev) refreshHandoff(ctx, prev);
  const conflicts = conflictsFor(ctx, item.id, item.repos);
  emit({ id: item.id, parked: prev ? prev.id : null, conflicts }, () => [
    `${item.id} created (P0, urgent) and focused.${prev ? ` ${prev.id} parked; resume it with \`specflow resume\`.` : ''}`,
    item.repos.length ? '' : 'No repos given: conflicts not checked (set them with `feature set <id> repos a,b`).',
    ...conflicts.map((c) => `CONFLICT ${c.id} [${c.stage}] also touches ${c.repo}: branch ${c.branch || '(none)'}, repo is on ${c.current_branch || '?'}${c.dirty ? ', has UNCOMMITTED changes' : ''}`),
    'Branches are not switched automatically.',
  ].filter(Boolean).join('\n'));
}

export function cmdResume(args, ctx) {
  const bl = ctx.backlog;
  const id = bl.parked.pop();
  if (!id) return emit({ resumed: null }, 'Nothing parked.');
  const f = getFeature(ctx, id);
  bl.focus = id;
  logHistory(f, 'link', 'resumed');
  ctx.saveBacklog();
  const handoff = handoffRel(ctx, f);
  emit({ resumed: id, handoff, next: f.checkpoint?.next || null }, `Resumed ${line(f)}\nHandoff: ${handoff}\nNext: ${f.checkpoint?.next || '(no checkpoint next recorded)'}`);
}

export function cmdCheckpoint(args, ctx) {
  const f = getFeature(ctx, need(args._[0], 'usage: checkpoint <id> [--note s] [--next s]'));
  const flag = (k, prev) => (typeof args.flags[k] === 'string' ? args.flags[k] : prev || '');
  f.checkpoint = { at: now(), note: flag('note', f.checkpoint?.note), next: flag('next', f.checkpoint?.next) };
  logHistory(f, 'link', 'checkpoint');
  ctx.saveBacklog();
  const file = writeHandoff(ctx, f);
  emit({ id: f.id, handoff: file, checkpoint: f.checkpoint }, `${f.id}: checkpoint saved; handoff at ${file}`);
}

export function cmdMilestone(args, ctx) {
  const [sub, name] = args._;
  if (!sub) return emit({ current_milestone: currentMilestone(ctx) }, `Current milestone: ${currentMilestone(ctx) || '(none)'}`);
  if (sub === 'set') ctx.config.current_milestone = need(name, 'milestone name required');
  else if (sub === 'clear') ctx.config.current_milestone = null;
  else throw new UserError('usage: milestone set <name> | milestone clear');
  ctx.saveConfig();
  emit({ current_milestone: ctx.config.current_milestone }, ctx.config.current_milestone ? `Current milestone: ${ctx.config.current_milestone}` : 'Milestone cleared.');
}
