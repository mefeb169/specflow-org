import { getFeature, inMilestoneScope } from '../lib/state.mjs';
import { featureDetail, ranking, statusRow, table } from '../lib/render.mjs';
import { validate } from '../lib/validate.mjs';
import { emit } from './io.mjs';

export function cmdStatus(args, ctx) {
  const id = args._[0];
  if (id) {
    const d = featureDetail(ctx, getFeature(ctx, id));
    return emit(d, () => [
      `${d.id} ${d.title} [${d.stage}]${d.blocked ? ' BLOCKED' : ''}  priority ${d.priority}  repos: ${d.repos.join(', ')}`,
      `spec: ${d.spec_dir || '(none)'}   branches: ${JSON.stringify(d.branches)}`,
      `gates required: ${d.required_gates.join(', ') || '-'} | pending: ${d.pending_gates.join(', ') || '-'}`,
      d.parent ? `slice of ${d.parent} | lane ${d.lane}` : d.lane === 'lite' ? `lane lite (${d.kind})` : '',
      d.rework.total ? `rework: ${d.rework.open ? `round ${d.rework.open} open` : 'none open'}, ${d.rework.total} round(s) total` : '',
      ...d.slices.map((s) => `slice ${s.id} [${s.stage}] ${s.title}`),
      d.ui ? `ui: yes | ux.md: ${d.ux.complete ? 'complete' : `incomplete (${d.ux.failures.length})`}` : '',
      ...Object.entries(d.ui_evidence).map(([r, u]) => `ui evidence ${r}: design system ${u.design_system.length ? u.design_system.join(', ') : 'NONE found'}; visual tools: ${u.visual_test_tools.join(', ') || 'none'}`),
      d.tasks ? `tasks: ${d.tasks.done}/${d.tasks.total}` : '',
      ...d.evidence.map((e) => `evidence ${e.repo}: ${e.last ? `${e.last.result} @${String(e.last.sha).slice(0, 8)} ${e.fresh ? '(fresh)' : '(STALE vs HEAD ' + String(e.head).slice(0, 8) + ')'}` : 'none'}`),
      ...d.held_by.map((h) => `held by: ${h}`),
      ...d.blockers.filter((b) => b.open).map((b) => `blocker ${b.id} [${b.kind}]: ${b.text}`),
      `next: ${d.next}`,
    ].filter(Boolean).join('\n'));
  }
  const all = !!args.flags.all;
  const rows = ctx.backlog.features.filter((f) => all || (f.stage !== 'done' && !f.dropped && inMilestoneScope(ctx, f))).map((f) => statusRow(ctx, f));
  const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);
  emit(rows, () => (rows.length ? table(rows.map((r) => ({ ...r, title: cut(r.title, 40), next: cut(r.next, 60), blocked: r.blocked ? 'yes' : '' })), ['id', 'kind', 'title', 'stage', 'priority', 'blocked', 'next']) : ctx.backlog.features.length ? 'Nothing active (done, dropped and out-of-milestone items are hidden; --all shows them).' : 'Backlog is empty.'));
}

export function cmdNext(args, ctx) {
  const r = ranking(ctx, { all: !!args.flags.all });
  emit(r, () => [
    `Filter: ${r.filter}${r.filter === 'none' ? '' : ' (--all disables)'}`,
    r.ready.length ? 'Ready (best first):' : 'No ready features.',
    ...r.ready.map((x, i) => `${i + 1}. ${x.id} ${x.title} [${x.stage}]: ${x.reasons.join('; ')}\n   next: ${x.next_action}`),
    r.not_ready.length ? 'Not ready:' : '',
    ...r.not_ready.map((x) => `- ${x.id} ${x.title}: ${x.held_by.join(' | ')}`),
  ].filter(Boolean).join('\n'));
}

export function cmdValidate(args, ctx) {
  const errors = validate(ctx);
  emit({ ok: errors.length === 0, errors }, errors.length ? errors.map((e) => `- ${e}`).join('\n') : 'valid');
  if (errors.length) process.exitCode = 1;
}

