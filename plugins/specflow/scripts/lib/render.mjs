import fs from 'node:fs';
import path from 'node:path';
import { STAGES, STAGE_ROLE, stageIdx } from './lifecycle.mjs';
import { depsStatus, openBlockers, requiredGates, checkTasks, uxCheck } from './gates.mjs';
import { currentBranch, headSha } from './git.mjs';
import { latestEvidence, readEvidence } from './verify.mjs';
import { isLegacy, isUi, paths, readJson, repoDir, specDirAbs } from './state.mjs';
import { workspaceStale } from './runtime.mjs';

const PRIO = { P0: 0, P1: 1, P2: 2, P3: 3 };
const RISK = { low: 0, med: 1, high: 2 };

export function nextAction(ctx, f) {
  if (f.stage === 'done') return 'complete';
  const open = openBlockers(f);
  if (open.length) return `resolve blocker ${open[0].id}: ${open[0].text.slice(0, 50)}`;
  if (f.stage === 'specified') {
    const ux = uxCheck(ctx, f);
    if (ux.length) return `write ux.md (flows, states, copy, a11y) [specflow:ux]: ${ux[0]}`;
  }
  const base = STAGE_ROLE[f.stage];
  return `${base.action} [${base.role || '-'}]`;
}

export function ranking(ctx) {
  const ready = [];
  const notReady = [];
  const acceptedIdx = stageIdx('accepted');
  for (const f of ctx.backlog.features) {
    if (stageIdx(f.stage) >= acceptedIdx) continue;
    const holding = depsStatus(ctx, f);
    const blockers = openBlockers(f).map((b) => `${b.id} (${b.kind}): ${b.text}`);
    if (holding.length || blockers.length) { notReady.push({ id: f.id, title: f.title, held_by: [...holding, ...blockers] }); continue; }
    const unblocks = ctx.backlog.features.filter((x) => x.deps.some((d) => d.id === f.id && (d.type === 'requires' || d.type === 'technical'))).length;
    const inflight = stageIdx(f.stage) >= 2 && stageIdx(f.stage) <= 6;
    const reasons = [];
    if (inflight) reasons.push(`already in flight (${f.stage})`);
    if (f.mvp) reasons.push('MVP');
    reasons.push(`priority ${f.priority}`);
    if (unblocks) reasons.push(`unblocks ${unblocks} feature(s)`);
    reasons.push(`risk ${f.risk}`);
    const deps = f.deps.filter((d) => d.type === 'requires' || d.type === 'technical');
    if (deps.length) reasons.push(`dependencies satisfied: ${deps.map((d) => d.id).join(', ')}`);
    ready.push({ f, inflight, unblocks, reasons });
  }
  ready.sort((a, b) =>
    (b.inflight - a.inflight) || (b.f.mvp - a.f.mvp) || (PRIO[a.f.priority] - PRIO[b.f.priority]) ||
    (b.unblocks - a.unblocks) || (RISK[a.f.risk] - RISK[b.f.risk]) || a.f.id.localeCompare(b.f.id));
  return {
    ready: ready.map(({ f, reasons }) => ({ id: f.id, title: f.title, stage: f.stage, priority: f.priority, mvp: f.mvp, repos: f.repos, reasons, next_action: nextAction(ctx, f) })),
    not_ready: notReady,
  };
}

export function statusRow(ctx, f) {
  return { id: f.id, title: f.title, stage: f.stage, blocked: openBlockers(f).length > 0 || depsStatus(ctx, f).length > 0, priority: f.priority, repos: f.repos, next: nextAction(ctx, f) };
}

/** Design-system evidence the last scan found in this feature's UI repos (deterministic input for specflow:ux's mode choice). */
function uiEvidence(ctx, f) {
  const scan = readJson(paths(ctx.root).scan, null);
  const out = {};
  for (const name of f.repos) {
    const r = scan?.repos?.find((x) => x.name === name);
    if (r?.ui?.is_ui) out[name] = { design_system: r.ui.design_system, visual_test_tools: r.ui.visual_test_tools };
  }
  return out;
}

