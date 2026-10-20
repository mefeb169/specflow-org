# Lifecycle, routing and Spec Kit mapping (single reference for all skills)

CLI shorthand used in skills: `specflow` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/specflow.mjs"`.

## Stages (forward one step at a time; `stage set` validates entry criteria against real files)

| Stage | Entry criteria checked by CLI | Owner role |
|---|---|---|
| proposed | none | specflow:product |
| defined | title, value, summary/acceptance draft, repos set | specflow:product |
| specified | spec_dir linked, spec.md exists, no `[NEEDS CLARIFICATION]` | specflow:product |
| designed | gate `spec` (if required); plan.md exists; `## Repository Impact` when repos > 1; **UI features:** `ux.md` with a `Mode:` line and `## Flows`, `## Screens and states`, `## Copy`, `## Accessibility` | specflow:ux (UI) then specflow:architect |
| planned | gate `design` (if required); tasks.md exists and every task tagged `[repo:<registered name>]` | specflow:architect |
| implementing | gate `implement`; branch recorded for every affected git repo | specflow:build |
| verifying | every task `[X]` | specflow:build -> specflow:verify |
| accepted | 0 open blockers; passing test/manual evidence at each repo's current HEAD; passing review evidence; **UI features:** passing `ux-review` evidence | specflow:verify |
| released | gate `acceptance`; passing release evidence; with `release.by_ai`, every configured release step passed | specflow:flow, or the release role |
| done | gate `release` (if required); post-release evidence or `--reason` waiver | specflow:flow |

Gates: `spec` (approved at stage specified), `design` (designed), `implement` (planned), `acceptance` (accepted), `release` (released).
Which are required depends on `config.autonomy` (guided: all; standard: spec, implement, acceptance, release + design when repos > 1 or a migration;
autonomous: acceptance, release). `specflow gate required <id>` is authoritative.

UI features: a repo or feature is "UI" when `ui: true` (derived from the scan, overridable with `repo set --ui` / `feature set <id> ui`). In `standard` autonomy the `design` gate is then also required (`config.ux.design_gate_for_ui`, default true), and acceptance needs `ux-review` evidence (`config.ux.require_ux_review`, default true).

Moving backward: `stage set <id> <earlier> --reason "..."` (clears gates from that stage on, records history). To send a verified item back for fixes use `rework start <id> --reason "..."` instead (see below).

## Kinds, lanes, slices, rework, focus (schema v2)

- **Kinds:** `feature`, `slice` (child of a feature, has `parent`), `bug`, `debt`, `chore`. **Lanes:** `full` (features) and `lite` (slices and issues).
- **Lite lane:** only the gates in `config.lanes.lite.gates` (default `acceptance`, `release`). `specified` still needs a (short) spec.md; `designed` needs no plan.md or ux.md (a plan that exists with repos > 1 still needs Repository Impact); `planned` and later are unchanged, and UI items still need `ux-review` evidence. `feature set <id> lane full|lite` only before `implementing`.
- **Size rule (entry to `planned`, all kinds):** more than `config.slicing.max_tasks` (15) tasks or more than `max_migrations` (1) migration tasks in tasks.md is refused. Split with `slice add <feature> --title ...` (each slice releasable, own acceptance) or record a reason the user approved: `feature set <id> size_waiver "<reason>"`. `check size <id>` prints the counts.
- **Container:** a feature with slices does not need tasks.md and cannot move past `planned`; work happens in its slices. `stage set <feature> done` is allowed from any stage once every non-dropped slice is done.
- **Issues:** `issue add "<text>" --kind bug|debt|chore --from <id>` for anything outside the current item's scope; `issue list`. `feature drop <id> --reason` / `feature restore`; dropped items leave `next` and hold dependents.
- **Rework round:** `rework start <id> --reason` from `verifying` or `accepted` returns the item to `implementing` on the same branches (no new PR); moving to `accepted` closes the round.
- **Focus:** `focus <id>` marks the item being worked on; `interrupt "<text>"` parks it and focuses a P0 urgent item; `resume` pops the parked one. `checkpoint <id> --next "..."` rewrites the handoff file (`specs/<dir>/handoff.md`, at most ~60 lines).
- **Milestones:** `milestone set <name>` limits `next` and `status` to that milestone (plus urgent and bug items); `--all` shows everything.


## Spec Kit mapping (skills are discovered; check `specflow doctor` output / `.claude/skills/speckit-*`)

