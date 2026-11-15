# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versions follow the plugin version in `plugins/specflow/.claude-plugin/plugin.json`.

## [0.8.0] - 2026-11-15
Token efficiency, from measured use: about 76% of input tokens were main-session context re-read on every turn (median 172k tokens per turn, two sessions of 1,000+ turns). A 0.7.0 workspace keeps working before `specflow upgrade --apply`.
### Added
- Session budget: the Stop hook reads the last main-session turn's context size from the transcript; past `session.context_budget` (default 150,000 tokens) it keeps the PM going for one turn to run `specflow checkpoint` and tell the user to start a fresh session. It repeats every `session.repeat_every` (100,000) tokens, never twice in a row, and resets after a compaction. `0` turns it off.
- Lean PM guard: while an item is implementing, a main-session Edit/Write in that repo is denied with the `specflow dispatch <id> --repo <name>` route (`guards.pm_source_edits`: deny, ask or off). Subagents, and workspaces with builder and lead both disabled, are unaffected.
- Model policy by task complexity (`team.model_policy: auto`, default): `dispatch` rates the item low, medium or high (repos, migrations, task count, risk, rework rounds, lane) and picks the lowest tier that fits each role, capped at the role's configured model. The packet carries `complexity`, `model_ceiling` and `model_reason`. `feature set <id> complexity low|medium|high|auto` overrides; `team set --model-policy fixed` restores configured models.
- `dispatch <id> --role reviewer --repo <name>`: the verifier gets the independent reviewer's model from it. Before, the reviewer always ran on its agent default (sonnet) and `team.roles.reviewer.model` was unused.
- Upgrade migration `0.8.0`; tests `tests/phase4.test.mjs`.
### Fixed
- File edits no longer prompt in Auto Mode (and `acceptEdits`, `bypassPermissions`, `dontAsk`), where the user already approved edits: the source-edit-outside-implementing, instruction-file and PM-edit `ask` checks stay silent there. Gates, delivery, release, destructive commands and every `deny` are unchanged. Measured on real use: 59 such prompts in Auto Mode.
- The shell state-file guard fired on read-only commands (all 14 real cases, e.g. `grep ... .specflow/config.json; ... 2>&1`) because any `>` on the line counted as a write. It now flags only commands that write a state file (redirect, tee, `sed -i`, cp/mv target, rm, PowerShell write cmdlets, inline-script writes) and denies them with the CLI route, the same as Edit/Write, instead of asking.
### Changed
- The flow skill asks the PM to keep its session lean (no code edits, test runs or screenshots in the main session) and never to raise a dispatched model; the verify skill asks for quiet test output.

## [0.7.0] - 2026-10-20
Phase 3 of the team-model roadmap: delivery and release pipelines. A 0.6.0 workspace keeps working before `specflow upgrade --apply`.
### Added
- `deliver <id> [--dry-run]`: from a verified state only, pushes the item's branch (never `--force`) and opens or updates ONE pull request per repo with `gh`, in deploy order; refuses a merged or closed PR for the branch; records `delivery` on the item and `delivery` evidence. `deliver status <id>` refreshes PR states and records `merge` evidence once all are merged; `deliver merge <id>` works only in `push-pr-merge` mode after the acceptance gate.
- Release configuration `release.steps`, `release.post_release`, `release.require_merged` with `release step add|rm|list` and `release set`.
- `release plan <id>` (writes `release.md`, keeps the rollback notes), `release run <id> [--step name --again]` (steps without approval run in order and stop at the first that needs approval; progress, evidence, stops at the first failure), `release verify <id>` (post-release checks).
- Release role `specflow:release-manager` (sonnet, enabled with `release.by_ai`): proposes steps, checks migrations, writes rollback notes; `dispatch` routes an accepted item with an approved acceptance gate to it, or to the PM. Setup asks `release.steps` when release by AI is on.
- Guard: `deliver` (except `status` and `--dry-run`), `release run` and `release verify` ask in the main session, are denied unattended, and are denied for subagents.
- Evidence kinds `delivery` and `merge`; upgrade migration `0.7.0`; `SPECFLOW_GH` selects the `gh` executable (used by tests).
### Changed
- Dispatch prompts for builder, lead and verifier carry a `Testing:` line (unit tests required, test data rules); the verify skill treats logic without tests as a blocking finding when unit tests are required.
- Setup explanations for testing, release and graphify now describe what happens (graphify is still only recorded).
- The flow skill covers delivery and release; the handoff file and `status <id>` show the delivery table; `released` needs every configured release step when release by AI is on.

## [0.6.0] - 2026-10-20
Phase 2 of the team-model roadmap: roles as subagents. A 0.5.0 workspace keeps working before `specflow upgrade --apply`.
### Added
- Role agents `product`, `architect`, `ux`, `lead`, `builder`, `verifier` (next to `independent-reviewer` and `repo-profiler`) with a model policy (opus plans, sonnet builds, haiku profiles) and a shared subagent contract (no user contact, questions via `question add`, checkpoint, report of at most 15 lines).
- `team` commands: roles, models, `--enabled`, `locked` roles, `communication`, `workflow`, leads per area, `team generate` (ux from repos, lead suggestion with 4+ repos).
- `dispatch <id>`: deterministic packet (role, agent, model, repo, repos still to do in deploy order, prompt under 1,200 characters); disabled roles fall back (ux to architect, lead to builder, otherwise the PM).
- Guard: subagent calls (hook input has `agent_id`) are denied `gate approve`, `init`, `upgrade --apply`, `install`, `uninstall`, `specify init`, `git push`, `gh pr create|merge`.
- Setup interview as data: `setup questions|apply|status`; answers are validated, written to config and logged as decisions. New skill `specflow:setup`.
- Config keys `team`, `delivery`, `release`, `testing`, `tools` (the last three are recorded now and used by later phases); upgrade migration `0.6.0`.
- Eval case `pm-dispatches-role`.
### Changed
- The `flow` skill is now the PM loop: dispatch, spawn, read the report, route questions, present gates. The PM does no role work except when a disabled role falls back to it.
- Role skills gain a "When dispatched as a subagent" section; lifecycle.md gains the stage-to-role-to-agent table and the lead rule; the workspace CLAUDE.md block states that only the PM talks to the user and approves gates.
- `status` with more than 30 open items and no milestone lists only items past `proposed` plus a summary line (`status --all` shows everything).

