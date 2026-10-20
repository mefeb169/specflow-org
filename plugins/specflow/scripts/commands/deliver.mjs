import { UserError, getFeature } from '../lib/state.mjs';
import { deliver, mergeAll, refreshDelivery } from '../lib/deliver.mjs';
import { refreshHandoff } from '../lib/handoff.mjs';
import { table } from '../lib/render.mjs';
import { emit, need } from './io.mjs';

const USAGE = 'usage: deliver <id> [--dry-run] | deliver status <id> | deliver merge <id>';

const prTable = (rows) => table(rows.map((r) => ({ repo: r.repo, branch: r.branch || '-', state: r.pr_state || '-', pr: r.pr_url || '-', note: r.error || '' })), ['repo', 'branch', 'state', 'pr', 'note']);

function status(ctx, f, extra = {}) {
  const r = refreshDelivery(ctx, f);
  ctx.saveBacklog();
  refreshHandoff(ctx, f);
  const text = () => [Object.keys(f.delivery).length ? prTable(r.rows) : `${f.id} has no delivered PRs.`, r.merged ? 'all pull requests are merged' : ''].filter(Boolean).join('\n');
  emit({ id: f.id, ...extra, merged: r.merged, repos: r.rows }, text);
  if (r.rows.some((x) => x.error)) process.exitCode = 1;
}

export function cmdDeliver(args, ctx) {
  const [a, b] = args._;
  if (a === 'status') return status(ctx, getFeature(ctx, need(b, USAGE)));
  if (a === 'merge') {
    const f = getFeature(ctx, need(b, USAGE));
    const m = mergeAll(ctx, f);
    ctx.saveBacklog();
    refreshHandoff(ctx, f);
    emit({ id: f.id, ...m }, () => [m.results.map((r) => `${r.repo}: ${r.status}${r.detail ? ` - ${r.detail}` : ''}`).join('\n'), prTable(m.rows), m.merged ? 'all pull requests are merged' : ''].filter(Boolean).join('\n'));
    if (m.results.some((r) => r.status === 'failed')) process.exitCode = 1;
    return;
  }
  const f = getFeature(ctx, need(a, USAGE));
  if (args._.length > 1) throw new UserError(USAGE);
  const dry = !!args.flags['dry-run'];
  const d = deliver(ctx, f, { dryRun: dry });
  if (!dry) { ctx.saveBacklog(); refreshHandoff(ctx, f); }
  emit(d, () => {
    if (d.dry_run) {
      return [
        `deliver ${f.id} (dry run, nothing changed)`,
        ...d.problems.map((p) => `  blocked: ${p}`),
        ...d.repos.map((r) => `  ${r.repo}: ${r.push}; PR ${r.action}${r.target ? ` -> ${r.target}` : ''}${r.pr ? ` (#${r.pr.number} ${r.pr.state})` : ''}${r.reason ? ` - ${r.reason}` : ''}`),
      ].join('\n');
    }
    return d.repos.map((r) => `${r.repo}: ${r.status}${r.pr_url ? ` ${r.pr_url}` : ''}${r.detail ? ` - ${r.detail}` : ''}`).join('\n');
  });
  if (!d.ok) process.exitCode = 1;
}
