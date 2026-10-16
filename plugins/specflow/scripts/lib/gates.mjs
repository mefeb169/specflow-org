import fs from 'node:fs';
import path from 'node:path';
import { AUTONOMY_GATES, DEP_MIN_STAGE, GATES, GATE_BEFORE, GATE_STAGE, STAGES, UX_SECTIONS, stageIdx } from './lifecycle.mjs';
import { isUi, repoDir, specDirAbs, uxConfig } from './state.mjs';
import { headSha, isGitRepo } from './git.mjs';
import { latestEvidence, readEvidence } from './verify.mjs';

const readIf = (file) => (file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);

/** Parse tasks.md checkbox lines. */
export function parseTasks(ctx, f) {
  const dir = specDirAbs(ctx, f);
  const text = readIf(dir && path.join(dir, 'tasks.md'));
  if (text === null) return null;
  const tasks = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*- \[( |x|X)\]\s*(.*)$/);
    if (!m) continue;
    const tag = m[2].match(/\[repo:([^\]]+)\]/);
    tasks.push({ done: m[1] !== ' ', repo: tag ? tag[1].trim() : null, text: m[2] });
  }
  return tasks;
}

export function checkTasks(ctx, f) {
  const tasks = parseTasks(ctx, f);
  const errors = [];
  const perRepo = {};
  if (tasks === null) return { total: 0, done: 0, perRepo, errors: ['tasks.md not found'] };
  if (tasks.length === 0) errors.push('tasks.md has no task lines');
  const names = new Set(ctx.config.repos.map((r) => r.name));
  tasks.forEach((t, i) => {
    if (!t.repo) errors.push(`task #${i + 1} has no [repo:<name>] tag: ${t.text.slice(0, 60)}`);
    else if (!names.has(t.repo)) errors.push(`task #${i + 1} names unregistered repo "${t.repo}"`);
    else {
      perRepo[t.repo] ||= { total: 0, done: 0 };
      perRepo[t.repo].total++;
      if (t.done) perRepo[t.repo].done++;
    }
  });
  return { total: tasks.length, done: tasks.filter((t) => t.done).length, perRepo, errors };
}

export function traits(ctx, f) {
  const dir = specDirAbs(ctx, f);
  const plan = readIf(dir && path.join(dir, 'plan.md')) || '';
  const tasks = readIf(dir && path.join(dir, 'tasks.md')) || '';
  const migration = !!(dir && fs.existsSync(path.join(dir, 'data-model.md'))) || /migration/i.test(plan) || /migrations\//i.test(tasks);
  return { multiRepo: f.repos.length > 1, migration, ui: isUi(ctx, f) };
}

