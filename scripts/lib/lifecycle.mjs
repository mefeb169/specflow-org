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

export const EVIDENCE_KINDS = ['test', 'build', 'lint', 'review', 'security', 'manual', 'analyze', 'release', 'post-release'];
export const BLOCKER_KINDS = ['requirement', 'technical', 'decision', 'external'];
export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
export const RISKS = ['low', 'med', 'high'];

// Which role skill owns the work that moves a feature OUT of each stage.
export const STAGE_ROLE = {
  proposed: { role: 'sdlc-product', action: 'define the feature (value, repos, acceptance criteria)' },
  defined: { role: 'sdlc-product', action: 'run speckit-specify (+ speckit-clarify) to write spec.md' },
  specified: { role: 'sdlc-architect', action: 'get spec gate approved, then run speckit-plan and add Repository Impact' },
  designed: { role: 'sdlc-architect', action: 'get design gate approved (if required), then run speckit-tasks + tag tasks [repo:x]' },
  planned: { role: 'sdlc-build', action: 'get implement gate approved, create branches, start implementation' },
  implementing: { role: 'sdlc-build', action: 'implement tagged tasks per repo and run verify' },
  verifying: { role: 'sdlc-verify', action: 'independent review + passing verification at HEAD for every repo' },
  accepted: { role: 'sdlc-product', action: 'get acceptance gate approved, then release' },
  released: { role: 'sdlc', action: 'record post-release verification (or waive with a reason)' },
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
