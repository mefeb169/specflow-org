# Task 1 Plan — AI-Driven SDLC Framework ("sdlc")

Source requirements: [task-1.md](task-1.md).
Audience: the implementing agent (Sonnet). Part A holds the design decisions, and they are fixed: do not reopen them unless they turn out to be impossible, and if one does, stop and report. Part B is the build spec for **Phase 1 only**. Part C lists later phases, which you must **not** build now.

---

## 0. Environment facts (verified 2026-10-15)

| Fact | Value |
|---|---|
| OS / shells | Windows 11, PowerShell 5.1 + Git Bash |
| Claude Code | 2.1.291 |
| Spec Kit CLI | `specify` 1.2.0 (at `~/.local/bin/specify`) |
| Runtime for scripts | Node.js (always present, since Claude Code runs on it). Python/uv are also present but are **not** to be used. |
| Framework repo | `D:\Work\skill-framework` (empty apart from `tasks/`; not yet a git repo) |

What `specify init --here --integration claude --non-interactive` produces (seen in a probe):

- `.claude/skills/speckit-{constitution,specify,clarify,plan,tasks,analyze,checklist,implement,converge,taskstoissues}/SKILL.md`. These are **skills**, so you invoke them with the Skill tool as `speckit-specify` and so on. They are not `/speckit.specify` slash commands.
- `.specify/memory/constitution.md`, `.specify/templates/*.md`, `.specify/scripts/powershell/*.ps1`, `.specify/workflows/speckit/workflow.yml`, `.specify/init-options.json`, `.specify/integration.json`.
- Feature directories are `specs/NNN-short-name/` (`spec.md`, `plan.md`, `tasks.md`, plus optional `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `checklists/`).
- The current feature is tracked in `.specify/feature.json` (`feature_directory`) or the env var `SPECIFY_FEATURE_DIRECTORY`. **The spec directory name is independent of the git branch**, and branch creation only happens through the optional `git` extension's `before_specify` hook.
- Every speckit skill reads `.specify/extensions.yml` for `hooks.before_<cmd>` / `hooks.after_<cmd>` (for `specify`, `clarify`, `plan`, `tasks`, `analyze`, `checklist`, `implement`, `converge`, `constitution`, `taskstoissues`).
- Introspection commands: `specify version`, `specify check`, `specify artifact list`, `specify extension list`.

---

# Part A — Design (decided)

## A1. Architecture: four layers, one rule per layer

| Layer | What it is | Used for | Guarantee |
|---|---|---|---|
| **Instructions** | Workspace `CLAUDE.md` block, role `SKILL.md` files | Judgment: interpretation, writing specs and designs, choosing next steps | None; this layer is advisory |
| **Scripts** | `sdlc` Node CLI (`scripts/sdlc.mjs`) | All state mutation, scanning, transition checks, running test commands, writing evidence | Deterministic and validated |
| **Hooks** | Claude Code hooks shipped in the plugin | Enforcement: block direct state edits, force human approval for gates and destructive commands, inject state at session start | Deterministic and enforced by the harness |
| **Spec Kit** | Installed `speckit-*` skills + `.specify/` | Spec → clarify → plan → tasks → analyze → implement for each feature | Spec Kit is the owner of those artifacts |

**Core rule:** the AI never writes lifecycle state directly. It calls `sdlc` subcommands. Hooks block direct edits to state files, and the gate-approval subcommand always raises a human permission prompt. This is what turns "controlled autonomy" into something enforced rather than something hoped for.

**Distribution:** this repo is a **Claude Code plugin** (skills, agents, hooks, scripts) published through a local marketplace. Plugin updates replace only plugin files. Workspace files are created once by `sdlc init` and are never overwritten by an update.

## A2. Workspace model

```
ProductRoot/                    # the "workspace root"; Claude Code is opened here
├── CLAUDE.md                   # existing content kept; framework adds ONE marked block
├── .sdlc/                      # framework state (workspace-level)
│   ├── config.json             # repos registry, autonomy, guards, commands
│   ├── backlog.json            # SINGLE source of feature identity/status/deps/gates
│   ├── product.md              # vision, users, goals, MVP boundary, constraints
│   ├── workspace-map.md        # repo profiles + integrations + conflicts (evidence-tagged)
│   ├── decisions/ADR-0001-*.md # cross-cutting decisions
│   └── cache/                  # regenerable (scan.json); gitignored
├── .specify/                   # Spec Kit, initialized at the ROOT (one per workspace)
├── specs/NNN-name/             # Spec Kit feature dirs + framework's verification.md
├── .claude/skills/speckit-*    # installed by Spec Kit
├── frontend/   (git repo)      # untouched apart from feature branches/commits
└── backend/    (git repo)
```

Decisions:
1. **Shared artifacts live at the workspace root, not inside a product repo.** Making the root its own small git repo (the "workspace repo") is **recommended but optional**. When it is one, `sdlc init` adds every child repo path to the root `.gitignore`, and nothing is ever merged or moved.
2. **Monorepo or single repo:** the root *is* the repo, so `.sdlc/` and `specs/` sit next to the code. The registry then lists one repo (`path: "."`), or one entry per package if packages are independently buildable.
3. **A child repo that already has its own `.specify/`:** keep it. Record it in config as `speckit: "repo-local"`. Features that touch only that repo use that repo's Spec Kit, so the orchestrator `cd`s into the repo for the speckit steps. Cross-repo features always use the root Spec Kit.
4. **Repo boundaries:** each repo keeps its own git history, branches and instructions. The framework only creates feature branches and commits, and only in the repos a feature lists as affected. It never pushes without approval.

## A3. Context discovery

There are two passes, and the cheap deterministic pass comes first.

**Pass 1: `sdlc scan` (script, no AI).** It walks the root to depth 4, skipping `node_modules`, `.git` internals, `vendor`, `dist`, `build`, `target`, `.venv` and similar, and writes `.sdlc/cache/scan.json`:
- git repos (directories containing `.git`) and monorepo workspaces (`package.json#workspaces`, `pnpm-workspace.yaml`, `go.work`, `*.sln`, Cargo `[workspace]`);
- per repo: manifests (`package.json`, `pyproject.toml`, `requirements*.txt`, `go.mod`, `*.csproj`, `*.sln`, `pom.xml`, `build.gradle*`, `Cargo.toml`, `Gemfile`, `composer.json`, `pubspec.yaml`, `Package.swift`), with the script names and test/build scripts found in them;
- instruction files: `CLAUDE.md`, `CLAUDE.local.md`, `.claude/` (skills, commands, settings hooks), `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.github/instructions/*.md`, `.cursorrules`, `.cursor/rules/*`, `.windsurfrules`, `CONTRIBUTING.md`;
- docs: `README*`, `docs/**/*.md` (paths only), ADR folders;
- API contracts: `openapi*.{yml,yaml,json}`, `swagger*`, `*.graphql`, `*.proto`;
- data: `migrations/`, `prisma/schema.prisma`, `*.sql`, ORM model directories (paths only);
- tests: test directories and config files (`jest.config*`, `vitest.config*`, `pytest.ini`, `playwright.config*`, and so on);
- CI/CD and infra: `.github/workflows/*`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `Dockerfile*`, `docker-compose*`, `k8s/`, `helm/`, `*.tf`;
- Spec Kit: `.specify/` (version from `init-options.json`) and `specs/*`.

**Pass 2: AI profiling (skill `sdlc-discover`).** It spawns one `repo-profiler` subagent per repo, in parallel, so that each repo's reading stays out of the main context. Each subagent reads, in priority order: instruction files → README → manifests → entry points → contracts and schemas → a sample of tests. It returns a fixed-format profile. The skill then merges the profiles into `workspace-map.md` and calls `sdlc repo set` to write confirmed commands into config.

**Evidence tags** go on every claim in `workspace-map.md` and in feature inventories:
`[code]` seen in the implementation · `[run]` confirmed by running a command · `[doc]` stated only in documentation · `[planned]` a spec or backlog item · `[unknown]` / `[conflict]`.
Documentation alone never earns `[code]`, and missing documentation never means "absent".

**Instruction precedence** (written into the workspace CLAUDE.md block):
1. The user's explicit instruction in the current session.
2. Repo-level instructions (`<repo>/CLAUDE.md`, `AGENTS.md`, …), for work inside that repo.
3. Workspace `CLAUDE.md` (non-framework content).
4. The Spec Kit constitution, for spec, plan and task decisions.
5. Framework defaults (role skills).

When two sources at different levels disagree on something that changes behavior, apply the higher one **and** record the conflict in `workspace-map.md › Conflicts`. When sources at the same level disagree, stop and ask. The framework never edits an existing instruction file except to add or update its own marked block, and only with approval.

## A4. Spec Kit integration

- **Detection** (`sdlc doctor`, script): runs `specify version` and checks for `.specify/`, `init-options.json` (integration, version, `feature_numbering`) and the `speckit-*` skills in `.claude/skills/`. It records `config.speckit = {version, integration, location, skills:[...]}`. Skills are **discovered**, not assumed. If a step's skill is missing, the orchestrator says so and falls back as described below.
- **Initialization:** `specify init --here --integration claude --non-interactive` runs only when neither the root nor any repo has `.specify/`, and **only after user approval**. If the root is non-empty, `--force` is needed. Explain why first, because it only adds files.
- **Constitution:** if one exists, it is authoritative. For a new project, run `speckit-constitution` with the principles collected by `sdlc-product`/`sdlc-architect`. For an existing project with only the placeholder constitution, draft it from discovered conventions and get approval.
- **Orchestration mapping:**

| Lifecycle step | Spec Kit skill | Required? |
|---|---|---|
| Specify | `speckit-specify` | yes |
| Clarify | `speckit-clarify` | if `[NEEDS CLARIFICATION]` markers remain or the product skill flags ambiguity |
| Plan | `speckit-plan` | yes |
| Checklist | `speckit-checklist` | optional (security- or compliance-heavy features) |
| Tasks | `speckit-tasks` | yes |
| Analyze | `speckit-analyze` | yes for multi-repo features; recommended otherwise |
| Implement | `speckit-implement` | yes (scoped per repo/phase, see A7) |
| Converge | `speckit-converge` | when implementation diverged from the spec |

- **Active feature:** before each speckit call, the orchestrator runs `sdlc feature activate F-xxx`, which writes `.specify/feature.json` → `{"feature_directory": "specs/NNN-name"}`. This makes Spec Kit operate on the right feature even across sessions.
- **Cross-repo additions (Phase 1, done through instructions rather than template overrides):** after `speckit-plan`, `sdlc-architect` appends a `## Repository Impact` section to `plan.md`: a table of repo, change summary, contracts touched, migration (Y/N) and deploy order. After `speckit-tasks`, it makes sure every task line carries a `[repo:<name>]` tag. `sdlc check tasks F-xxx` validates the tags. Phase 2 moves this into a Spec Kit preset and extension.
- **Never** invent speckit commands, never edit `.specify/templates/*` in Phase 1, and never use `specify workflow run`, because its gates duplicate ours.

## A5. Roles: 6 skills + 2 subagents (not 17 personas)

| Skill (plugin namespace `sdlc:`) | Covers candidate roles | Stages |
|---|---|---|
| `sdlc` (orchestrator) | Project Manager | all: routing, status, next, resume |
| `sdlc-discover` | Technical Writer (inventory), part of Architect | bootstrap, refresh |
| `sdlc-product` | Product Manager, Product Owner, Business Analyst, Requirements Analyst | define, specify, clarify, accept |
| `sdlc-architect` | Solution/Software Architect, Database Engineer (design) | design, plan, tasks |
| `sdlc-build` | Backend/Frontend/Mobile/DB developer, Technical Writer (doc updates) | implement |
| `sdlc-verify` | QA/Test, Code Reviewer, Security Reviewer | verify |
| *(Phase 2)* `sdlc-ux`, `sdlc-release` | UX/UI Designer; DevOps/Release | design; release, post-deploy |

| Subagent (`agents/`) | Why it is a separate agent |
|---|---|
| `repo-profiler` | Isolates context; one per repo, runs in parallel; read-only tools |
| `independent-reviewer` | Gives a fresh context that did not write the code; read-only tools + Bash for tests/diff; reviews the diff against spec + plan + repo instructions |

The stack specialization comes from **data**, not personas: `sdlc-build` reads that repo's profile and instructions from `workspace-map.md` and config (test/build/lint commands, conventions).

**Every role SKILL.md uses this exact contract** (as headings):
`Purpose` · `Use when` · `Inputs (read first)` · `Outputs (artifacts)` · `Stages` · `May do autonomously` · `Requires approval` · `Must not` · `Handoff` (which `sdlc` call, and the next role) · `Done when` · `Escalate when`.

The key "must not" rules:
- product never chooses technology;
- architect never changes acceptance criteria;
- build never changes `spec.md` or acceptance criteria. When it finds a requirement conflict, it runs `sdlc blocker add F-xxx "<text>" --kind requirement`, stops, and hands back to the orchestrator;
- verify never fixes code. It reports, and the orchestrator routes the finding back to build;
- no role approves a gate.

## A6. Lifecycle state model

Stages, in order (`backlog.json › features[].stage`):

| # | Stage | Entry (checked by `sdlc stage set`) | Exit artifact | Role | Gate on exit |
|---|---|---|---|---|---|
| 0 | `proposed` | — | backlog entry | product | — |
| 1 | `defined` | title, value, ≥1 acceptance-criteria draft in `notes`, `repos` guessed | backlog entry complete | product | — |
| 2 | `specified` | `spec_dir/spec.md` exists; 0 `[NEEDS CLARIFICATION]` | `spec.md` | product | **spec** |
| 3 | `designed` | gate `spec` approved; `plan.md` exists with a `## Repository Impact` section when repos > 1 | `plan.md` (+ contracts, data-model) | architect | **design** |
| 4 | `planned` | gate `design` approved; `tasks.md` exists; every task has a `[repo:x]` tag naming a registered repo | `tasks.md` (+ analyze report noted in `verification.md`) | architect | **implement** |
| 5 | `implementing` | gate `implement` approved; branch recorded for every affected repo | code commits | build | — |
| 6 | `verifying` | all tasks `[X]` in `tasks.md` | — | verify | — |
| 7 | `accepted` | for every affected repo, a passing `sdlc verify run` entry at that repo's **current HEAD**; 0 open blockers; review recorded | `verification.md` | product (+ human) | **acceptance** |
| 8 | `released` | gate `acceptance` approved; release record added | release entry | (Phase 2 release) | **release** |
| 9 | `done` | post-release check recorded or waived with a reason | — | — | — |

Flags beside the stage are `blocked` (derived: there are open blockers) and `revisit: {stage, reason}`. Moving backward is allowed through `sdlc stage set F-x <earlier> --reason "..."`. It clears the gates downstream of that stage and is logged in `history`.

Which gates are required comes from `config.autonomy`:
- `guided`: all five gates.
- `standard` (default): `spec`, `implement`, `acceptance`, `release`. The `design` gate applies only when repos > 1 or the plan adds a migration.
- `autonomous`: `acceptance`, `release`.

Destructive-command guards apply at every level.

**Resume:** the SessionStart hook runs `sdlc brief`, which reports in-flight features, their stage, what is pending and any **staleness**: for example, a repo HEAD that differs from the SHA in the last verification, a missing branch, or `tasks.md` changed since the stage was set. The orchestrator re-checks files before trusting the recorded state. It never trusts claims from an earlier conversation.

## A7. Artifact and source-of-truth policy

| Information | Lives in (only here) | Written by |
|---|---|---|
| Feature identity, priority, value, MVP flag, deps, affected repos, stage, gates, blockers, branches, history | `.sdlc/backlog.json` | `sdlc` CLI only (hook-enforced) |
| Requirements, user stories, acceptance criteria | `specs/NNN/spec.md` | `speckit-specify`/`clarify` |
| Technical design, contracts, repo impact | `specs/NNN/plan.md`, `contracts/`, `data-model.md` | `speckit-plan` + architect |
| Tasks (repo-tagged), task completion | `specs/NNN/tasks.md` | `speckit-tasks` / implement |
| Verification evidence (commands, exit codes, SHAs, review findings) | `specs/NNN/verification.md` (append-only) | `sdlc verify run` / `sdlc evidence add` |
| Product vision, users, MVP | `.sdlc/product.md` | product |
| Repo profiles, integrations, conflicts | `.sdlc/workspace-map.md` | discover |
| Repo commands, autonomy, guards | `.sdlc/config.json` | `sdlc` CLI |
| Cross-cutting decisions | `.sdlc/decisions/ADR-*.md` | architect |
| Principles | `.specify/memory/constitution.md` | `speckit-constitution` |
| Repo conventions | each repo's own instruction files | (untouched) |
| Status views, "what's next" | **generated** by `sdlc status` / `sdlc next` (no stored files) | — |

Feature IDs: backlog IDs are `F-001`… and stay stable from the start. `spec_dir` gets linked once the feature is specified.

**Cross-repo implementation:** `sdlc branches create F-x` creates the branch `<spec_dir basename>` (for example `004-password-reset`) in every affected repo. This needs approval through a hook prompt. `sdlc-build` then works one repo at a time in deploy order (from Repository Impact), using `speckit-implement` with the argument `"Only tasks tagged [repo:<name>]"`, or implementing tasks directly when that is clearer. It commits in that repo and runs `sdlc verify run F-x --repo <name>` before moving to the next repo.

## A8. Automation and approval model

| Activity | Default |
|---|---|
| Scanning, reading, profiling, drafting docs/specs/plans, `sdlc status/next/brief/check` | autonomous |
| Creating backlog entries, setting stages (the CLI validates them) | autonomous |
| Writing to `.sdlc/*.md`, `specs/**` | autonomous |
| `sdlc gate approve` | **always a human prompt** (PreToolUse → `ask`) |
| Direct Edit/Write of `.sdlc/backlog.json` or `.sdlc/config.json` | **denied** (use the CLI) |
| Editing existing non-framework instruction files (`CLAUDE.md`, `AGENTS.md`, …) | **ask** |
| `specify init`, `sdlc init`, `sdlc branches create` | **ask** |
| Source edits in a repo when no feature in that repo is `implementing` | `config.guards.source_edit_outside_implementing`: `ask` (default) / `deny` / `off` |
| Destructive or outward-facing Bash (pattern list in config, see B5) | **ask** |
| Failed verification | the stage cannot advance (CLI refuses); reported honestly |

## A9. Representative walkthrough: "Password reset via email" (frontend + backend)

1. The user says "Let's work on the next feature". SessionStart has already injected the brief. `sdlc` runs `sdlc next`, which returns F-004 "Password reset" as ready: its prerequisite F-001 "User accounts" is `done`, it is MVP, priority P1, and it affects `backend` and `frontend`. The orchestrator explains why and the user agrees.
2. **Define/specify (product):** reads `product.md`, the F-001 spec and the backend auth code (`[code]` evidence). `sdlc feature activate F-004` runs, then `speckit-specify` → `specs/004-password-reset/spec.md`. Two ambiguities (token lifetime, rate limit) lead to `speckit-clarify`, which asks the user. `sdlc stage set F-004 specified`. The **spec gate** comes next: the user approves through the `sdlc gate approve` prompt.
3. **Design (architect):** `speckit-plan` → `plan.md`, `contracts/password-reset.openapi.yaml`, `data-model.md` (a `reset_tokens` table, so a migration). The architect appends Repository Impact: backend (endpoints, migration, mailer; deploys first) and frontend (2 pages; deploys second). A migration plus two repos means the **design gate** is required, and it is approved.
4. **Tasks:** `speckit-tasks` → tasks tagged `[repo:backend]`/`[repo:frontend]`. `speckit-analyze` runs and its findings are fixed. `sdlc check tasks` passes, then `stage set planned`. The **implement gate** prompt lists both repos, the branches and the migration, and the user approves.
5. **Build:** `sdlc branches create F-004` → `004-password-reset` in both repos. The backend tasks run, then `sdlc verify run F-004 --repo backend` runs the configured `npm test`. It exits 1, the evidence records the failure, and the stage stays put. After the fix it passes and the evidence is recorded at the SHA. The same happens for the frontend.
6. **Verify:** `independent-reviewer` reviews both diffs against the spec, contracts and security checklist. One finding (token not single-use) goes to a blocker, then back to build, then a re-run. Once all evidence is green at HEAD, `stage set accepted` is attempted. The CLI checks the SHAs and blockers, and then the **acceptance gate** asks the human, who walks through the acceptance criteria in `verification.md`.
7. **Release (Phase 2):** recorded manually in Phase 1 with `sdlc evidence add F-004 --kind release`.

## A10. Trade-offs and risks

- **Skills are advisory.** The AI may skip the orchestrator. Mitigations: hooks guard state, gates and destructive commands, and the CLI refuses invalid transitions. Anything not covered by those is best-effort.
- **Spec Kit drift:** skill names and files may change between versions. `sdlc doctor` discovers the skills, config records the version, and the A4 mapping lives in **one** place (the orchestrator skill plus a constant in the CLI).
- **Context limits:** discovery is two-pass with subagents, and the map stores summaries plus paths, not content. Roles read only their "Inputs".
- **The root-level Spec Kit is a non-default layout:** Spec Kit expects one repo. The probe shows it works from paths and `feature.json`, not git, so `specs/` at a non-git root is fine. **Risk:** `speckit-implement` may assume one repo for checks such as ignore files. Scoping per repo mitigates this.
- **Over-ambition:** Phase 1 deliberately has no UX/release roles, no Spec Kit extension, no upgrade tooling and no issue-tracker sync.
- **Gate prompt fatigue:** autonomy levels and guard modes are configurable.

## A11. Unresolved choices (Phase 1 defaults are in bold; flag them to the user, but don't block on them)

1. Workspace root as its own git repo: **recommend, don't require**.
2. Default autonomy: **standard**.
3. Source-edit guard default: **ask**.
4. Branch naming: **spec dir basename**, overridable by `config.branch_pattern`.

---

# Part B — Phase 1 build spec (implement exactly this)

## B0. Before writing code

1. Use the `claude-code-guide` agent to confirm the **current** plugin layout for Claude Code 2.1.x: `.claude-plugin/plugin.json` fields, the `skills/`, `agents/` and `hooks/hooks.json` locations, `${CLAUDE_PLUGIN_ROOT}`, and the marketplace.json format for a local-directory install. Also confirm the hook I/O for `SessionStart` (`hookSpecificOutput.additionalContext`), `PreToolUse` (`hookSpecificOutput.permissionDecision: allow|deny|ask` + `permissionDecisionReason`) and `Stop`. If anything differs from what is assumed below, follow the docs and note the difference in `README.md`.
2. Run `git init` in `D:\Work\skill-framework`. Commit at the end of each numbered B-step (conventional message + attribution line).

## B1. Repository layout to create

```
skill-framework/
├── .claude-plugin/
│   ├── plugin.json              # name "sdlc", version "0.1.0"
│   └── marketplace.json         # local marketplace listing this plugin
├── skills/
│   ├── sdlc/SKILL.md
│   ├── sdlc-discover/SKILL.md
│   ├── sdlc-product/SKILL.md
│   ├── sdlc-architect/SKILL.md
│   ├── sdlc-build/SKILL.md
│   ├── sdlc-verify/SKILL.md
│   └── _shared/                 # referenced from skills, not a skill itself
│       ├── role-contract.md     # the contract headings + rules from A5
│       ├── evidence-tags.md     # A3 tags + precedence policy
│       └── lifecycle.md         # A6 table + A4 mapping (single source for skills)
├── agents/
│   ├── repo-profiler.md
│   └── independent-reviewer.md
├── hooks/hooks.json
├── scripts/
│   ├── sdlc.mjs                 # CLI entry (subcommand dispatch)
│   ├── lib/{state,scan,lifecycle,gates,git,verify,render,guard}.mjs
│   └── hooks/{session-start,pre-tool-use,stop}.mjs
├── templates/workspace/
│   ├── config.json  backlog.json  product.md  workspace-map.md
│   ├── claude-md-block.md       # text between <!-- sdlc:begin --> / <!-- sdlc:end -->
│   └── verification.md
├── tests/
│   ├── make-fixture.mjs         # builds a temp workspace with 2 git repos
│   └── *.test.mjs               # node --test
├── README.md                    # install, commands, concepts (short)
└── package.json                 # "type":"module", "bin": {"sdlc": "scripts/sdlc.mjs"}, test script; NO dependencies
```

Constraints: zero npm dependencies. Node ≥ 18 built-ins only. All paths go through `node:path`, with Windows and POSIX both supported. JSON files are written with 2-space indentation and a trailing newline, and written **atomically** (write to a temp file, then rename).

## B2. Data schemas (`schema_version: 1`)

`.sdlc/config.json`
```json
{
  "schema_version": 1,
  "framework_version": "0.1.0",
  "workspace": {"name": "", "root_is_repo": false},
  "autonomy": "standard",
  "branch_pattern": "{spec_slug}",
  "repos": [
    {"name": "backend", "path": "backend", "kind": "git|monorepo-package|root",
     "purpose": "", "stack": [], "commands": {"test": null, "build": null, "lint": null},
     "commands_confirmed": false, "speckit": "root|repo-local", "deploy_order": null}
  ],
  "speckit": {"version": null, "integration": null, "location": ".", "skills": []},
  "guards": {
    "source_edit_outside_implementing": "ask",
    "destructive_bash_patterns": ["<defaults from B5>"],
    "extra_bash_patterns": []
  }
}
```

`.sdlc/backlog.json`
```json
{
  "schema_version": 1,
  "next_id": 1,
  "features": [{
    "id": "F-001", "title": "", "summary": "",
    "priority": "P0|P1|P2|P3", "mvp": true, "value": "", "risk": "low|med|high",
    "stage": "proposed", "spec_dir": null,
    "repos": [], "branches": {"backend": "004-x"},
    "deps": [{"id": "F-000", "type": "requires|technical|after|related", "note": ""}],
    "gates": {"spec": null, "design": null, "implement": null, "acceptance": null, "release": null},
    "blockers": [{"id": "B-1", "kind": "requirement|technical|decision|external", "text": "", "open": true, "created": "", "resolved": null}],
    "revisit": null,
    "history": [{"at": "", "event": "stage|gate|blocker|link", "detail": ""}]
  }]
}
```
A gate value is either `null` or `{"approved_at": iso, "by": "human", "note": ""}`.

Dependency semantics (used by `next`):
- `requires`: blocks until the dependency's stage is ≥ `accepted`.
- `technical`: blocks until the dependency's stage is ≥ `designed` (its contracts exist).
- `after`: a soft ordering preference only.
- `related`: informational only.

`specs/NNN/verification.md` is append-only. Each entry is one level-3 heading `### <iso> · <kind> · <repo|all>` followed by bullet fields: `command`, `exit_code`, `sha`, `result: pass|fail`, `output_tail` (a fenced block, last 40 lines), `note`. Kinds: `test`, `build`, `lint`, `review`, `security`, `manual`, `analyze`, `release`, `post-release`. The CLI also writes a machine mirror of each entry to `.sdlc/cache/evidence/<F-id>.jsonl` for fast checks. If the mirror is missing, rebuild it by parsing the markdown.

## B3. CLI (`node scripts/sdlc.mjs <cmd>`; the workspace root is found by walking up to `.sdlc/`, or set with `--root`)

Every command supports `--json` for machine output. Exit code 0 means success, 1 a user error or refused transition (with the reason on stderr), and 2 an internal error.

| Command | Behavior |
|---|---|
| `init [--root-is-repo]` | Creates `.sdlc/` from templates (never overwrites existing files; reports any it skipped). Adds the marked block to the root `CLAUDE.md` (creating the file if absent, otherwise replacing only the content between the markers). Adds `.sdlc/cache/` to the root `.gitignore`, and child repo paths too when `--root-is-repo` is given. Then runs `scan` and `doctor`. |
| `scan` | Pass 1 from A3 → `.sdlc/cache/scan.json`. New repos are added to `config.repos` with `commands_confirmed:false`. Repos that have disappeared are reported, not deleted. |
| `doctor` | Spec Kit detection (A4), node/git availability, config/backlog schema validation, repo paths existing. Prints a checklist. |
| `repo set <name> [--test cmd] [--build cmd] [--lint cmd] [--purpose s] [--stack a,b] [--confirm] [--deploy-order n]` | Updates the repo registry. |
| `feature add --title s [--priority P2] [--mvp] [--repos a,b] [--summary s]` | Prints the new ID. |
| `feature set <id> <field> <value>` | Only for `title`, `summary`, `priority`, `mvp`, `value`, `risk`, `repos`. Stage and gates are refused here. |
| `feature link <id> <spec_dir>` | Validates that the directory exists under `specs/`. |
| `feature activate <id>` | Writes `.specify/feature.json` (at the speckit location for the feature's repos: root, or the repo-local `.specify`). Requires a `spec_dir`; for a feature without one, it prints the instruction to run `speckit-specify` first. |
| `dep add <id> <dep_id> --type t [--note s]` / `dep rm` | Rejects cycles for `requires` and `technical`. |
| `blocker add <id> "<text>" --kind k` / `blocker resolve <id> <B-n> [--note s]` | |
| `stage set <id> <stage> [--reason s]` | Validates the entry criteria from A6 against real files and evidence. Moving backward requires `--reason` and clears downstream gates. Prints exactly which criterion failed. |
| `gate approve <id> <gate> [--note s]` | Records the approval. **It does not check whether the user really approved; the hook does that** by forcing an `ask` prompt for this command. Refuses if the feature's stage isn't the one that gate exits. |
| `gate required <id>` | Lists the gates required by autonomy and feature traits (repos > 1, migration detected by `data-model.md` or a plan mentioning a migration, or a `migrations/` path in `tasks.md`). |
| `check tasks <id>` | Every unchecked or checked task line (`- [ ]`/`- [X]`) has a `[repo:<registered name>]` tag, and reports counts per repo. |
| `branches create <id>` | For each affected git repo: if there are uncommitted changes, refuse for that repo. Otherwise create the branch (`git switch -c`), or switch to it if it exists. Records the result in `branches`. Never pushes. |
| `verify run <id> --repo r [--kind test\|build\|lint]` | Runs the confirmed command from config with that repo as cwd (shell: `cmd.exe /c` on win32, `sh -c` elsewhere; 30-minute timeout). Records the HEAD SHA and appends evidence. Refuses when the command isn't confirmed (it prints the `repo set … --confirm` hint). |
| `evidence add <id> --kind k [--repo r] --result pass\|fail --note s` | For review, manual, analyze, release and similar kinds. |
| `status [<id>]` | A table of features (id, title, stage, blocked, next action), or the detail for one feature including pending gates and evidence freshness. |
| `next` | Ranks ready features. Ready means: stage < `accepted`; all `requires`/`technical` deps satisfied; no open blockers. In-flight features (stage 2–6) rank first, then `mvp`, then priority, then the count of features this one unblocks, then lower risk. The output includes a `reasons[]` array per candidate and a list of the not-ready features with the dep or blocker that holds each one back. |
| `brief` | A compact summary of ≤ 25 lines for SessionStart: workspace, Spec Kit status, in-flight features with stage and next action, staleness warnings (HEAD ≠ last evidence SHA, recorded branch missing or not checked out, unconfirmed repo commands, `tasks.md` mtime newer than its stage entry). If there is no `.sdlc/`, it prints a single line suggesting `sdlc init`. |
| `validate` | Schema plus referential integrity (dep IDs, repo names, spec dirs, evidence references). Used by the Stop hook. |

Put the stage table, gate→stage mapping and autonomy→gate mapping in `lib/lifecycle.mjs` as data, and only there.

## B4. Hooks (`hooks/hooks.json`, commands `node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<x>.mjs"`)

Every hook is a **no-op** (exit 0, no output) when the cwd has no `.sdlc/` above it, so the plugin is harmless in non-framework projects.

- **SessionStart** → `session-start.mjs`: runs the `brief` logic in-process and returns it as `additionalContext`.
- **PreToolUse** (matcher `Bash|Edit|Write|MultiEdit|NotebookEdit`) → `pre-tool-use.mjs`. It reads the JSON from stdin and decides:
  - Edit/Write targeting `.sdlc/backlog.json` or `.sdlc/config.json` → `deny`, with the reason "use the sdlc CLI".
  - Edit/Write targeting an existing instruction file (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.cursorrules`) anywhere under the root → `ask`. The exception is the root `CLAUDE.md` when the change only touches the content between the sdlc markers; in that case `allow` falls through to the normal flow (emit nothing).
  - Edit/Write in a registered repo's path (outside `specs/`, `.sdlc/`, `.specify/`, `.claude/`) when no feature listing that repo is at stage `implementing` → apply `guards.source_edit_outside_implementing`.
  - Bash whose command matches `sdlc.mjs gate approve` (or the `sdlc gate approve` bin) → `ask`, with the reason "Human approval of gate <gate> for <id>".
  - Bash matching `sdlc.mjs (init|branches create)` or `specify init` → `ask`.
  - Bash matching any destructive pattern → `ask`, with the matched pattern in the reason.
  - Otherwise there is no output, and the normal permission flow applies.
- **Stop** → `stop.mjs`: runs `validate`. On errors it prints a warning to stderr (exit 0, never blocking). Phase 1 does not block on Stop.

## B5. Default destructive Bash patterns (case-insensitive regex)

`git\s+push`, `git\s+reset\s+--hard`, `git\s+clean\s+-[a-z]*f`, `git\s+branch\s+-D`, `git\s+checkout\s+--\s`, `git\s+rebase`, `git\s+filter-(branch|repo)`, `rm\s+-[a-z]*r[a-z]*f|rm\s+-[a-z]*f[a-z]*r`, `Remove-Item.*-Recurse`, `\bdrop\s+(table|database|schema)\b`, `\btruncate\s+table\b`, `migrate\s+(deploy|up|reset)|db:migrate|alembic\s+upgrade|prisma\s+migrate\s+(deploy|reset)`, `terraform\s+(apply|destroy)`, `kubectl\s+(apply|delete|rollout)`, `helm\s+(install|upgrade|uninstall)`, `docker\s+push`, `npm\s+publish|cargo\s+publish|twine\s+upload|dotnet\s+nuget\s+push`, `gh\s+(release|pr\s+merge)`.

## B6. Skills: content requirements

All skills: YAML frontmatter `name` + `description`. The description must contain the trigger phrases. Keep each SKILL.md ≤ ~250 lines and link to `_shared/*.md` instead of repeating it. Every role skill uses the A5 contract headings. Every skill calls the CLI as `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`. (Confirm in B0 that `${CLAUDE_PLUGIN_ROOT}` expands inside skill bodies. If it doesn't, have `sdlc init` write `.sdlc/bin.json` with the absolute CLI path and make the skills read it.)

- **`sdlc` (orchestrator).** Description triggers: "next feature", "work on", "status", "resume", "what's next", "continue feature", "new project", "set up framework". Algorithm:
  1. No `.sdlc/` → offer `init` (existing vs new path), then hand off to `sdlc-discover`.
  2. Read the injected brief, or run `brief`. Resolve staleness first.
  3. If a feature is in flight, compute its next action from stage + required gates + evidence. Otherwise run `next`, present the top candidate with its reasons and the alternatives, and confirm the choice with the user.
  4. Route to the role skill for that stage (table in `_shared/lifecycle.md`). Activate only that role.
  5. After each role returns, run `status <id>` and continue, or stop at a gate. At a gate, summarize what is being approved with links to the artifacts, then run `gate approve` (the hook prompts the human). If the user declines, record that with no state change and ask what should change.
  6. Never advance a stage on a claim. Always use `stage set`, which checks the files.

  It also answers the A9-style questions (what exists, what's blocked, why that feature is next) from `status`/`next` output only.
- **`sdlc-discover`.**
  - Existing project: run `scan` → spawn `repo-profiler` per repo in parallel → write `workspace-map.md` (sections: Repos, Integrations [API/auth/data/deploy edges], Instruction sources & precedence, Conflicts, Unknowns) → propose a command for each repo, and run each proposed command **once** after asking. Confirm the commands with `repo set --confirm` only if they ran successfully. Then build a **feature inventory**: existing features from specs, docs and code, each with an evidence tag and a proposed stage (`done` only with `[code]`+`[run]` evidence, otherwise `defined`/`proposed`). Present the inventory for user review **before** any `feature add`. Finally, propose a constitution draft if only the placeholder exists.
  - New project: hand off to `sdlc-product` (vision → backlog), then return for an architecture-level stack decision with `sdlc-architect`. Only then is the Spec Kit init offered.
  - Refresh mode re-runs scan and diffs the result against the map.
- **`sdlc-product`.** Covers `product.md` authoring (new project), backlog shaping (features, priority, MVP, typed deps; explain each dependency type when asking), the define → specified stages (through `speckit-specify`/`speckit-clarify`, after `feature activate`), and acceptance: it walks the user through the acceptance criteria against `verification.md`.
- **`sdlc-architect`.** Covers `speckit-plan`, the Repository Impact section, ADRs for cross-cutting choices, `speckit-tasks` plus the `[repo:]` tagging pass, `speckit-analyze`, and `check tasks`. It respects repo conventions from `workspace-map.md` and never proposes a rewrite of existing architecture unless the feature requires it, in which case that becomes an ADR plus a decision blocker.
- **`sdlc-build`.** Requires stage `implementing`. Steps: `branches create`, then for each repo in deploy order: read that repo's instruction files, implement its tagged tasks (through scoped `speckit-implement` or directly), mark tasks `[X]`, commit locally, run `verify run --kind test` (and build/lint if confirmed). On a requirement conflict, use `blocker add` and stop. Update repo docs when the behavior that users or integrators see changes. When everything is done: `stage set verifying`.
- **`sdlc-verify`.** Spawns `independent-reviewer` with the diff range per repo (`git diff <base>...HEAD`, base = the default branch), the spec, the plan, the contracts and the repo instructions. The review checklist covers correctness against the acceptance criteria, contract conformance, tests covering the acceptance criteria, security (authn/z, input validation, secrets, injection, PII in logs), and migrations' reversibility. Findings are recorded with `evidence add --kind review` (and `security`). Blocking findings become `blocker add`. It re-runs `verify run` for every repo at HEAD, then attempts `stage set accepted` and hands off to product for the acceptance gate.

## B7. Agents

- `repo-profiler.md`: read-only tools (Read, Grep, Glob, plus Bash limited to non-mutating commands by instruction). Input: repo path + its scan.json slice. Output: a **fixed markdown template** (Purpose, Stack, Entry points, Build/Test/Lint candidates with the file where each was found, Conventions from instruction files, External interfaces exposed and consumed, Data stores/migrations, CI/CD, Spec Kit presence, Features observed with evidence tags, Unknowns). Limit: about 40 files read, and it prefers instruction files and manifests.
- `independent-reviewer.md`: read-only + Bash (tests, git diff/log). It must not edit files. Output: findings list with severity (blocker/major/minor), file:line, the violated requirement or criterion, and a recommendation.

## B8. Templates

- `claude-md-block.md`: ≤ 40 lines. Covers: the framework is active; entry point is the `sdlc` skill; the precedence policy (A3); the evidence tags; "never edit `.sdlc/*.json` directly"; "gates are human-only"; "the lifecycle state comes from the `sdlc` CLI, not from memory".
- `product.md`, `workspace-map.md`, `verification.md`: section skeletons with one-line guidance comments.
- `config.json`/`backlog.json`: empty, valid instances of B2.

## B9. Tests (`npm test` → `node --test tests/`)

`make-fixture.mjs` builds a temp dir containing: `backend/` (git repo, `package.json` with `"test": "node -e \"process.exit(0)\""`, `CLAUDE.md`, `openapi.yaml`, `migrations/001.sql`) and `frontend/` (git repo, `package.json`, `AGENTS.md`), each with one commit, plus a root `CLAUDE.md` with user content.

Required test cases:
1. `init` creates `.sdlc/`, preserves the root `CLAUDE.md` user content, and is idempotent (a second run changes nothing and reports the skipped files).
2. `scan` finds both repos, the manifests, `openapi.yaml`, `migrations/`, and both instruction files.
3. `feature add`, `dep add` (a `requires` cycle is rejected), `next` (with a dependency not ready → its dependent isn't ready, and the reason is shown).
4. `stage set` refusals: `specified` without spec.md; spec.md containing `[NEEDS CLARIFICATION]`; `designed` without the spec gate; `planned` with an untagged task; `accepted` without passing evidence at HEAD; `accepted` after a new commit (stale SHA).
5. `verify run` with a confirmed passing command and with a failing command. Evidence is appended to both `verification.md` and the jsonl.
6. `branches create` creates branches in both repos and refuses a dirty repo.
7. A backward `stage set` clears the downstream gates and logs history.
8. `pre-tool-use.mjs` with stdin samples: deny an Edit to backlog.json; ask for `gate approve`; ask for `git push origin main`; ask for an Edit in backend source when nothing is implementing; no output for an Edit in `specs/`; no output when no `.sdlc/` exists.
9. `session-start.mjs` produces an additionalContext JSON with ≤ 25 lines; `brief` reports a stale SHA.
10. `validate` catches an unknown repo name in a feature.

All tests must pass on Windows. Run them with the PowerShell tool and also with Git Bash.

## B10. Manual acceptance (do it, then report the results)

1. Install the plugin into Claude Code through the local marketplace and confirm that the 6 skills and 2 agents are listed.
2. In a fixture copy, run Claude Code: "set up the framework here". It should use the orchestrator → init (with an approval prompt) → discover → a workspace-map with evidence tags. Spec Kit init gets offered, but you should not install it into the user's real projects.
3. Run `specify init --here --integration claude --non-interactive --force` in the fixture. Add F-001 and drive it to `planned`, confirming the gate prompts appear and that direct backlog edits are denied.
4. Report what worked, what didn't and any deviations from this plan in the final summary. Do not claim success for steps that weren't run.

## B11. Out of scope for Phase 1 (do not build)

UX and release skills; the Spec Kit extension or preset; template overrides; `upgrade`/migration tooling; issue-tracker sync (`speckit-taskstoissues`); CI integration; dashboards or HTML views; a blocking Stop hook; pushing branches or opening PRs.

---

# Part C — Later phases (for reference only)

- **Phase 2: Spec Kit native integration plus the missing roles.** A Spec Kit **extension** `sdlc` (`specify extension add ./speckit-ext`) registers `after_specify|after_plan|after_tasks|after_implement` hooks that call `sdlc` sync commands. A **preset** adds Repository Impact to `plan-template` and `[repo:]` to `tasks-template`, replacing the instruction-based approach. Add the `sdlc-ux` skill (UX artifacts in `specs/NNN/ux.md`; Figma/Canva optional) and the `sdlc-release` skill (deploy runbooks from discovered CI/CD, the release gate, the post-deploy check). PR creation per repo goes through `gh`, with approval.
- **Phase 3: Lifecycle maturity.** `sdlc upgrade` (schema migrations, re-sync of the CLAUDE.md block, template diffs offered and never forced); the `speckit-taskstoissues` bridge; `speckit-converge`-driven reconciliation when code drifts from the spec; an optional blocking Stop hook for "claimed done without evidence"; a status artifact/dashboard.
- **Phase 4: Scale.** Very large workspaces (an indexed project map with per-directory summaries), parallel per-repo build agents in worktrees, and organization-level presets.
