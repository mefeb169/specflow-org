// Team model: roles as subagents, with model policy and optional lead layer. Config reads go through
// helpers so a 0.5.0 config needs no rewrite on read.
import { UserError } from './state.mjs';

export const TEAM_ROLES = ['product', 'architect', 'ux', 'lead', 'builder', 'verifier', 'reviewer', 'profiler', 'release'];
// Plugin agent that runs each role (file names under agents/).
export const ROLE_AGENT = {
  product: 'specflow:product', architect: 'specflow:architect', ux: 'specflow:ux', lead: 'specflow:lead', builder: 'specflow:builder',
  verifier: 'specflow:verifier', reviewer: 'specflow:independent-reviewer', profiler: 'specflow:repo-profiler', release: 'specflow:release-manager',
};
// Who covers a disabled role; anything not listed (or whose cover is also disabled) falls back to the PM.
export const ROLE_FALLBACK = { ux: 'architect', lead: 'builder' };
// Question target (QUESTION_TARGETS) that each role answers.
export const ROLE_TARGET = { product: 'product', architect: 'architect', ux: 'ux', lead: 'build', builder: 'build', verifier: 'verify', reviewer: 'verify', release: 'build' };
export const COMMUNICATION = ['short', 'normal', 'detailed'];
export const WORKFLOWS = ['feature', 'task'];
export const DELIVERY_MODES = ['commit', 'push-pr', 'push-pr-merge'];
const DEFAULT_MODEL = { product: 'opus', architect: 'opus', ux: 'opus', lead: 'opus', builder: 'sonnet', verifier: 'sonnet', reviewer: 'opus', profiler: 'haiku', release: 'sonnet' };

export const modelOk = (m) => typeof m === 'string' && (['opus', 'sonnet', 'haiku', 'inherit', 'fable'].includes(m) || /^claude-\S+$/.test(m));
export const anyUiRepo = (ctx) => (ctx.config.repos || []).some((r) => r.ui === true);

/** Effective team config: defaults overlaid with config.team. ux is enabled when any repo is UI, unless config says otherwise. */
export function teamCfg(ctx) {
  const t = ctx.config.team || {};
  const roles = {};
  for (const r of TEAM_ROLES) {
    const given = t.roles?.[r] || {};
    const enabled = given.enabled !== undefined ? given.enabled : r === 'ux' ? anyUiRepo(ctx) : r === 'lead' ? (t.leads || []).length > 0 : r === 'release' ? !!ctx.config.release?.by_ai : true;
    roles[r] = { enabled: !!enabled, model: given.model || DEFAULT_MODEL[r] };
  }
  return { roles, leads: (t.leads || []).map((l) => ({ name: l.name, repos: [...l.repos] })), locked: [...(t.locked || [])], communication: t.communication || 'short', workflow: t.workflow || 'feature' };
}

export const deliveryCfg = (ctx) => ({ mode: 'push-pr', target_branch: null, pr_tool: 'gh', ...(ctx.config.delivery || {}) });
export const RELEASE_KINDS = ['deploy', 'migrate', 'restart', 'smoke', 'other'];
export const RELEASE_APPROVALS = ['ask', 'none'];
export const releaseCfg = (ctx) => ({ by_ai: false, steps: [], post_release: [], require_merged: true, ...(ctx.config.release || {}) });
/** Approval a step really needs: migrate and restart are always asked, the rest follow the step (default ask). */
export const stepApproval = (s) => (['migrate', 'restart'].includes(s.kind) ? 'ask' : s.approval || 'ask');
export const testingCfg = (ctx) => ({ unit_required: true, data_rules: '', ...(ctx.config.testing || {}) });
export const toolsCfg = (ctx) => ({ graphify: false, ...(ctx.config.tools || {}) });

/** Writes the effective team config into ctx.config.team (caller saves). */
export function materializeTeam(ctx) {
  ctx.config.team = teamCfg(ctx);
  return ctx.config.team;
}

