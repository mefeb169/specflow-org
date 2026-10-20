import path from 'node:path';
import { UserError, childrenOf, getFeature, slicingCfg, getRepo, logHistory, now, repoDir } from '../lib/state.mjs';
import { GATES, GATE_STAGE, STAGES, stageIdx } from '../lib/lifecycle.mjs';
import { checkEntry, checkTasks, clearDownstreamGates, requiredGates, sizeCounts, traits } from '../lib/gates.mjs';
import { branchExists, isDirty, isGitRepo, switchBranch } from '../lib/git.mjs';
import { refreshHandoff } from '../lib/handoff.mjs';
import { io, emit, need } from './io.mjs';

export function cmdStage(args, ctx) {
  const [sub, id, target] = args._;
  if (sub !== 'set') throw new UserError('usage: stage set <id> <stage> [--reason s]');
  const f = getFeature(ctx, id);
  if (!STAGES.includes(target)) throw new UserError(`stage must be one of ${STAGES.join(', ')}`);
  const cur = stageIdx(f.stage); const tgt = stageIdx(target);
  const reason = typeof args.flags.reason === 'string' ? args.flags.reason : '';
  if (tgt === cur) throw new UserError(`${id} is already at ${target}`);
  if (tgt < cur) {
    need(reason, 'Moving a feature backward requires --reason');
    const cleared = clearDownstreamGates(f, target);
    f.revisit = { stage: target, reason };
    logHistory(f, 'stage', `${f.stage} -> ${target} (revisit: ${reason}); cleared gates: ${cleared.join(', ') || 'none'}`);
    f.stage = target;
    ctx.saveBacklog();
    refreshHandoff(ctx, f);
    return emit({ id, stage: target, cleared_gates: cleared }, `${id} moved back to ${target}; cleared gates: ${cleared.join(', ') || 'none'}`);
  }
  const kids = childrenOf(ctx, f.id);
  if (kids.length) {
    const open = kids.filter((k) => k.stage !== 'done');
    if (target === 'done') {
      if (open.length) throw new UserError(`${id} is a container; slices not done yet: ${open.map((k) => `${k.id} [${k.stage}]`).join(', ')}`);
      logHistory(f, 'stage', `${f.stage} -> done (all ${kids.length} slice(s) done; one-step rule waived for containers)`);
      f.stage = 'done'; f.revisit = null;
      ctx.saveBacklog();
      refreshHandoff(ctx, f);
      return emit({ id, stage: 'done' }, `${id} is now done (all slices done)`);
    }
    if (tgt > stageIdx('planned')) throw new UserError(`${id} is a container; work happens in its slices: ${kids.map((k) => `${k.id} [${k.stage}]`).join(', ')}`);
  }
  if (tgt !== cur + 1) throw new UserError(`${id} is at ${f.stage}; advance one stage at a time (next: ${STAGES[cur + 1]})`);
  let failures = checkEntry(ctx, f, target);
  if (target === 'done' && reason) failures = failures.filter((x) => !x.startsWith('no post-release evidence'));
  if (failures.length) {
    const msg = `Cannot move ${id} ${f.stage} -> ${target}:\n${failures.map((x) => `  - ${x}`).join('\n')}`;
    if (io.json) { console.log(JSON.stringify({ ok: false, failures }, null, 2)); process.exit(1); }
    throw new UserError(msg);
  }
  logHistory(f, 'stage', `${f.stage} -> ${target}${reason ? ` (${reason})` : ''}`);
  if (target === 'accepted') for (const r of f.rework) if (!r.closed_at) r.closed_at = now();
  f.stage = target; f.revisit = null;
  ctx.saveBacklog();
  refreshHandoff(ctx, f);
  emit({ id, stage: target }, `${id} is now ${target}`);
}