export function featureDetail(ctx, f) {
  const ev = readEvidence(ctx, f);
  const tasks = f.spec_dir ? checkTasks(ctx, f) : null;
  const evidence = f.repos.map((name) => {
    const repo = ctx.config.repos.find((r) => r.name === name);
    const last = latestEvidence(ev, name, ['test', 'manual']);
    const head = repo ? headSha(repoDir(ctx, repo)) || 'none' : null;
    return { repo: name, last: last ? { at: last.at, kind: last.kind, result: last.result, sha: last.sha } : null, head, fresh: !!last && last.sha === head };
  });
  const uxFailures = uxCheck(ctx, f);
  return { ...statusRow(ctx, f), ui: isUi(ctx, f), ui_evidence: uiEvidence(ctx, f), ux: { required: isUi(ctx, f), complete: uxFailures.length === 0, failures: uxFailures }, spec_dir: f.spec_dir, branches: f.branches, gates: f.gates, required_gates: requiredGates(ctx, f), pending_gates: requiredGates(ctx, f).filter((g) => !f.gates[g]), deps: f.deps, blockers: f.blockers, held_by: depsStatus(ctx, f), tasks: tasks && { total: tasks.total, done: tasks.done, per_repo: tasks.perRepo }, evidence, revisit: f.revisit };
}

export function warnings(ctx) {
  const w = [];
  const stale = workspaceStale(ctx.config);
  if (stale) w.push(stale);
  if (isLegacy(ctx.root)) w.push('legacy .sdlc/ state dir: `specflow upgrade --apply` migrates it to .specflow/ (hooks still guard it meanwhile)');
  const unconfirmed = ctx.config.repos.filter((r) => !r.commands_confirmed).map((r) => r.name);
  if (unconfirmed.length) w.push(`repo commands unconfirmed: ${unconfirmed.join(', ')}`);
  for (const f of ctx.backlog.features) {
    const idx = stageIdx(f.stage);
    if (idx < 5 || idx >= 8) continue;
    const ev = readEvidence(ctx, f);
    for (const name of f.repos) {
      const repo = ctx.config.repos.find((r) => r.name === name);
      if (!repo) continue;
      const dir = repoDir(ctx, repo);
      const want = f.branches[name];
      const cur = currentBranch(dir);
      if (want && cur && cur !== want) w.push(`${f.id}/${name}: on branch "${cur}", feature branch is "${want}"`);
      const last = latestEvidence(ev, name, ['test', 'manual']);
      const head = headSha(dir);
      if (last && head && last.sha !== head) w.push(`${f.id}/${name}: HEAD ${head.slice(0, 8)} differs from last verified ${String(last.sha).slice(0, 8)} (stale)`);
    }
    const dir = specDirAbs(ctx, f);
    const tf = dir && path.join(dir, 'tasks.md');
    if (tf && fs.existsSync(tf) && idx >= 4) {
      const lastStage = [...f.history].reverse().find((h) => h.event === 'stage');
      if (lastStage && fs.statSync(tf).mtimeMs > Date.parse(lastStage.at) + 1000) w.push(`${f.id}: tasks.md modified after stage "${f.stage}" was set (re-check tasks)`);
    }
  }
  return w;
}

export function brief(ctx) {
  const c = ctx.config;
  const L = [];
  const sk = c.speckit?.version ? `Spec Kit ${c.speckit.version} (${c.speckit.integration || '?'}, at ${c.speckit.location})` : 'Spec Kit: not detected (run `specflow doctor`)';
  L.push(`specflow workspace "${c.workspace?.name}" | autonomy: ${c.autonomy} | ${sk}`);
  L.push(`Repos: ${c.repos.map((r) => r.name).join(', ') || '(none; run specflow scan)'}`);
  const inflight = ctx.backlog.features.filter((f) => stageIdx(f.stage) >= 2 && stageIdx(f.stage) < stageIdx('done'));
  if (inflight.length) {
    L.push('In flight:');
    for (const f of inflight.slice(0, 6)) L.push(` - ${f.id} ${f.title} [${f.stage}] -> ${nextAction(ctx, f)}`);
    if (inflight.length > 6) L.push(` ... and ${inflight.length - 6} more`);
  } else L.push(`No features in flight. ${ctx.backlog.features.length} in backlog.`);
  const top = ranking(ctx).ready[0];
  if (top && !inflight.length) L.push(`Suggested next: ${top.id} ${top.title} (${top.reasons.slice(0, 3).join('; ')})`);
  const w = warnings(ctx);
  if (w.length) { L.push('Warnings:'); w.slice(0, 6).forEach((x) => L.push(` ! ${x}`)); }
  L.push('State comes from the specflow CLI, not memory. Re-verify before trusting prior claims. Use the `specflow` skill to proceed.');
  return L.slice(0, 25);
}

export function table(rows, cols) {
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const line = (r) => cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  ');
  return [line(Object.fromEntries(cols.map((c) => [c, c]))), ...rows.map(line)].join('\n');
}

export { STAGES };
