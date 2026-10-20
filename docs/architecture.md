# Architecture

Design rationale for specflow (originally Part A of the Phase 1 plan). The build deviates in places; where this document and the code disagree, the code and `CHANGELOG.md` win. Notable as-built differences: the plugin is `specflow` (skills are `specflow:sdlc-*`), the CLI lives under `plugins/specflow/scripts/`, a UX role and `ui` trait were added (see the plugin README), and gate approvals are denied in unattended permission modes (`docs/runtime.md`).

## A1. Architecture: four layers, one rule per layer

| Layer | What it is | Used for | Guarantee |
|---|---|---|---|
| **Instructions** | Workspace `CLAUDE.md` block, role `SKILL.md` files | Judgment: interpretation, writing specs and designs, choosing next steps | None; this layer is advisory |
| **Scripts** | `specflow` Node CLI (`scripts/specflow.mjs`) | All state mutation, scanning, transition checks, running test commands, writing evidence | Deterministic and validated |
| **Hooks** | Claude Code hooks shipped in the plugin | Enforcement: block direct state edits, force human approval for gates and destructive commands, inject state at session start | Deterministic and enforced by the harness |
| **Spec Kit** | Installed `speckit-*` skills + `.specify/` | Spec → clarify → plan → tasks → analyze → implement for each feature | Spec Kit is the owner of those artifacts |

**Core rule:** the AI never writes lifecycle state directly. It calls `specflow` subcommands. Hooks block direct edits to state files, and the gate-approval subcommand always raises a human permission prompt. This is what turns "controlled autonomy" into something enforced rather than something hoped for.

**Distribution:** this repo is a **Claude Code plugin** (skills, agents, hooks, scripts) published through a local marketplace. Plugin updates replace only plugin files. Workspace files are created once by `specflow init` and are never overwritten by an update.

## A2. Workspace model

```
ProductRoot/                    # the "workspace root"; Claude Code is opened here
├── CLAUDE.md                   # existing content kept; framework adds ONE marked block
├── .specflow/                      # framework state (workspace-level)
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
1. **Shared artifacts live at the workspace root, not inside a product repo.** Making the root its own small git repo (the "workspace repo") is **recommended but optional**. When it is one, `specflow init` adds every child repo path to the root `.gitignore`, and nothing is ever merged or moved.
2. **Monorepo or single repo:** the root *is* the repo, so `.specflow/` and `specs/` sit next to the code. The registry then lists one repo (`path: "."`), or one entry per package if packages are independently buildable.
3. **A child repo that already has its own `.specify/`:** keep it. Record it in config as `speckit: "repo-local"`. Features that touch only that repo use that repo's Spec Kit, so the orchestrator `cd`s into the repo for the speckit steps. Cross-repo features always use the root Spec Kit.
4. **Repo boundaries:** each repo keeps its own git history, branches and instructions. The framework only creates feature branches and commits, and only in the repos a feature lists as affected. It never pushes without approval.

## A3. Context discovery

There are two passes, and the cheap deterministic pass comes first.

**Pass 1: `specflow scan` (script, no AI).** It walks the root to depth 4, skipping `node_modules`, `.git` internals, `vendor`, `dist`, `build`, `target`, `.venv` and similar, and writes `.specflow/cache/scan.json`:
- git repos (directories containing `.git`) and monorepo workspaces (`package.json#workspaces`, `pnpm-workspace.yaml`, `go.work`, `*.sln`, Cargo `[workspace]`);
- per repo: manifests (`package.json`, `pyproject.toml`, `requirements*.txt`, `go.mod`, `*.csproj`, `*.sln`, `pom.xml`, `build.gradle*`, `Cargo.toml`, `Gemfile`, `composer.json`, `pubspec.yaml`, `Package.swift`), with the script names and test/build scripts found in them;
- instruction files: `CLAUDE.md`, `CLAUDE.local.md`, `.claude/` (skills, commands, settings hooks), `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.github/instructions/*.md`, `.cursorrules`, `.cursor/rules/*`, `.windsurfrules`, `CONTRIBUTING.md`;
- docs: `README*`, `docs/**/*.md` (paths only), ADR folders;
- API contracts: `openapi*.{yml,yaml,json}`, `swagger*`, `*.graphql`, `*.proto`;
- data: `migrations/`, `prisma/schema.prisma`, `*.sql`, ORM model directories (paths only);
- tests: test directories and config files (`jest.config*`, `vitest.config*`, `pytest.ini`, `playwright.config*`, and so on);
- CI/CD and infra: `.github/workflows/*`, `.gitlab-ci.yml`, `azure-pipelines.yml`, `Dockerfile*`, `docker-compose*`, `k8s/`, `helm/`, `*.tf`;
- Spec Kit: `.specify/` (version from `init-options.json`) and `specs/*`.

