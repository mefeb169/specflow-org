// Single source of truth for the lifecycle model (stages, gates, autonomy, routing).
export const STAGES = ['proposed', 'defined', 'specified', 'designed', 'planned', 'implementing', 'verifying', 'accepted', 'released', 'done'];
export const stageIdx = (s) => STAGES.indexOf(s);

export const GATES = ['spec', 'design', 'implement', 'acceptance', 'release'];
// The stage a feature must be in for a gate to be approved (the stage the gate exits).
export const GATE_STAGE = { spec: 'specified', design: 'designed', implement: 'planned', acceptance: 'accepted', release: 'released' };
// The gate that must be satisfied (when required) before entering a stage.
export const GATE_BEFORE = { designed: 'spec', planned: 'design', implementing: 'implement', released: 'acceptance', done: 'release' };

export const AUTONOMY_LEVELS = ['guided', 'standard', 'autonomous'];
export const AUTONOMY_GATES = {
  guided: ['spec', 'design', 'implement', 'acceptance', 'release'],
  standard: ['spec', 'design', 'implement', 'acceptance', 'release'], // design is conditional, see requiredGates
  autonomous: ['acceptance', 'release'],
};

export const DEP_TYPES = ['requires', 'technical', 'after', 'related'];
// Minimum stage a dependency must have reached for each blocking dep type.
export const DEP_MIN_STAGE = { requires: 'accepted', technical: 'designed' };

export const EVIDENCE_KINDS = ['test', 'build', 'lint', 'review', 'security', 'manual', 'analyze', 'release', 'post-release', 'ux-review'];

// UI / UX support
export const UI_STACK = ['react', 'next', 'vue', 'nuxt', '@angular/core', 'svelte', 'react-native', 'expo', 'dart/flutter', 'swift'];
export const UX_DEFAULTS = { design_gate_for_ui: true, require_ux_review: true };
export const UX_SECTIONS = ['## Flows', '## Screens and states', '## Copy', '## Accessibility'];
export const BLOCKER_KINDS = ['requirement', 'technical', 'decision', 'external'];
export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];

// Work item kinds and lanes (schema v2). Slices and issues use the lite lane.
export const KINDS = ['feature', 'slice', 'bug', 'debt', 'chore'];
export const ISSUE_KINDS = ['bug', 'debt', 'chore'];
export const LANES = ['full', 'lite'];
export const defaultLane = (kind) => (kind === 'feature' || kind === undefined ? 'full' : 'lite');
export const SLICING_DEFAULTS = { max_tasks: 15, max_migrations: 1 };
export const LITE_GATES_DEFAULT = ['acceptance', 'release'];
export const QUESTION_TARGETS = ['user', 'product', 'architect', 'ux', 'build', 'verify'];
export const LESSON_STATUSES = ['proposed', 'promoted', 'rejected'];
export const RISKS = ['low', 'med', 'high'];

// Which role skill owns the work that moves a feature OUT of each stage.
export const STAGE_ROLE = {
  proposed: { role: 'specflow:product', action: 'define the feature (value, repos, acceptance criteria)' },
  defined: { role: 'specflow:product', action: 'run speckit-specify (+ speckit-clarify) to write spec.md' },
  specified: { role: 'specflow:architect', action: 'get spec gate approved, then run speckit-plan and add Repository Impact' },
  designed: { role: 'specflow:architect', action: 'get design gate approved (if required), then run speckit-tasks + tag tasks [repo:x]' },
  planned: { role: 'specflow:build', action: 'get implement gate approved, create branches, start implementation' },
  implementing: { role: 'specflow:build', action: 'implement tagged tasks per repo and run verify' },
  verifying: { role: 'specflow:verify', action: 'independent review + passing verification at HEAD for every repo' },
  accepted: { role: 'specflow:product', action: 'get acceptance gate approved, then release' },
  released: { role: 'specflow:flow', action: 'record post-release verification (or waive with a reason)' },
  done: { role: null, action: 'none (feature complete)' },
};

// Spec Kit orchestration map (skills are discovered at runtime; this is only the intent mapping).
export const SPECKIT_STEPS = {
  specify: 'speckit-specify',
  clarify: 'speckit-clarify',
  plan: 'speckit-plan',
  checklist: 'speckit-checklist',
  tasks: 'speckit-tasks',
  analyze: 'speckit-analyze',
  implement: 'speckit-implement',
  converge: 'speckit-converge',
  constitution: 'speckit-constitution',
};

export const DEFAULT_DESTRUCTIVE_PATTERNS = [
  'git\\s+push',
  'git\\s+reset\\s+--hard',
  'git\\s+clean\\s+-[a-z]*f',
  'git\\s+branch\\s+-D',
  'git\\s+checkout\\s+--\\s',
  'git\\s+rebase',
  'git\\s+filter-(branch|repo)',
  'rm\\s+-[a-z]*r[a-z]*f|rm\\s+-[a-z]*f[a-z]*r',
  'Remove-Item.*-Recurse',
  '\\bdrop\\s+(table|database|schema)\\b',
  '\\btruncate\\s+table\\b',
  'migrate\\s+(deploy|up|reset)|db:migrate|alembic\\s+upgrade|prisma\\s+migrate\\s+(deploy|reset)',
  'terraform\\s+(apply|destroy)',
  'kubectl\\s+(apply|delete|rollout)',
  'helm\\s+(install|upgrade|uninstall)',
  'docker\\s+push',
  'npm\\s+publish|cargo\\s+publish|twine\\s+upload|dotnet\\s+nuget\\s+push',
  'gh\\s+(release|pr\\s+merge)',
];
