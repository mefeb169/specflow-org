// Work items beyond features: slices, issues, questions, intake.
import { UserError, getFeature } from '../lib/state.mjs';
import { PRIORITIES } from '../lib/lifecycle.mjs';
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
