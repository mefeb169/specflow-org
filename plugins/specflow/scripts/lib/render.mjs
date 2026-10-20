import fs from 'node:fs';
import path from 'node:path';
import { STAGES, STAGE_ROLE, stageIdx } from './lifecycle.mjs';
import { depsStatus, openBlockers, requiredGates, checkTasks, uxCheck } from './gates.mjs';
import { currentBranch, headSha } from './git.mjs';
import { latestEvidence, readEvidence } from './verify.mjs';
import { childrenOf, currentMilestone, handoffRel, inMilestoneScope, isLegacy, isUi, paths, readJson, repoDir, specDirAbs } from './state.mjs';
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

export function ranking(ctx, { all = false } = {}) {
  const ready = [];
  const notReady = [];
  const acceptedIdx = stageIdx('accepted');
  for (const f of ctx.backlog.features) {
    if (stageIdx(f.stage) >= acceptedIdx || f.dropped) continue;
    if (!all && !inMilestoneScope(ctx, f)) continue;
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
    filter: !all && currentMilestone(ctx) ? `milestone ${currentMilestone(ctx)} (plus urgent and bug items)` : 'none',
  };
}

export function statusRow(ctx, f) {
  return { id: f.id, kind: f.kind, title: f.title, stage: f.stage, blocked: openBlockers(f).length > 0 || depsStatus(ctx, f).length > 0, priority: f.priority, repos: f.repos, next: nextAction(ctx, f) };
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
  const slices = childrenOf(ctx, f.id).map((k) => ({ id: k.id, title: k.title, stage: k.stage }));
  return { ...statusRow(ctx, f), kind: f.kind, lane: f.lane, parent: f.parent, slices, rework: { open: f.rework.find((r) => !r.closed_at)?.n ?? null, total: f.rework.length }, ui: isUi(ctx, f), ui_evidence: uiEvidence(ctx, f), ux: { required: isUi(ctx, f), complete: uxFailures.length === 0, failures: uxFailures }, spec_dir: f.spec_dir, branches: f.branches, gates: f.gates, required_gates: requiredGates(ctx, f), pending_gates: requiredGates(ctx, f).filter((g) => !f.gates[g]), deps: f.deps, blockers: f.blockers, held_by: depsStatus(ctx, f), tasks: tasks && { total: tasks.total, done: tasks.done, per_repo: tasks.perRepo }, evidence, revisit: f.revisit };
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

const BRIEF_BUDGET = 1450;
const cut = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 3)}...` : String(s));

/** Session brief. Each line has a priority; when the total exceeds the budget the lowest-priority lines go first. */
export function brief(ctx) {
  const c = ctx.config;
  const bl = ctx.backlog;
  const L = []; // { t, p }
  const add = (t, p) => { if (t) L.push({ t, p }); };
  const sk = c.speckit?.version ? `Spec Kit ${c.speckit.version}` : 'Spec Kit: not detected (run `specflow doctor`)';
  add(cut(`specflow "${c.workspace?.name}" | autonomy: ${c.autonomy} | ${sk}`, 110), 9);
  add(cut(`Repos: ${c.repos.map((r) => r.name).join(', ') || '(none; run specflow scan)'}`, 100), 8);
  const focus = bl.focus ? bl.features.find((f) => f.id === bl.focus) : null;
  if (focus) add(cut(`Focus: ${focus.id} ${focus.title} [${focus.stage}] handoff ${handoffRel(ctx, focus)} | next: ${focus.checkpoint?.next || nextAction(ctx, focus)}`, 230), 9);
  if (bl.parked.length) add(cut(`Parked: ${bl.parked.join(', ')} (specflow resume)`, 80), 7);
  const m = currentMilestone(ctx);
  if (m) add(cut(`Milestone: ${m}`, 50), 6);
  const prefs = Object.entries(ctx.memory.preferences || {}).slice(0, 8).map(([k, v]) => `${k}=${v.value}`).join('; ');
  if (prefs) add(cut(`Preferences: ${prefs}`, 150), 4);
  const openQ = bl.questions.filter((q) => q.status === 'open').length;
  if (openQ) add(`Open questions: ${openQ} (specflow question list --open)`, 5);
  const inflight = bl.features.filter((f) => stageIdx(f.stage) >= 2 && stageIdx(f.stage) < stageIdx('done') && !f.dropped && f.id !== bl.focus && !f.parent);
  const slicesInflight = bl.features.filter((f) => f.parent && !f.dropped && stageIdx(f.stage) >= 2 && stageIdx(f.stage) < stageIdx('done') && f.id !== bl.focus);
  const rest = [...inflight, ...slicesInflight];
  const room = focus ? 4 : 5;
  if (rest.length) {
    add('In flight:', 7);
    rest.slice(0, room).forEach((f, i) => add(cut(` - ${f.id} ${f.title} [${f.stage}] -> ${nextAction(ctx, f)}`, 100), 6 - i * 0.1));
    if (rest.length > room) add(` ... and ${rest.length - room} more`, 3);
  } else if (!focus) add(`No features in flight. ${bl.features.filter((f) => !f.dropped).length} in backlog.`, 7);
  const top = ranking(ctx).ready[0];
  if (top && !rest.length && !focus) add(cut(`Suggested next: ${top.id} ${top.title} (${top.reasons.slice(0, 2).join('; ')})`, 120), 5);
  warnings(ctx).slice(0, 3).forEach((x, i) => add(cut(`! ${x}`, 120), 8 - i));
  add('State is in the specflow CLI, not memory. Use the `specflow` skill to proceed.', 2);
  const total = () => L.reduce((n, x) => n + x.t.length + 1, 0);
  while (total() > BRIEF_BUDGET && L.length > 3) {
    let lo = 0;
    L.forEach((x, i) => { if (x.p <= L[lo].p) lo = i; });
    L.splice(lo, 1);
  }
  return L.map((x) => x.t).slice(0, 25);
}

export function table(rows, cols) {
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const line = (r) => cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  ');
  return [line(Object.fromEntries(cols.map((c) => [c, c]))), ...rows.map(line)].join('\n');
}

export { STAGES };
