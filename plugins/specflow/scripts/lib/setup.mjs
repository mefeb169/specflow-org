// Setup interview as data: questions with defaults derived from the workspace, and validated application of answers.
import fs from 'node:fs';
import path from 'node:path';
import { UserError, currentMilestone, repoDir, slicingCfg } from './state.mjs';
import { AUTONOMY_LEVELS } from './lifecycle.mjs';
import { currentBranch } from './git.mjs';
import { COMMUNICATION, DELIVERY_MODES, WORKFLOWS, deliveryCfg, materializeTeam, modelOk, releaseCfg, teamCfg, testingCfg, toolsCfg } from './team.mjs';
import { stageIdx } from './lifecycle.mjs';

const PLANNING_ROLES = ['product', 'architect', 'ux', 'lead', 'reviewer'];
const BUILDING_ROLES = ['builder', 'verifier'];
const YESNO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

/** graphify on PATH? SPECFLOW_FAKE_GRAPHIFY=1|0 stubs the detection in tests. */
export function graphifyAvailable() {
  if (process.env.SPECFLOW_FAKE_GRAPHIFY !== undefined) return process.env.SPECFLOW_FAKE_GRAPHIFY === '1';
  const exts = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  return (process.env.PATH || '').split(path.delimiter).filter(Boolean).some((d) => exts.some((e) => fs.existsSync(path.join(d, `graphify${e}`))));
}

const yn = (b) => (b ? 'yes' : 'no');

/** The branch all git repos currently sit on, or null when they differ (or there are none). */
function commonBranch(ctx) {
  const bs = ctx.config.repos.map((r) => currentBranch(repoDir(ctx, r))).filter(Boolean);
  return bs.length && bs.every((b) => b === bs[0]) ? bs[0] : null;
}