`config.speckit.style` (set by `specflow doctor`) is `skills` (invoke `speckit-<step>` through the Skill tool), `commands` (older installs: run the `/speckit.<step>` slash commands instead) or `none` (Spec Kit not usable; say so and offer `specify init`). If doctor warns the Spec Kit version is outside the tested range, verify each step's output instead of trusting it. If the workspace was created by an older plugin version, `specflow brief` says so: show the user `specflow upgrade` (dry run) before running `specflow upgrade --apply`.

| Step | Skill | When |
|---|---|---|
| Constitution | `speckit-constitution` | new project, or placeholder constitution only; needs approval |
| Specify | `speckit-specify` | always |
| Clarify | `speckit-clarify` | markers remain or ambiguity found |
| Plan | `speckit-plan` | always |
| Checklist | `speckit-checklist` | security/compliance-heavy features (optional) |
| Tasks | `speckit-tasks` | always |
| Analyze | `speckit-analyze` | multi-repo features (recommended otherwise) |
| Implement | `speckit-implement` | scoped per repo: "Only tasks tagged [repo:<name>]" |
| Converge | `speckit-converge` | implementation diverged from the spec |

Before any speckit step on an existing feature: `specflow feature activate <id>`. After `speckit-specify` creates `specs/NNN-name`,
run `specflow feature link <id> <dir>`. Never invent speckit commands; if a skill is missing, say so and explain the blocker.
Do not use `specify workflow run` (its gates duplicate ours). Do not edit `.specify/templates/*` in Phase 1.
If Spec Kit asks to create git branches via an extension, prefer `specflow branches create` (multi-repo aware).

## Routing: stage -> role

proposed/defined -> specflow:product | specified -> specflow:ux first when the feature is UI (`ui: true`) and `ux.md` is missing or incomplete (`specflow status <id>` shows it), otherwise specflow:architect | designed -> specflow:architect | planned/implementing -> specflow:build |
verifying -> specflow:verify | accepted -> specflow:product (acceptance walkthrough) | released/done -> specflow:flow.
Only the role for the current stage is activated.

## Team: stage -> role -> agent (`specflow dispatch <id>` computes this)

| Stage (work leaving it) | Role | Agent | Default model |
|---|---|---|---|
| proposed, defined | product | `specflow:product` | opus |
| specified, UI item with incomplete ux.md | ux | `specflow:ux` | opus |
| specified (otherwise), designed | architect | `specflow:architect` | opus |
| planned, implementing | lead (areas) or builder (one repo) | `specflow:lead` / `specflow:builder` | opus / sonnet |
| verifying | verifier (spawns the independent reviewer per repo) | `specflow:verifier`, `specflow:independent-reviewer` | sonnet / opus |
| accepted, acceptance gate approved | release (when `release.by_ai`), else the PM | `specflow:release-manager` | sonnet |
| accepted (before the gate) | product (acceptance walkthrough) | `specflow:product` | opus |
| released, done | the PM | none | n/a |

- **Lead rule:** at `planned`/`implementing` the packet names `lead` when the lead role is enabled and every repo of the item belongs to a lead (`team lead add <name> --repos a,b`); the lead plans its area and spawns one builder per repo. Otherwise it names `builder`, one repo per dispatch (`--repo` is required when the item has several; `repos_todo` lists the repos still to do in deploy order).
- **Delivery and release (PM only):** after `accepted`, `specflow deliver <id>` pushes the item's branch and opens or updates ONE PR per repo (mode from `delivery.mode`; `commit` means the user pushes). It needs fresh passing evidence at HEAD, a clean tree on the item's branch, no open rework round or blocker; it never force-pushes and never opens a second PR for a branch. `deliver status` refreshes PR states (all merged is recorded as `merge` evidence); `deliver merge` works only in `push-pr-merge` mode after the acceptance gate. `release plan` writes `release.md`; `release run` (only with `release.by_ai`, PRs merged when `release.require_merged`) runs the configured steps in order and stops at each step that needs approval (`release run <id> --step <name>`); `release verify` runs the post-release checks. `deliver` (except `status` and `--dry-run`), `release run` and `release verify` ask in the main session and are denied for subagents and unattended modes.
- **Disabled roles:** ux is covered by the architect, lead by the builder; any other disabled role (for example verifier) is done by the PM itself (`role: pm`).
- **Models** come from `specflow team show`; the PM passes the packet's `model` to the Agent tool, so a config change takes effect without editing agent files.
- Subagents never talk to the user and never approve gates; `gate approve`, `init`, `upgrade --apply`, `install`, `uninstall`, `specify init`, `git push`, `gh pr create|merge` are denied by the hook when `agent_id` is present.