**Pass 2: AI profiling (skill `specflow:discover`).** It spawns one `repo-profiler` subagent per repo, in parallel, so that each repo's reading stays out of the main context. Each subagent reads, in priority order: instruction files → README → manifests → entry points → contracts and schemas → a sample of tests. It returns a fixed-format profile. The skill then merges the profiles into `workspace-map.md` and calls `specflow repo set` to write confirmed commands into config.

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

- **Detection** (`specflow doctor`, script): runs `specify version` and checks for `.specify/`, `init-options.json` (integration, version, `feature_numbering`) and the `speckit-*` skills in `.claude/skills/`. It records `config.speckit = {version, integration, location, skills:[...]}`. Skills are **discovered**, not assumed. If a step's skill is missing, the orchestrator says so and falls back as described below.
- **Initialization:** `specify init --here --integration claude --non-interactive` runs only when neither the root nor any repo has `.specify/`, and **only after user approval**. If the root is non-empty, `--force` is needed. Explain why first, because it only adds files.
- **Constitution:** if one exists, it is authoritative. For a new project, run `speckit-constitution` with the principles collected by `specflow:product`/`specflow:architect`. For an existing project with only the placeholder constitution, draft it from discovered conventions and get approval.
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

- **Active feature:** before each speckit call, the orchestrator runs `specflow feature activate F-xxx`, which writes `.specify/feature.json` → `{"feature_directory": "specs/NNN-name"}`. This makes Spec Kit operate on the right feature even across sessions.
- **Cross-repo additions (Phase 1, done through instructions rather than template overrides):** after `speckit-plan`, `specflow:architect` appends a `## Repository Impact` section to `plan.md`: a table of repo, change summary, contracts touched, migration (Y/N) and deploy order. After `speckit-tasks`, it makes sure every task line carries a `[repo:<name>]` tag. `specflow check tasks F-xxx` validates the tags. Phase 2 moves this into a Spec Kit preset and extension.
- **Never** invent speckit commands, never edit `.specify/templates/*` in Phase 1, and never use `specify workflow run`, because its gates duplicate ours.

## A5. Roles: 6 skills + 2 subagents (not 17 personas)

| Skill (plugin namespace `sdlc:`) | Covers candidate roles | Stages |
|---|---|---|
| `specflow` (orchestrator) | Project Manager | all: routing, status, next, resume |
| `specflow:discover` | Technical Writer (inventory), part of Architect | bootstrap, refresh |
| `specflow:product` | Product Manager, Product Owner, Business Analyst, Requirements Analyst | define, specify, clarify, accept |
| `specflow:architect` | Solution/Software Architect, Database Engineer (design) | design, plan, tasks |
| `specflow:build` | Backend/Frontend/Mobile/DB developer, Technical Writer (doc updates) | implement |
| `specflow:verify` | QA/Test, Code Reviewer, Security Reviewer | verify |
| *(Phase 2)* `specflow:ux`, `sdlc-release` | UX/UI Designer; DevOps/Release | design; release, post-deploy |

| Subagent (`agents/`) | Why it is a separate agent |
|---|---|
| `repo-profiler` | Isolates context; one per repo, runs in parallel; read-only tools |
| `independent-reviewer` | Gives a fresh context that did not write the code; read-only tools + Bash for tests/diff; reviews the diff against spec + plan + repo instructions |

The stack specialization comes from **data**, not personas: `specflow:build` reads that repo's profile and instructions from `workspace-map.md` and config (test/build/lint commands, conventions).

**Every role SKILL.md uses this exact contract** (as headings):
`Purpose` · `Use when` · `Inputs (read first)` · `Outputs (artifacts)` · `Stages` · `May do autonomously` · `Requires approval` · `Must not` · `Handoff` (which `specflow` call, and the next role) · `Done when` · `Escalate when`.

The key "must not" rules:
- product never chooses technology;
- architect never changes acceptance criteria;
- build never changes `spec.md` or acceptance criteria. When it finds a requirement conflict, it runs `specflow blocker add F-xxx "<text>" --kind requirement`, stops, and hands back to the orchestrator;
- verify never fixes code. It reports, and the orchestrator routes the finding back to build;
- no role approves a gate.

## A6. Lifecycle state model

Stages, in order (`backlog.json › features[].stage`):