## [0.5.0] - 2026-10-20
Phase 1 of the team-model roadmap: continuity and lean context. Schema v2; a 0.4.0 workspace keeps working before `specflow upgrade --apply`.
### Added
- Work item kinds (`feature`, `slice`, `bug`, `debt`, `chore`), lanes (`full`, `lite`) with configurable lite gates, `milestone`, `tags`, `origin`.
- `slice add`, the size rule at `planned` (`check size`, `size_waiver`) and container features.
- `issue add|list`, `feature drop|restore`, `question add|answer|list`, `intake <file>`.
- `focus`, `interrupt` (park, P0 urgent item, conflict report), `resume`, `milestone`; `next` and `status` filter by milestone and hide done/dropped items (`--all`).
- `checkpoint` and generated handoff files (`specs/<dir>/handoff.md`, at most about 60 lines), regenerated on stage changes, gate approvals and rework; new `PreCompact` hook and a handoff refresh in the `Stop` hook.
- `rework start|close`: review fixes stay on the same branch, no new PR.
- `.specflow/memory.json` with `pref`, `decision` and `lesson` commands (guarded like the other state files); answered questions are logged as decisions.
- Upgrade migration `0.5.0`; `upgrade --apply` now saves the backlog as well as the config.
- Eval case `resume-from-handoff`.
### Changed
- The session brief shows Focus, Parked, Milestone, Preferences and open questions and stays under about 1,500 characters (long lines are truncated, lowest-priority lines dropped).
- Skills: lifecycle and role contract (artifact budgets, issues instead of scope growth, questions, checkpoints), flow (focus, interrupts, no re-asking), architect (slicing), verify (rework rounds), build, product (intake).
- The split of `backlog.json` into per-feature files was dropped from Phase 1 (the cost is in CLI output, which is now smaller).

## [0.4.0] - 2026-10-16
Renamed to **specflow**. Names are now frozen.
### Changed (breaking)
- Plugin `specflow-org` -> `specflow`, marketplace `specflow-marketplace` (install id `specflow@specflow-marketplace`), skills `specflow:flow`, `specflow:product`, `specflow:ux`, ... (the orchestrator is `specflow:flow`: Claude Code does not expose a plugin-root skill, and a skill named like the plugin becomes `specflow:specflow`).
- CLI `sdlc` -> `specflow` (alias `sflow`); workspace state folder `.sdlc/` -> `.specflow/`; env vars `SDLC_*` -> `SPECFLOW_*`; CLAUDE.md markers `sdlc:` -> `specflow:`.
### Added
- Installable command-line package `@mefeb169/specflow` (repo root `package.json`) providing `specflow` and `sflow`; `--version`.
- `specflow install` / `uninstall`: install the plugin for a project from a local copy or `owner/repo`, no marketplace listing needed; `--fix-legacy` removes a stale `specflow-org-marketplace` registration that would otherwise shadow the new marketplace.
- Legacy `.sdlc/` workspaces keep working (and stay guarded) until `specflow upgrade --apply` migrates them (migration 0.4.0: renames the folder, rewrites the CLAUDE.md block and the .gitignore line).
- README rewritten with local-install, per-project, team and troubleshooting instructions.
### Fixed
- Upgrade now saves to the right state folder after renaming it mid-run.

## [0.3.0] - 2026-10-15
First public release candidate.
### Added
- Packaged as plugin `specflow-org` in marketplace `specflow-org-marketplace` (plugin files under `plugins/specflow-org/`), MIT licensed, with `NOTICE` for the bundled Apache-2.0 `frontend-design` skill.
- `sdlc upgrade` (dry run by default, `--apply` is additive and never overwrites user files) and workspace/plugin version tracking.
- Spec Kit install-style (`skills`/`commands`) and version-range detection in `sdlc doctor`.
- Gate approvals, `init`, `branches create`, `upgrade --apply`, `specify init` and destructive commands are denied (not asked) in `bypassPermissions`/`dontAsk` modes.
- Plugin evals (5 cases) and a GitHub Actions workflow (3 OS x Node 18/22).
### Changed
- Hooks use exec form (`node` + args). The CLI is split into command modules. Tests run in about 40 s (`SDLC_SKIP_TOOL_PROBE`).
### Fixed
- Guard no longer treats prose inside `cat <<EOF` heredocs (for example a spec mentioning `sdlc branches create`) as a command.

## [0.2.0]
### Added
- UI/UX support: `sdlc-ux` role, `ui` trait, `ux.md` checks, `ux-review` evidence, design-system template, vendored `frontend-design` skill.
### Fixed
- The scan's design-system evidence now reaches `sdlc-ux` through `sdlc status`.

## [0.1.0]
### Added
- Phase 1: `sdlc` CLI (state, lifecycle, gates, evidence, scan, branches), hooks (session brief, guards, validation), role skills (orchestrator, discover, product, architect, build, verify) and two subagents.
