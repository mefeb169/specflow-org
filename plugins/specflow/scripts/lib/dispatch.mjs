// Dispatch packets: what the PM needs to spawn the right team agent for a work item. Deterministic, no AI.
import fs from 'node:fs';
import path from 'node:path';
import { UserError, handoffRel, inDeployOrder, isContainer, isUi, specDirAbs } from './state.mjs';
import { checkTasks, uxCheck } from './gates.mjs';
import { ROLE_AGENT, ROLE_FALLBACK, ROLE_TARGET, TEAM_ROLES, leadOf, teamCfg } from './team.mjs';

const PROMPT_MAX = 1200;
const cut = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 3)}...` : String(s));
const ARTIFACTS = ['spec.md', 'ux.md', 'plan.md', 'research.md', 'tasks.md', 'verification.md'];

/** Role that owns the work leaving the item's current stage (same routing as nextAction), before team config applies. */
export function stageRole(ctx, f) {
  switch (f.stage) {
    case 'proposed': case 'defined': case 'accepted': return 'product';
    case 'specified': return isUi(ctx, f) && uxCheck(ctx, f).length ? 'ux' : 'architect';
    case 'designed': return 'architect';
    case 'planned': case 'implementing': return 'builder';
    case 'verifying': return 'verifier';
    default: return null; // released: the PM records post-release evidence itself
  }
}

/** Resolves a disabled role to whoever covers it: ux -> architect, lead -> builder, anything else (or a disabled cover) -> the PM. */
export function resolveRole(team, role) {
  let r = role;
  const chain = [];
  while (r && !team.roles[r].enabled) {
    chain.push(r);
    r = ROLE_FALLBACK[r] && !chain.includes(ROLE_FALLBACK[r]) ? ROLE_FALLBACK[r] : null;
  }
  return { role: r, covers: chain };
}

/** Repos of the item still to build, in deploy order (repos without any task yet count as to do). */
export function reposTodo(ctx, f) {
  const per = checkTasks(ctx, f).perRepo;
  return inDeployOrder(ctx, f.repos.filter((n) => !per[n] || per[n].done < per[n].total));
}

function pickRepo(ctx, f, flag, role, team) {
  const todo = reposTodo(ctx, f);
  if (flag !== undefined) {
    if (typeof flag !== 'string' || !f.repos.includes(flag)) throw new UserError(`--repo must be one of ${f.id}'s repos: ${f.repos.join(', ') || '(none)'}`);
    return { repo: flag, todo };
  }
  if (f.repos.length <= 1) return { repo: f.repos[0] || null, todo };
  if (role === 'lead') {
    const leads = [...new Set(f.repos.map((n) => leadOf(team, n)?.name).filter(Boolean))];
    if (leads.length <= 1) return { repo: null, todo };
  }
  throw new UserError(`${f.id} touches ${f.repos.length} repos: pass --repo <name> (to do, in deploy order: ${todo.join(', ') || 'none'})`);
}

export function dispatch(ctx, f, flags = {}) {
  if (f.stage === 'done') throw new UserError(`${f.id} is done: nothing to dispatch`);
  if (f.dropped) throw new UserError(`${f.id} is dropped: nothing to dispatch`);
  const team = teamCfg(ctx);
  let requested;
  if (flags.role !== undefined) {
    if (!TEAM_ROLES.includes(flags.role)) throw new UserError(`--role must be one of ${TEAM_ROLES.join(', ')}`);
    requested = flags.role;
  } else {
    requested = stageRole(ctx, f);
    if (requested === 'builder' && isContainer(ctx, f)) throw new UserError(`${f.id} is split into slices: dispatch one of its slices instead`);
    // A lead takes over the build stages when it is enabled and covers every repo of the item.
    if (requested === 'builder' && team.roles.lead.enabled && f.repos.length && f.repos.every((n) => leadOf(team, n))) requested = 'lead';
  }
  const handoff = handoffRel(ctx, f);
  if (!requested) {
    const prompt = `${f.id} is at ${f.stage}: no team role owns this stage. The PM records post-release evidence and closes it (, ). Handoff: ${handoff}.`;
    return { id: f.id, requested_role: 'pm', covered_by: null, enabled: true, role: 'pm', agent: null, model: null, repo: null, repos_todo: [], questions: [], prompt };
  }
  const eff = resolveRole(team, requested);
  const base = { id: f.id, requested_role: requested, covered_by: eff.role === requested ? null : eff.role || 'pm', enabled: team.roles[requested].enabled };
  if (!eff.role) {
    const prompt = `The ${requested} role is disabled and nothing covers it: the PM does this step itself for ${f.id} (${f.stage}). Read ${handoff}, follow the ${requested} skill, and record the result with the CLI.`;
    return { ...base, role: 'pm', agent: null, model: null, repo: null, repos_todo: [], questions: [], prompt };
  }
  const role = eff.role;
  const { repo, todo } = role === 'builder' || role === 'lead' ? pickRepo(ctx, f, flags.repo, role, team) : { repo: null, todo: [] };
  const lead = role === 'lead' ? (repo ? leadOf(team, repo) : leadOf(team, f.repos[0])) : null;
  if (role === 'lead' && !lead) throw new UserError(`no lead covers ${repo || f.repos.join(', ')}: add one with \`team lead add\``);
  const target = ROLE_TARGET[role];
  let qs = ctx.backlog.questions.filter((q) => q.status === 'open' && q.feature === f.id && q.to === target);
  if (flags.question !== undefined) {
    const q = ctx.backlog.questions.find((x) => x.id === flags.question);
    if (!q || q.status !== 'open') throw new UserError(`${flags.question} is not an open question`);
    qs = [q];
  }
  const dir = specDirAbs(ctx, f);
  const have = dir ? ARTIFACTS.filter((a) => fs.existsSync(path.join(dir, a))) : [];
  const round = f.rework.find((r) => !r.closed_at);
  const shown = qs.slice(0, 4).map((q) => `${q.id} ${cut(q.text, 80)}`).join(' | ') + (qs.length > 4 ? ` (+${qs.length - 4} more: specflow question list --open --feature ${f.id})` : '');
  const lines = [
    `specflow dispatch: role ${role}. ${f.id} "${cut(f.title, 60)}" (${f.kind}, lane ${f.lane}, stage ${f.stage}${round ? `, rework round ${round.n}: ${cut(round.reason, 60)}` : ''}).`,
    eff.covers.length ? `You cover the disabled ${eff.covers.join(', ')} role.` : '',
    repo ? `Repo: ${repo}${todo.length > 1 ? ` (repos still to do, deploy order: ${todo.join(', ')})` : ''}` : '',
    lead ? `Lead area: ${lead.name} (repos: ${lead.repos.filter((n) => f.repos.includes(n)).join(', ')})` : '',
    `Handoff: ${handoff}${fs.existsSync(path.resolve(ctx.root, handoff)) ? '' : ' (not written yet)'}`,
    `Spec dir: ${f.spec_dir || '(none)'}${have.length ? ` (${have.join(', ')})` : ''}`,
    qs.length ? `Open questions for you: ${shown}` : '',
    `PM update level: ${team.communication}.`,
    'Follow the subagent contract in your agent definition.',
  ].filter(Boolean);
  const prompt = cut(lines.join('\n'), PROMPT_MAX);
  return { ...base, role, agent: ROLE_AGENT[role], model: team.roles[role].model, repo, lead: lead ? lead.name : null, repos_todo: todo, questions: qs.map((q) => q.id), prompt };
}