| # | Stage | Entry (checked by `specflow stage set`) | Exit artifact | Role | Gate on exit |
|---|---|---|---|---|---|
| 0 | `proposed` | — | backlog entry | product | — |
| 1 | `defined` | title, value, ≥1 acceptance-criteria draft in `notes`, `repos` guessed | backlog entry complete | product | — |
| 2 | `specified` | `spec_dir/spec.md` exists; 0 `[NEEDS CLARIFICATION]` | `spec.md` | product | **spec** |
| 3 | `designed` | gate `spec` approved; `plan.md` exists with a `## Repository Impact` section when repos > 1 | `plan.md` (+ contracts, data-model) | architect | **design** |
| 4 | `planned` | gate `design` approved; `tasks.md` exists; every task has a `[repo:x]` tag naming a registered repo | `tasks.md` (+ analyze report noted in `verification.md`) | architect | **implement** |
| 5 | `implementing` | gate `implement` approved; branch recorded for every affected repo | code commits | build | — |
| 6 | `verifying` | all tasks `[X]` in `tasks.md` | — | verify | — |
| 7 | `accepted` | for every affected repo, a passing `specflow verify run` entry at that repo's **current HEAD**; 0 open blockers; review recorded | `verification.md` | product (+ human) | **acceptance** |
| 8 | `released` | gate `acceptance` approved; release record added | release entry | (Phase 2 release) | **release** |
| 9 | `done` | post-release check recorded or waived with a reason | — | — | — |

Flags beside the stage are `blocked` (derived: there are open blockers) and `revisit: {stage, reason}`. Moving backward is allowed through `specflow stage set F-x <earlier> --reason "..."`. It clears the gates downstream of that stage and is logged in `history`.

Which gates are required comes from `config.autonomy`:
- `guided`: all five gates.
- `standard` (default): `spec`, `implement`, `acceptance`, `release`. The `design` gate applies only when repos > 1 or the plan adds a migration.
- `autonomous`: `acceptance`, `release`.

Destructive-command guards apply at every level.

**Schema v2 (0.5.0).** Work items also carry `kind`, `lane`, `parent`, `milestone`, `tags`, `origin`, `rework`, `size_waiver`, `checkpoint` and `dropped`; the backlog carries `focus`, `parked` and the question list. A second state file, `.specflow/memory.json` (preferences, decisions, lessons), is protected like `backlog.json` and `config.json`. Items in the `lite` lane need only the gates in `config.lanes.lite.gates` and no plan.md or ux.md; a feature with slices is a container whose slices carry the work. Entry to `planned` enforces the size rule from `config.slicing`. `load()` fills missing fields in memory, so 0.4.0 files are never rewritten on read; `upgrade --apply` writes them.

**Handoff.** `specflow checkpoint` renders `specs/<dir>/handoff.md` (or `.specflow/handoff/<id>.md`) from state, at most about 60 lines: next step, note, progress, repo branch/HEAD/verification freshness, open blockers and questions, recent decisions, artifact links. Stage changes, gate approvals, rework and interrupts regenerate it; the `PreCompact` hook and the `Stop` hook refresh the focus item's file. The brief points at it, so a new session resumes from the handoff instead of re-reading artifacts.

**Resume:** the SessionStart hook runs `specflow brief`, which reports in-flight features, their stage, what is pending and any **staleness**: for example, a repo HEAD that differs from the SHA in the last verification, a missing branch, or `tasks.md` changed since the stage was set. The orchestrator re-checks files before trusting the recorded state. It never trusts claims from an earlier conversation.

## A7. Artifact and source-of-truth policy

| Information | Lives in (only here) | Written by |
|---|---|---|
| Feature identity, priority, value, MVP flag, deps, affected repos, stage, gates, blockers, branches, history | `.specflow/backlog.json` | `specflow` CLI only (hook-enforced) |
| Requirements, user stories, acceptance criteria | `specs/NNN/spec.md` | `speckit-specify`/`clarify` |
| Technical design, contracts, repo impact | `specs/NNN/plan.md`, `contracts/`, `data-model.md` | `speckit-plan` + architect |
| Tasks (repo-tagged), task completion | `specs/NNN/tasks.md` | `speckit-tasks` / implement |
| Verification evidence (commands, exit codes, SHAs, review findings) | `specs/NNN/verification.md` (append-only) | `specflow verify run` / `specflow evidence add` |
| Product vision, users, MVP | `.specflow/product.md` | product |
| Repo profiles, integrations, conflicts | `.specflow/workspace-map.md` | discover |
| Repo commands, autonomy, guards | `.specflow/config.json` | `specflow` CLI |
| Cross-cutting decisions | `.specflow/decisions/ADR-*.md` | architect |
| Principles | `.specify/memory/constitution.md` | `speckit-constitution` |
| Repo conventions | each repo's own instruction files | (untouched) |
| Status views, "what's next" | **generated** by `specflow status` / `specflow next` (no stored files) | — |