/** Failures for a UI feature's ux.md (empty list = complete). Non-UI features always pass. */
export function uxCheck(ctx, f) {
  if (!isUi(ctx, f)) return [];
  const dir = specDirAbs(ctx, f);
  const text = readIf(dir && path.join(dir, 'ux.md'));
  if (text === null) return ['ux.md does not exist (UI feature; write it with specflow:ux)'];
  const fail = [];
  if (!/^Mode:\s*(conform|direction)\b/im.test(text)) fail.push('ux.md lacks a "Mode: conform|direction" line');
  for (const h of UX_SECTIONS) {
    if (!new RegExp(`^${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im').test(text)) fail.push(`ux.md lacks the heading "${h}"`);
  }
  return fail;
}

export function requiredGates(ctx, f) {
  const level = ctx.config.autonomy || 'standard';
  const base = AUTONOMY_GATES[level] || AUTONOMY_GATES.standard;
  return GATES.filter((g) => {
    if (!base.includes(g)) return false;
    if (g === 'design' && level === 'standard') {
      const t = traits(ctx, f);
      return t.multiRepo || t.migration || (t.ui && uxConfig(ctx).design_gate_for_ui);
    }
    return true;
  });
}

export const gateApproved = (f, g) => !!f.gates[g];

export function depsStatus(ctx, f) {
  const holding = [];
  for (const d of f.deps) {
    const min = DEP_MIN_STAGE[d.type];
    if (!min) continue;
    const dep = ctx.backlog.features.find((x) => x.id === d.id);
    if (!dep) holding.push(`${d.id} (${d.type}) does not exist`);
    else if (stageIdx(dep.stage) < stageIdx(min)) holding.push(`${d.id} (${d.type}) is at ${dep.stage}, needs >= ${min}`);
  }
  return holding;
}

export const openBlockers = (f) => f.blockers.filter((b) => b.open);

/** Entry criteria for moving a feature INTO `target`. Returns a list of failed criteria (empty = ok). */
export function checkEntry(ctx, f, target) {
  const fail = [];
  const dir = specDirAbs(ctx, f);
  const need = (cond, msg) => { if (!cond) fail.push(msg); };

  const gate = GATE_BEFORE[target];
  if (gate && requiredGates(ctx, f).includes(gate)) {
    need(gateApproved(f, gate), `gate "${gate}" is required and not approved (specflow gate approve ${f.id} ${gate})`);
  }

  switch (target) {
    case 'defined':
      need(f.title?.trim(), 'title is empty');
      need(f.value?.trim(), 'value is empty (feature set <id> value "...")');
      need(f.summary?.trim(), 'summary / acceptance-criteria draft is empty');
      need(f.repos.length > 0, 'no affected repos set');
      break;
    case 'specified': {
      need(!!f.spec_dir, 'no spec_dir linked (specflow feature link)');
      const spec = readIf(dir && path.join(dir, 'spec.md'));
      need(spec !== null, 'spec.md does not exist');
      if (spec !== null) need(!/\[NEEDS CLARIFICATION/i.test(spec), 'spec.md still contains [NEEDS CLARIFICATION] markers');
      break;
    }
    case 'designed': {
      const plan = readIf(dir && path.join(dir, 'plan.md'));
      need(plan !== null, 'plan.md does not exist');
      uxCheck(ctx, f).forEach((m) => fail.push(m));
      if (plan !== null && f.repos.length > 1) need(/^##\s+Repository Impact/im.test(plan), 'plan.md lacks a "## Repository Impact" section (required when repos > 1)');
      break;
    }
    case 'planned': {
      const r = checkTasks(ctx, f);
      r.errors.forEach((e) => fail.push(e === 'tasks.md not found' ? 'tasks.md does not exist' : e));
      break;
    }
    case 'implementing':
      for (const name of f.repos) {
        const repo = ctx.config.repos.find((r) => r.name === name);
        if (repo && isGitRepo(repoDir(ctx, repo))) need(f.branches[name], `no branch recorded for repo "${name}" (specflow branches create ${f.id})`);
      }
      break;
    case 'verifying': {
      const tasks = parseTasks(ctx, f);
      need(tasks && tasks.length > 0, 'tasks.md missing or empty');
      const open = (tasks || []).filter((t) => !t.done).length;
      need(open === 0, `${open} task(s) still unchecked in tasks.md`);
      break;
    }
    case 'accepted': {
      need(openBlockers(f).length === 0, `${openBlockers(f).length} open blocker(s)`);
      const ev = readEvidence(ctx, f);
      for (const name of f.repos) {
        const repo = ctx.config.repos.find((r) => r.name === name);
        if (!repo) { fail.push(`unknown repo "${name}"`); continue; }
        const head = headSha(repoDir(ctx, repo)) || 'none';
        const last = latestEvidence(ev, name, ['test', 'manual']);
        if (!last) fail.push(`no test/manual evidence for repo "${name}" (specflow verify run ${f.id} --repo ${name})`);
        else if (last.result !== 'pass') fail.push(`latest verification for "${name}" FAILED (${last.at})`);
        else if ((last.sha || 'none') !== head) fail.push(`verification for "${name}" is stale: evidence at ${String(last.sha).slice(0, 8)}, HEAD is ${head.slice(0, 8)}`);
      }
      need(ev.some((e) => e.kind === 'review' && e.result === 'pass'), 'no passing review evidence (specflow evidence add --kind review --result pass)');
      if (isUi(ctx, f) && uxConfig(ctx).require_ux_review) {
        need(ev.some((e) => e.kind === 'ux-review' && e.result === 'pass'), 'no passing ux-review evidence (UI feature; specflow evidence add --kind ux-review --result pass)');
      }
      break;
    }
    case 'released': {
      const ev = readEvidence(ctx, f);
      need(ev.some((e) => e.kind === 'release' && e.result === 'pass'), 'no release evidence (specflow evidence add --kind release --result pass)');
      break;
    }
    case 'done': {
      const ev = readEvidence(ctx, f);
      need(ev.some((e) => e.kind === 'post-release' && e.result === 'pass'), 'no post-release evidence (add it, or pass --reason to waive)');
      break;
    }
    default:
      break;
  }
  return fail;
}

export function clearDownstreamGates(f, targetStage) {
  const cleared = [];
  for (const g of GATES) {
    const exit = GATE_STAGE[g];
    if (stageIdx(exit) >= stageIdx(targetStage) && f.gates[g]) { f.gates[g] = null; cleared.push(g); }
  }
  return cleared;
}

export { STAGES };