/** Fills every Phase 2 config key that is missing, never overwriting a value (migration, `team generate`). */
export function fillTeamDefaults(ctx) {
  const c = ctx.config;
  c.team = teamCfg(ctx);
  c.delivery = deliveryCfg(ctx);
  c.release = { by_ai: false, ...(c.release || {}) };
  c.testing = testingCfg(ctx);
  c.tools = toolsCfg(ctx);
}

export const leadOf = (team, repo) => team.leads.find((l) => l.repos.includes(repo)) || null;

export function validateTeam(ctx) {
  const e = [];
  const t = teamCfg(ctx);
  const raw = ctx.config.team || {};
  for (const r of Object.keys(raw.roles || {})) if (!TEAM_ROLES.includes(r)) e.push(`team.roles.${r}: unknown role`);
  for (const [r, v] of Object.entries(t.roles)) if (!modelOk(v.model)) e.push(`team.roles.${r}.model "${v.model}" must be opus, sonnet, haiku, inherit, fable or a claude-* id`);
  for (const r of t.locked) if (!TEAM_ROLES.includes(r)) e.push(`team.locked: unknown role "${r}"`);
  if (!COMMUNICATION.includes(t.communication)) e.push(`team.communication must be one of ${COMMUNICATION.join(', ')}`);
  if (!WORKFLOWS.includes(t.workflow)) e.push(`team.workflow must be one of ${WORKFLOWS.join(', ')}`);
  const names = new Set((ctx.config.repos || []).map((r) => r.name));
  const seen = new Map();
  for (const l of t.leads) {
    if (!l.name) e.push('team.leads: a lead has no name');
    for (const r of l.repos) {
      if (!names.has(r)) e.push(`team.leads ${l.name}: unknown repo "${r}"`);
      if (seen.has(r)) e.push(`team.leads: repo "${r}" belongs to both ${seen.get(r)} and ${l.name}`);
      seen.set(r, l.name);
    }
  }
  return e;
}

export const needModel = (m) => { if (!modelOk(m)) throw new UserError(`--model must be opus, sonnet, haiku, inherit, fable or a claude-* id (got "${m}")`); return m; };

export function validateRelease(ctx) {
  const e = [];
  const r = releaseCfg(ctx);
  const names = new Set((ctx.config.repos || []).map((x) => x.name));
  if (typeof r.by_ai !== 'boolean') e.push('release.by_ai must be true or false');
  if (typeof r.require_merged !== 'boolean') e.push('release.require_merged must be true or false');
  for (const [key, list] of [['steps', r.steps], ['post_release', r.post_release]]) {
    if (!Array.isArray(list)) { e.push(`release.${key} must be a list`); continue; }
    const seen = new Set();
    for (const s of list) {
      const at = (m) => e.push(`release.${key} "${s.name}": ${m}`);
      if (!s.name) { e.push(`release.${key}: a step has no name`); continue; }
      if (seen.has(s.name)) at('duplicate name');
      seen.add(s.name);
      if (!s.run) at('has no run command');
      if (s.repo && !names.has(s.repo)) at(`unknown repo "${s.repo}"`);
      if (key === 'steps') {
        if (s.kind && !RELEASE_KINDS.includes(s.kind)) at(`kind must be one of ${RELEASE_KINDS.join(', ')}`);
        if (s.approval && !RELEASE_APPROVALS.includes(s.approval)) at(`approval must be ask or none`);
      }
      if (s.timeout_s !== undefined && !(Number.isInteger(s.timeout_s) && s.timeout_s > 0)) at('timeout_s must be a positive integer');
    }
  }
  return e;
}

/** Turns AI releasing on or off; the release role follows unless it was set by hand (caller saves). */
export function setReleaseByAi(ctx, on) {
  ctx.config.release = { ...releaseCfg(ctx), by_ai: on };
  const t = materializeTeam(ctx);
  if (t.roles.release && !t.locked.includes('release')) t.roles.release.enabled = on;
}