Feature IDs: backlog IDs are `F-001`… and stay stable from the start. `spec_dir` gets linked once the feature is specified.

**Cross-repo implementation:** `specflow branches create F-x` creates the branch `<spec_dir basename>` (for example `004-password-reset`) in every affected repo. This needs approval through a hook prompt. `specflow:build` then works one repo at a time in deploy order (from Repository Impact), using `speckit-implement` with the argument `"Only tasks tagged [repo:<name>]"`, or implementing tasks directly when that is clearer. It commits in that repo and runs `specflow verify run F-x --repo <name>` before moving to the next repo.

## A8. Automation and approval model

| Activity | Default |
|---|---|
| Scanning, reading, profiling, drafting docs/specs/plans, `specflow status/next/brief/check` | autonomous |
| Creating backlog entries, setting stages (the CLI validates them) | autonomous |
| Writing to `.specflow/*.md`, `specs/**` | autonomous |
| `specflow gate approve` | **always a human prompt** (PreToolUse → `ask`) |
| Direct Edit/Write of `.specflow/backlog.json` or `.specflow/config.json` | **denied** (use the CLI) |
| Editing existing non-framework instruction files (`CLAUDE.md`, `AGENTS.md`, …) | **ask** |
| `specify init`, `specflow init`, `specflow branches create` | **ask** |
| Source edits in a repo when no feature in that repo is `implementing` | `config.guards.source_edit_outside_implementing`: `ask` (default) / `deny` / `off` |
| Destructive or outward-facing Bash (pattern list in config, see B5) | **ask** |
| Failed verification | the stage cannot advance (CLI refuses); reported honestly |

## A9. Representative walkthrough: "Password reset via email" (frontend + backend)

1. The user says "Let's work on the next feature". SessionStart has already injected the brief. `specflow` runs `specflow next`, which returns F-004 "Password reset" as ready: its prerequisite F-001 "User accounts" is `done`, it is MVP, priority P1, and it affects `backend` and `frontend`. The orchestrator explains why and the user agrees.
2. **Define/specify (product):** reads `product.md`, the F-001 spec and the backend auth code (`[code]` evidence). `specflow feature activate F-004` runs, then `speckit-specify` → `specs/004-password-reset/spec.md`. Two ambiguities (token lifetime, rate limit) lead to `speckit-clarify`, which asks the user. `specflow stage set F-004 specified`. The **spec gate** comes next: the user approves through the `specflow gate approve` prompt.
3. **Design (architect):** `speckit-plan` → `plan.md`, `contracts/password-reset.openapi.yaml`, `data-model.md` (a `reset_tokens` table, so a migration). The architect appends Repository Impact: backend (endpoints, migration, mailer; deploys first) and frontend (2 pages; deploys second). A migration plus two repos means the **design gate** is required, and it is approved.
4. **Tasks:** `speckit-tasks` → tasks tagged `[repo:backend]`/`[repo:frontend]`. `speckit-analyze` runs and its findings are fixed. `specflow check tasks` passes, then `stage set planned`. The **implement gate** prompt lists both repos, the branches and the migration, and the user approves.
5. **Build:** `specflow branches create F-004` → `004-password-reset` in both repos. The backend tasks run, then `specflow verify run F-004 --repo backend` runs the configured `npm test`. It exits 1, the evidence records the failure, and the stage stays put. After the fix it passes and the evidence is recorded at the SHA. The same happens for the frontend.
6. **Verify:** `independent-reviewer` reviews both diffs against the spec, contracts and security checklist. One finding (token not single-use) goes to a blocker, then back to build, then a re-run. Once all evidence is green at HEAD, `stage set accepted` is attempted. The CLI checks the SHAs and blockers, and then the **acceptance gate** asks the human, who walks through the acceptance criteria in `verification.md`.
7. **Release (Phase 2):** recorded manually in Phase 1 with `specflow evidence add F-004 --kind release`.

## A10. Trade-offs and risks

- **Skills are advisory.** The AI may skip the orchestrator. Mitigations: hooks guard state, gates and destructive commands, and the CLI refuses invalid transitions. Anything not covered by those is best-effort.
- **Spec Kit drift:** skill names and files may change between versions. `specflow doctor` discovers the skills, config records the version, and the A4 mapping lives in **one** place (the orchestrator skill plus a constant in the CLI).
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

