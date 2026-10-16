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
| released | gate `acceptance`; passing release evidence | specflow:flow (manual for now) |
| done | gate `release` (if required); post-release evidence or `--reason` waiver | specflow:flow |

Gates: `spec` (approved at stage specified), `design` (designed), `implement` (planned), `acceptance` (accepted), `release` (released).
Which are required depends on `config.autonomy` (guided: all; standard: spec, implement, acceptance, release + design when repos > 1 or a migration;
autonomous: acceptance, release). `specflow gate required <id>` is authoritative.

UI features: a repo or feature is "UI" when `ui: true` (derived from the scan, overridable with `repo set --ui` / `feature set <id> ui`). In `standard` autonomy the `design` gate is then also required (`config.ux.design_gate_for_ui`, default true), and acceptance needs `ux-review` evidence (`config.ux.require_ux_review`, default true).

Moving backward: `stage set <id> <earlier> --reason "..."` (clears gates from that stage on, records history).

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
