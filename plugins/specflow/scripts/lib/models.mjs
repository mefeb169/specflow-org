// Model policy: pick the lowest model tier that fits the work item, never above the role's configured model.
// Deterministic, no AI. The configured role model is a ceiling under the "auto" policy and the exact model under "fixed".
import { sizeCounts, traits } from './gates.mjs';
import { teamCfg } from './team.mjs';

export const TIERS = ['haiku', 'sonnet', 'opus'];
export const MODEL_POLICIES = ['auto', 'fixed'];
export const COMPLEXITY = ['low', 'medium', 'high'];

// Model each role needs per complexity level. Judgment-heavy roles (architect, reviewer on risky work) get the top
// tier only where the work is complex; mechanical work (small builds, test runs, profiling) runs on the lowest.
export const ROLE_TIERS = {
  product: { low: 'sonnet', medium: 'sonnet', high: 'opus' },
  architect: { low: 'sonnet', medium: 'opus', high: 'opus' },
  ux: { low: 'sonnet', medium: 'sonnet', high: 'opus' },
  lead: { low: 'sonnet', medium: 'sonnet', high: 'opus' },
  builder: { low: 'haiku', medium: 'sonnet', high: 'sonnet' },
  verifier: { low: 'haiku', medium: 'sonnet', high: 'sonnet' },
  reviewer: { low: 'haiku', medium: 'sonnet', high: 'opus' },
  profiler: { low: 'haiku', medium: 'haiku', high: 'haiku' },
  release: { low: 'haiku', medium: 'sonnet', high: 'sonnet' },
};

// Thresholds on tasks.md (task count) for the complexity levels.
const LOW_MAX_TASKS = 5;
const HIGH_MIN_TASKS = 11;

/**
 * Complexity of a work item: { level, reasons, override }.
 * high: several repos, a migration, more than 10 tasks, risk high, or a second rework round.
 * low: lite lane (slice, bug, debt, chore), one repo, at most 5 tasks, no migration, risk not high, no rework round.
 * Anything else is medium. `feature set <id> complexity low|medium|high` overrides; `auto` clears the override.
 */
export function complexity(ctx, f) {
  if (COMPLEXITY.includes(f.complexity)) return { level: f.complexity, reasons: ['set by hand'], override: true };
  const t = traits(ctx, f);
  const size = sizeCounts(ctx, f);
  const rounds = (f.rework || []).length;
  const high = [];
  if (f.repos.length > 1) high.push(`${f.repos.length} repos`);
  if (t.migration || (size && size.migrations > 0)) high.push('migration');
  if (size && size.tasks >= HIGH_MIN_TASKS) high.push(`${size.tasks} tasks`);
  if (f.risk === 'high') high.push('risk high');
  if (rounds >= 2) high.push(`${rounds} rework rounds`);
  if (high.length) return { level: 'high', reasons: high, override: false };
  const lowOk = f.lane === 'lite' && (!size || size.tasks <= LOW_MAX_TASKS) && rounds === 0;
  if (lowOk) return { level: 'low', reasons: [`lite lane (${f.kind})`, f.repos.length ? '1 repo' : 'no repo', size ? `${size.tasks} tasks` : 'no tasks.md yet'], override: false };
  const why = [];
  if (f.lane !== 'lite') why.push(`${f.lane} lane`);
  if (size && size.tasks > LOW_MAX_TASKS) why.push(`${size.tasks} tasks`);
  if (rounds === 1) why.push('in or after a rework round');
  return { level: 'medium', reasons: why.length ? why : ['default'], override: false };
}

const tierIdx = (m) => TIERS.indexOf(m);

/**
 * Model for a role on a work item: { model, ceiling, policy, complexity, reasons }.
 * auto: the role's tier for the item's complexity, capped at the configured model.
 * fixed, or a configured model outside the tier list (inherit, fable, claude-*): the configured model.
 */
export function pickModel(ctx, f, role, taskModel = null) {
  const team = teamCfg(ctx);
  const ceiling = team.roles[role].model;
  const c = f ? complexity(ctx, f) : { level: 'medium', reasons: ['no work item'], override: false };
  const base = { ceiling, policy: team.model_policy, complexity: c.level, reasons: c.reasons };
  if (team.model_policy === 'fixed') return { ...base, model: ceiling, why: 'model_policy fixed' };
  if (tierIdx(ceiling) < 0 || !ROLE_TIERS[role]) return { ...base, model: ceiling, why: `configured model ${ceiling} is not a tier` };
  const tagged = tierIdx(taskModel) >= 0;
  const want = tagged ? taskModel : ROLE_TIERS[role][c.level];
  const model = TIERS[Math.min(tierIdx(want), tierIdx(ceiling))];
  return { ...base, model, why: `${tagged ? `task tag ${taskModel}` : `complexity ${c.level}: ${c.reasons.join(', ')}`}${model !== want ? ` (capped at ${ceiling})` : ''}` };
}
