// Team model: roles as subagents, with model policy and optional lead layer. Config reads go through
// helpers so a 0.5.0 config needs no rewrite on read.
import { UserError } from './state.mjs';

export const TEAM_ROLES = ['product', 'architect', 'ux', 'lead', 'builder', 'verifier', 'reviewer', 'profiler'];
// Plugin agent that runs each role (file names under agents/).
export const ROLE_AGENT = {
  product: 'specflow:product', architect: 'specflow:architect', ux: 'specflow:ux', lead: 'specflow:lead', builder: 'specflow:builder',
  verifier: 'specflow:verifier', reviewer: 'specflow:independent-reviewer', profiler: 'specflow:repo-profiler',
};
// Who covers a disabled role; anything not listed (or whose cover is also disabled) falls back to the PM.
export const ROLE_FALLBACK = { ux: 'architect', lead: 'builder' };
// Question target (QUESTION_TARGETS) that each role answers.
export const ROLE_TARGET = { product: 'product', architect: 'architect', ux: 'ux', lead: 'build', builder: 'build', verifier: 'verify', reviewer: 'verify' };
export const COMMUNICATION = ['short', 'normal', 'detailed'];
export const WORKFLOWS = ['feature', 'task'];
export const DELIVERY_MODES = ['commit', 'push-pr', 'push-pr-merge'];
const DEFAULT_MODEL = { product: 'opus', architect: 'opus', ux: 'opus', lead: 'opus', builder: 'sonnet', verifier: 'sonnet', reviewer: 'opus', profiler: 'haiku' };

export const modelOk = (m) => typeof m === 'string' && (['opus', 'sonnet', 'haiku', 'inherit', 'fable'].includes(m) || /^claude-\S+$/.test(m));
export const anyUiRepo = (ctx) => (ctx.config.repos || []).some((r) => r.ui === true);

/** Effective team config: defaults overlaid with config.team. ux is enabled when any repo is UI, unless config says otherwise. */
export function teamCfg(ctx) {
  const t = ctx.config.team || {};
  const roles = {};
  for (const r of TEAM_ROLES) {
    const given = t.roles?.[r] || {};
    const enabled = given.enabled !== undefined ? given.enabled : r === 'ux' ? anyUiRepo(ctx) : r === 'lead' ? (t.leads || []).length > 0 : true;
    roles[r] = { enabled: !!enabled, model: given.model || DEFAULT_MODEL[r] };
  }
  return { roles, leads: (t.leads || []).map((l) => ({ name: l.name, repos: [...l.repos] })), locked: [...(t.locked || [])], communication: t.communication || 'short', workflow: t.workflow || 'feature' };
}

export const deliveryCfg = (ctx) => ({ mode: 'push-pr', target_branch: null, pr_tool: 'gh', ...(ctx.config.delivery || {}) });
export const releaseCfg = (ctx) => ({ by_ai: false, ...(ctx.config.release || {}) });
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
  c.release = releaseCfg(ctx);
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