export function setupQuestions(ctx) {
  const team = teamCfg(ctx);
  const del = deliveryCfg(ctx);
  const sl = slicingCfg(ctx);
  const open = ctx.backlog.features.filter((f) => !f.dropped && stageIdx(f.stage) < stageIdx('done')).length;
  const repos = ctx.config.repos.length;
  const models = (roles) => [...new Set(roles.map((r) => team.roles[r].model))];
  const opts = (vals) => vals.map(([value, label]) => ({ value, label }));
  return [
    { id: 'workflow', text: 'Do you want to work feature by feature, or task by task?', options: opts([['feature', 'Feature by feature (specs, plans, gates)'], ['task', 'Task by task (small fixes, light process)']]), default: team.workflow, why: 'Decides whether the PM starts from the feature backlog or from individual tasks.' },
    { id: 'autonomy', text: 'Which approvals do you want before work moves on?', options: opts([['guided', 'Guided: approve every gate'], ['standard', 'Standard: spec, implementation, acceptance, release (plus design when risky)'], ['autonomous', 'Autonomous: only acceptance and release']]), default: ctx.config.autonomy || 'standard', why: 'Gates are the points where you review before the team continues.' },
    { id: 'delivery.mode', text: 'After review passes, what should the team do with the code?', options: opts([['commit', 'Commit on the feature branch only'], ['push-pr', 'Push and open pull requests (you merge)'], ['push-pr-merge', 'Push, open and merge pull requests']]), default: del.mode, why: 'Controls how far the AI goes with Git once a slice is verified.' },
    { id: 'delivery.target_branch', text: 'Which branch should pull requests go to?', options: [], default: del.target_branch || commonBranch(ctx), why: 'Used when the team opens pull requests; blank means each repo\'s own default.' },
    { id: 'release.by_ai', text: 'Should the AI team also release and deploy?', options: YESNO, default: yn(releaseCfg(ctx).by_ai), why: 'Yes is recorded now; the release team (steps, approvals) is configured in a later phase.' },
    { id: 'testing.unit_required', text: 'Should new logic require unit tests?', options: YESNO, default: yn(testingCfg(ctx).unit_required), why: 'The verifier fails a slice that adds logic without tests when this is on.' },
    { id: 'testing.data_rules', text: 'Any rules for test data (for example "use yopmail.com addresses")?', options: [], default: testingCfg(ctx).data_rules || null, why: 'Passed to builders so test fixtures follow your rules.' },
    { id: 'models.planning', text: 'Which model should plan (product, architect, UX, leads, reviewer)?', options: opts([['opus', 'Opus (strongest)'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku (fastest)']]), default: models(PLANNING_ROLES).length === 1 ? models(PLANNING_ROLES)[0] : 'opus', why: 'Planning mistakes are the most expensive; the default spends tokens here.' },
    { id: 'models.building', text: 'Which model should implement and verify (builders, verifier)?', options: opts([['sonnet', 'Sonnet (balanced)'], ['opus', 'Opus'], ['haiku', 'Haiku (fastest)']]), default: models(BUILDING_ROLES).length === 1 ? models(BUILDING_ROLES)[0] : 'sonnet', why: 'Building follows a written plan, so a cheaper model is usually enough.' },
    { id: 'team.leads', text: 'Use a team lead per area (for example backend, web, mobile)?', options: YESNO, default: yn(team.roles.lead.enabled), why: repos >= 4 ? `You have ${repos} repos: leads keep each area's plan separate (one lead per repo to start).` : 'Leads only pay off with many repos; with few repos the architect plans directly.' },
    { id: 'team.communication', text: 'How much detail do you want in progress updates?', options: opts([['short', 'Short'], ['normal', 'Normal'], ['detailed', 'Detailed']]), default: team.communication, why: 'Sets how much the PM tells you after each step.' },
    { id: 'tools.graphify', text: 'Use the graphify code graph (AST only, no AI) for code search?', options: YESNO, default: yn(graphifyAvailable()), why: graphifyAvailable() ? 'graphify is installed.' : 'graphify was not found on PATH; builders fall back to grep.' },
    { id: 'milestone', text: 'Is there a current milestone to focus on (name), or none?', options: [], default: currentMilestone(ctx), why: open > 30 ? `${open} items are open: without a milestone the status list will be long.` : 'A milestone limits status and next to one scope.' },
    { id: 'slicing', text: 'When should a slice be split (tasks and migrations)?', options: [], default: `${sl.max_tasks} tasks / ${sl.max_migrations} migration`, why: 'Slices above this size must be split or carry a recorded waiver.' },
  ];
}

const bool = (v) => {
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (['yes', 'true', 'y'].includes(s)) return true;
  if (['no', 'false', 'n'].includes(s)) return false;
  throw new Error('must be yes or no');
};
const oneOf = (list) => (v) => { if (!list.includes(v)) throw new Error(`must be one of ${list.join(', ')}`); return v; };
const text = (v) => { if (typeof v !== 'string') throw new Error('must be text'); return v.trim(); };
const noneToNull = (v) => { const s = text(v); return !s || ['none', 'null'].includes(s.toLowerCase()) ? null : s; };

function parseSlicing(v) {
  let a; let b;
  if (v && typeof v === 'object') { a = v.max_tasks; b = v.max_migrations; } else { const m = String(v).match(/^\D*(\d+)\D+(\d+)\D*$/); if (m) { a = Number(m[1]); b = Number(m[2]); } }
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 0) throw new Error('must be "<tasks> / <migrations>", for example "15 / 1"');
  return { max_tasks: a, max_migrations: b };
}

// id -> { parse(raw) -> value, show(value) -> text for the decision log, set(ctx, value) }
const HANDLERS = {
  workflow: { parse: oneOf(WORKFLOWS), set: (c, v) => { materializeTeam(c).workflow = v; } },
  autonomy: { parse: oneOf(AUTONOMY_LEVELS), set: (c, v) => { c.config.autonomy = v; } },
  'delivery.mode': { parse: oneOf(DELIVERY_MODES), set: (c, v) => { c.config.delivery = { ...deliveryCfg(c), mode: v }; } },
  'delivery.target_branch': { parse: noneToNull, set: (c, v) => { c.config.delivery = { ...deliveryCfg(c), target_branch: v }; } },
  'release.by_ai': { parse: bool, set: (c, v) => { c.config.release = { ...releaseCfg(c), by_ai: v }; } },
  'testing.unit_required': { parse: bool, set: (c, v) => { c.config.testing = { ...testingCfg(c), unit_required: v }; } },
  'testing.data_rules': { parse: (v) => { const s = text(v); return ['none', 'null'].includes(s.toLowerCase()) ? '' : s; }, set: (c, v) => { c.config.testing = { ...testingCfg(c), data_rules: v }; } },
  'models.planning': { parse: (v) => { if (!modelOk(v)) throw new Error('must be opus, sonnet, haiku, inherit, fable or a claude-* id'); return v; }, set: (c, v) => setModels(c, PLANNING_ROLES, v) },
  'models.building': { parse: (v) => { if (!modelOk(v)) throw new Error('must be opus, sonnet, haiku, inherit, fable or a claude-* id'); return v; }, set: (c, v) => setModels(c, BUILDING_ROLES, v) },
  'team.leads': { parse: bool, set: setLeads },
  'team.communication': { parse: oneOf(COMMUNICATION), set: (c, v) => { materializeTeam(c).communication = v; } },
  'tools.graphify': { parse: bool, set: (c, v) => { c.config.tools = { ...toolsCfg(c), graphify: v }; } },
  milestone: { parse: noneToNull, set: (c, v) => { c.config.current_milestone = v; } },
  slicing: { parse: parseSlicing, show: (v) => `${v.max_tasks} tasks / ${v.max_migrations} migration`, set: (c, v) => { c.config.slicing = { ...slicingCfg(c), ...v }; } },
};

function setModels(ctx, roles, model) {
  const t = materializeTeam(ctx);
  for (const r of roles) if (!t.locked.includes(r)) t.roles[r].model = model; // a role you set by hand stays as you set it
}

function setLeads(ctx, on) {
  const t = materializeTeam(ctx);
  if (on && !t.leads.length) t.leads = ctx.config.repos.map((r) => ({ name: r.name, repos: [r.name] }));
  t.roles.lead.enabled = on && t.leads.length > 0;
}

const showValue = (id, v) => (HANDLERS[id].show ? HANDLERS[id].show(v) : v === null ? 'none' : typeof v === 'boolean' ? yn(v) : String(v));

/** Validates every given answer first (nothing is written on any error), then applies them and returns the decision entries to log. */
export function applyAnswers(ctx, answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new UserError('answers file must be a JSON object: { "<question id>": <value>, ... }');
  const errors = [];
  const parsed = [];
  for (const [id, raw] of Object.entries(answers)) {
    const h = HANDLERS[id];
    if (!h) { errors.push(`unknown question id "${id}"`); continue; }
    try { parsed.push({ id, value: h.parse(raw) }); } catch (e) { errors.push(`${id}: ${e.message}`); }
  }
  if (errors.length) throw new UserError(`setup answers rejected, nothing written:\n  ${errors.join('\n  ')}\nValid ids: ${Object.keys(HANDLERS).join(', ')}`);
  const qs = Object.fromEntries(setupQuestions(ctx).map((q) => [q.id, q]));
  const out = [];
  for (const { id, value } of parsed) {
    HANDLERS[id].set(ctx, value);
    out.push({ id, question: qs[id].text, answer: showValue(id, value) });
  }
  return out;
}

/** Which questions the decision log already answers (the latest project-scope decision by the user wins). */
export function setupStatus(ctx) {
  return setupQuestions(ctx).map((q) => {
    const d = [...ctx.memory.decisions].reverse().find((x) => x.question === q.text && x.scope === 'project' && x.by === 'user');
    return { id: q.id, answered: !!d, answer: d ? d.answer : null, default: q.default };
  });
}
