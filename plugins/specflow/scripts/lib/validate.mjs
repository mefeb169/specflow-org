import fs from 'node:fs';
import path from 'node:path';
import { BLOCKER_KINDS, DEP_TYPES, GATES, KINDS, LANES, PRIORITIES, STAGES } from './lifecycle.mjs';
import { repoDir } from './state.mjs';

export function validate(ctx) {
  const e = [];
  const { config, backlog } = ctx;
  if (![1, 2].includes(config.schema_version)) e.push(`config.schema_version is ${config.schema_version}, expected 1 or 2`);
  if (![1, 2].includes(backlog.schema_version)) e.push(`backlog.schema_version is ${backlog.schema_version}, expected 1 or 2`);
  const repoNames = new Set();
  for (const r of config.repos || []) {
    if (repoNames.has(r.name)) e.push(`duplicate repo name "${r.name}"`);
    repoNames.add(r.name);
    if (!fs.existsSync(repoDir(ctx, r))) e.push(`repo "${r.name}" path does not exist: ${r.path}`);
  }
  for (const r of config.repos || []) if (r.ui !== undefined && typeof r.ui !== 'boolean') e.push(`repo "${r.name}": ui must be a boolean`);
  for (const [k, v] of Object.entries(config.ux || {})) if (typeof v !== 'boolean') e.push(`config.ux.${k} must be a boolean`);
  const ids = new Set(backlog.features.map((f) => f.id));
  if (ids.size !== backlog.features.length) e.push('duplicate feature ids in backlog');
  for (const f of backlog.features) {
    const at = (m) => e.push(`${f.id}: ${m}`);
    if (!STAGES.includes(f.stage)) at(`unknown stage "${f.stage}"`);
    if (f.ui !== undefined && typeof f.ui !== 'boolean') at('ui must be a boolean');
    if (!PRIORITIES.includes(f.priority)) at(`unknown priority "${f.priority}"`);
    for (const r of f.repos) if (!repoNames.has(r)) at(`unknown repo "${r}"`);
    for (const r of Object.keys(f.branches || {})) if (!repoNames.has(r)) at(`branch recorded for unknown repo "${r}"`);
    for (const d of f.deps) {
      if (!ids.has(d.id)) at(`dependency on unknown feature ${d.id}`);
      if (!DEP_TYPES.includes(d.type)) at(`unknown dependency type "${d.type}"`);
    }
    for (const g of Object.keys(f.gates || {})) if (!GATES.includes(g)) at(`unknown gate "${g}"`);
    for (const b of f.blockers) if (!BLOCKER_KINDS.includes(b.kind)) at(`blocker ${b.id} has unknown kind "${b.kind}"`);
    if (f.spec_dir && !fs.existsSync(path.resolve(ctx.root, f.spec_dir))) at(`spec_dir "${f.spec_dir}" does not exist`);
    if (!KINDS.includes(f.kind)) at(`unknown kind "${f.kind}"`);
    if (!LANES.includes(f.lane)) at(`unknown lane "${f.lane}"`);
    if (f.parent) {
      const p = backlog.features.find((x) => x.id === f.parent);
      if (!p) at(`parent ${f.parent} does not exist`);
      else if (p.kind !== 'feature') at(`parent ${f.parent} is not a feature`);
    } else if (f.kind === 'slice') at('slice has no parent');
    if (f.parent && f.kind !== 'slice') at('only slices may have a parent');
    if (f.spec_dir === null && STAGES.indexOf(f.stage) >= 2) at(`stage "${f.stage}" requires a linked spec_dir`);
  }
  if (backlog.focus && !ids.has(backlog.focus)) e.push(`focus ${backlog.focus} does not exist`);
  for (const p of backlog.parked || []) if (!ids.has(p)) e.push(`parked item ${p} does not exist`);
  return e;
}
