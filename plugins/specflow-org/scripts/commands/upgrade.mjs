import { emit } from './io.mjs';
import { applyClaudeBlock } from './init.mjs';
import { MIGRATIONS } from '../lib/migrations.mjs';
import { cmpVer, frameworkVersion } from '../lib/runtime.mjs';

/** Dry-run by default: shows what an upgrade would change. `--apply` performs additive changes only. */
export function cmdUpgrade(args, ctx) {
  const have = ctx.config.framework_version || '0.0.0';
  const target = frameworkVersion();
  const apply = !!args.flags.apply;
  const pending = MIGRATIONS.filter((m) => cmpVer(m.to, have) > 0 && cmpVer(m.to, target) <= 0);
  const steps = pending.map((m) => ({ to: m.to, describe: m.describe, changes: m.plan(ctx) }));
  const block = applyClaudeBlock(ctx.root, { write: false });
  const versionBehind = cmpVer(have, target) < 0;

  if (apply) {
    for (const m of pending) m.apply(ctx);
    const wrote = applyClaudeBlock(ctx.root, { write: true });
    if (versionBehind) ctx.config.framework_version = target;
    ctx.saveConfig();
    block.status = wrote.status;
  }

  const result = { from: have, to: target, applied: apply, migrations: steps, claude_md_block: block.status, note: 'Existing workspace files (product.md, workspace-map.md, specs, backlog) are never overwritten.' };
  emit(result, () => {
    if (!versionBehind && !steps.some((s) => s.changes.length) && block.status === 'unchanged') return `Workspace is up to date (v${have}).`;
    const lines = [`${apply ? 'Upgraded' : 'Would upgrade'} workspace v${have} -> v${target}`];
    for (const s of steps) lines.push(`  [${s.to}] ${s.describe}${s.changes.length ? '' : ' (nothing to change)'}`, ...s.changes.map((c) => `      + ${c}`));
    lines.push(`  CLAUDE.md managed block: ${block.status}`);
    lines.push(`  ${result.note}`);
    if (!apply) lines.push('Run `sdlc upgrade --apply` to apply.');
    return lines.join('\n');
  });
}