export function cmdGate(args, ctx) {
  const [sub, id, gate] = args._;
  const f = getFeature(ctx, id);
  if (sub === 'required') {
    const req = requiredGates(ctx, f);
    return emit({ required: req, pending: req.filter((g) => !f.gates[g]), traits: traits(ctx, f) }, () => `required: ${req.join(', ') || '(none)'}\npending: ${req.filter((g) => !f.gates[g]).join(', ') || '(none)'}`);
  }
  if (sub !== 'approve') throw new UserError('usage: gate approve <id> <gate> [--note s] | gate required <id>');
  if (!GATES.includes(gate)) throw new UserError(`gate must be one of ${GATES.join(', ')}`);
  if (f.stage !== GATE_STAGE[gate]) throw new UserError(`Gate "${gate}" is approved while the feature is at stage "${GATE_STAGE[gate]}"; ${id} is at "${f.stage}".`);
  f.gates[gate] = { approved_at: now(), by: 'human', note: typeof args.flags.note === 'string' ? args.flags.note : '' };
  logHistory(f, 'gate', `${gate} approved`);
  ctx.saveBacklog();
  refreshHandoff(ctx, f);
  emit({ id, gate, approved: true }, `${id}: gate "${gate}" approved`);
}

export function cmdCheck(args, ctx) {
  const [sub, id] = args._;
  if (!['tasks', 'size'].includes(sub)) throw new UserError('usage: check tasks|size <id>');
  const f = getFeature(ctx, id);
  if (sub === 'size') {
    const c = sizeCounts(ctx, f);
    if (!c) throw new UserError(`${id} has no tasks.md yet`);
    const lim = slicingCfg(ctx);
    const r = { ...c, limit: lim, waiver: f.size_waiver, within_limits: c.tasks <= lim.max_tasks && c.migrations <= lim.max_migrations };
    return emit(r, `${id}: ${c.tasks} tasks, ${c.migrations} migration task(s); limit ${lim.max_tasks}/${lim.max_migrations}${f.size_waiver ? ` (waiver: ${f.size_waiver})` : r.within_limits ? ' (ok)' : ' (TOO LARGE: split into slices or record a waiver)'}`);
  }
  const r = checkTasks(ctx, f);
  emit(r, () => `${r.done}/${r.total} tasks done. ${Object.entries(r.perRepo).map(([k, v]) => `${k}: ${v.done}/${v.total}`).join(', ')}${r.errors.length ? `\nERRORS:\n${r.errors.map((e) => `  - ${e}`).join('\n')}` : '\nall tasks tagged'}`);
  if (r.errors.length) process.exitCode = 1;
}

export function cmdBranches(args, ctx) {
  const [sub, id] = args._;
  if (sub !== 'create') throw new UserError('usage: branches create <id>');
  const f = getFeature(ctx, id);
  if (!['planned', 'implementing'].includes(f.stage)) throw new UserError(`Branches are created once the feature is "planned" (implement gate approved); ${id} is at "${f.stage}".`);
  if (requiredGates(ctx, f).includes('implement') && !f.gates.implement) throw new UserError(`Gate "implement" must be approved first (specflow gate approve ${id} implement).`);
  need(f.spec_dir, `${id} has no spec_dir`);
  const slug = path.basename(f.spec_dir);
  const name = (ctx.config.branch_pattern || '{spec_slug}').replace('{spec_slug}', slug).replace('{id}', f.id);
  const results = [];
  for (const rn of f.repos) {
    const repo = getRepo(ctx, rn); const dir = repoDir(ctx, repo);
    if (!isGitRepo(dir)) { results.push({ repo: rn, status: 'skipped', detail: 'not a git repository' }); continue; }
    const existed = branchExists(dir, name);
    if (isDirty(dir) && !(existed && f.branches[rn] === name)) { results.push({ repo: rn, status: 'refused', detail: 'uncommitted changes; commit or stash first' }); continue; }
    const r = switchBranch(dir, name);
    if (!r.ok) { results.push({ repo: rn, status: 'failed', detail: r.err }); continue; }
    f.branches[rn] = name;
    results.push({ repo: rn, status: existed ? 'switched' : 'created', branch: name });
  }
  logHistory(f, 'link', `branches: ${results.map((r) => `${r.repo}=${r.status}`).join(', ')}`);
  ctx.saveBacklog();
  emit(results, () => results.map((r) => `${r.repo}: ${r.status}${r.branch ? ` (${r.branch})` : ''}${r.detail ? ` - ${r.detail}` : ''}`).join('\n'));
  if (results.some((r) => r.status === 'refused' || r.status === 'failed')) process.exitCode = 1;
}

