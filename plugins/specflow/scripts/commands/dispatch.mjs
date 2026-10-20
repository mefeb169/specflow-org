import { getFeature, logHistory } from '../lib/state.mjs';
import { dispatch } from '../lib/dispatch.mjs';
import { emit, need } from './io.mjs';

export function cmdDispatch(args, ctx) {
  const f = getFeature(ctx, need(args._[0], 'usage: dispatch <id> [--role r] [--repo name] [--question Q-n]'));
  const flags = {};
  for (const k of ['role', 'repo', 'question']) if (args.flags[k] !== undefined) flags[k] = args.flags[k];
  const d = dispatch(ctx, f, flags);
  logHistory(f, 'link', `dispatch ${d.role}`);
  ctx.saveBacklog();
  emit(d, () => [
    d.agent ? `agent: ${d.agent}  model: ${d.model}${d.covered_by ? `  (covers disabled ${d.requested_role})` : ''}` : `PM does this itself (${d.requested_role} disabled)`,
    d.repos_todo.length > 1 ? `repos to do (deploy order): ${d.repos_todo.join(', ')}` : '',
    'prompt:',
    d.prompt,
  ].filter(Boolean).join('\n'));
}
