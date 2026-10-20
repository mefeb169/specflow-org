// Team configuration: roles (enabled, model), leads, communication, workflow.
import { UserError, getRepo } from '../lib/state.mjs';
import { COMMUNICATION, ROLE_AGENT, TEAM_ROLES, WORKFLOWS, anyUiRepo, leadOf, materializeTeam, needModel, teamCfg } from '../lib/team.mjs';
import { table } from '../lib/render.mjs';
import { csv, emit, need } from './io.mjs';

const USAGE = 'usage: team [show] | team set <role> [--model m] [--enabled true|false] | team set --communication short|normal|detailed | team set --workflow feature|task | team lead add <name> --repos a,b | team lead rm <name> | team generate';

function show(ctx) {
  const t = teamCfg(ctx);
  const roles = TEAM_ROLES.map((r) => ({ role: r, enabled: t.roles[r].enabled, model: t.roles[r].model, agent: ROLE_AGENT[r], locked: t.locked.includes(r) }));
  const data = { roles, leads: t.leads, locked: t.locked, communication: t.communication, workflow: t.workflow };
  emit(data, () => [
    table(roles.map((r) => ({ ...r, enabled: r.enabled ? 'yes' : 'no', locked: r.locked ? 'yes' : '' })), ['role', 'enabled', 'model', 'agent', 'locked']),
    `leads: ${t.leads.length ? t.leads.map((l) => `${l.name} (${l.repos.join(', ')})`).join('; ') : '(none)'}`,
    `communication: ${t.communication} | workflow: ${t.workflow}`,
  ].join('\n'));
}

export function cmdTeam(args, ctx) {
  const [sub, a, b] = args._;
  const f = args.flags;
  if (!sub || sub === 'show') return show(ctx);
  if (sub === 'set') {
    const touched = [];
    const team = materializeTeam(ctx);
    if (a !== undefined) {
      if (!TEAM_ROLES.includes(a)) throw new UserError(`unknown role "${a}". Roles: ${TEAM_ROLES.join(', ')}`);
      if (f.model === undefined && f.enabled === undefined) throw new UserError('give --model and/or --enabled for a role');
      if (f.model !== undefined) team.roles[a].model = needModel(f.model);
      if (f.enabled !== undefined) {
        if (!['true', 'false'].includes(String(f.enabled))) throw new UserError('--enabled must be true or false');
        team.roles[a].enabled = String(f.enabled) === 'true';
      }
      if (!team.locked.includes(a)) team.locked.push(a);
      touched.push(a);
    }
    if (f.communication !== undefined) {
      if (!COMMUNICATION.includes(f.communication)) throw new UserError(`--communication must be one of ${COMMUNICATION.join(', ')}`);
      team.communication = f.communication; touched.push('communication');
    }
    if (f.workflow !== undefined) {
      if (!WORKFLOWS.includes(f.workflow)) throw new UserError(`--workflow must be one of ${WORKFLOWS.join(', ')}`);
      team.workflow = f.workflow; touched.push('workflow');
    }
    if (!touched.length) throw new UserError(USAGE);
    ctx.saveConfig();
    return show(ctx);
  }
  if (sub === 'lead') {
    const name = need(b, USAGE);
    const team = materializeTeam(ctx);
    if (a === 'add') {
      const repos = csv(need(typeof f.repos === 'string' ? f.repos : '', '--repos required'));
      for (const r of repos) getRepo(ctx, r);
      if (team.leads.some((l) => l.name === name)) throw new UserError(`lead "${name}" already exists`);
      for (const r of repos) { const o = leadOf(team, r); if (o) throw new UserError(`repo "${r}" already belongs to lead "${o.name}"`); }
      team.leads.push({ name, repos });
      team.roles.lead.enabled = true;
    } else if (a === 'rm') {
      if (!team.leads.some((l) => l.name === name)) throw new UserError(`unknown lead "${name}"`);
      team.leads = team.leads.filter((l) => l.name !== name);
      if (!team.leads.length) team.roles.lead.enabled = false;
    } else throw new UserError(USAGE);
    ctx.saveConfig();
    return show(ctx);
  }
  if (sub === 'generate') {
    const team = materializeTeam(ctx);
    const notes = [];
    if (!team.locked.includes('ux')) { team.roles.ux.enabled = anyUiRepo(ctx); notes.push(`ux ${team.roles.ux.enabled ? 'enabled (a repo has ui: true)' : 'disabled (no UI repo)'}`); }
    else notes.push('ux is locked: unchanged');
    const n = ctx.config.repos.length;
    const suggest = n >= 4 && !team.leads.length;
    ctx.saveConfig();
    const suggestion = suggest ? ctx.config.repos.map((r) => `specflow team lead add ${r.name} --repos ${r.name}`) : [];
    return emit({ team, notes, suggestion }, () => [
      ...notes,
      suggest ? `${n} repos: consider one lead per repo (not enabled):\n  ${suggestion.join('\n  ')}` : '',
    ].filter(Boolean).join('\n'));
  }
  throw new UserError(USAGE);
}
