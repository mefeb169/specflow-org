# Lifecycle, routing and Spec Kit mapping (single reference for all skills)

CLI shorthand used in skills: `sdlc` = `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`.

## Stages (forward one step at a time; `stage set` validates entry criteria against real files)

| Stage | Entry criteria checked by CLI | Owner role |
|---|---|---|
| proposed | none | sdlc-product |
| defined | title, value, summary/acceptance draft, repos set | sdlc-product |
| specified | spec_dir linked, spec.md exists, no `[NEEDS CLARIFICATION]` | sdlc-product |
| designed | gate `spec` (if required); plan.md exists; `## Repository Impact` when repos > 1; **UI features:** `ux.md` with a `Mode:` line and `## Flows`, `## Screens and states`, `## Copy`, `## Accessibility` | sdlc-ux (UI) then sdlc-architect |
| planned | gate `design` (if required); tasks.md exists and every task tagged `[repo:<registered name>]` | sdlc-architect |
| implementing | gate `implement`; branch recorded for every affected git repo | sdlc-build |
| verifying | every task `[X]` | sdlc-build -> sdlc-verify |
| accepted | 0 open blockers; passing test/manual evidence at each repo's current HEAD; passing review evidence; **UI features:** passing `ux-review` evidence | sdlc-verify |
| released | gate `acceptance`; passing release evidence | sdlc (manual in Phase 1) |
| done | gate `release` (if required); post-release evidence or `--reason` waiver | sdlc |

Gates: `spec` (approved at stage specified), `design` (designed), `implement` (planned), `acceptance` (accepted), `release` (released).
Which are required depends on `config.autonomy` (guided: all; standard: spec, implement, acceptance, release + design when repos > 1 or a migration;
autonomous: acceptance, release). `sdlc gate required <id>` is authoritative.

UI features: a repo or feature is "UI" when `ui: true` (derived from the scan, overridable with `repo set --ui` / `feature set <id> ui`). In `standard` autonomy the `design` gate is then also required (`config.ux.design_gate_for_ui`, default true), and acceptance needs `ux-review` evidence (`config.ux.require_ux_review`, default true).

Moving backward: `stage set <id> <earlier> --reason "..."` (clears gates from that stage on, records history).

## Spec Kit mapping (skills are discovered; check `sdlc doctor` output / `.claude/skills/speckit-*`)

`config.speckit.style` (set by `sdlc doctor`) is `skills` (invoke `speckit-<step>` through the Skill tool), `commands` (older installs: run the `/speckit.<step>` slash commands instead) or `none` (Spec Kit not usable; say so and offer `specify init`). If doctor warns the Spec Kit version is outside the tested range, verify each step's output instead of trusting it. If the workspace was created by an older plugin version, `sdlc brief` says so: show the user `sdlc upgrade` (dry run) before running `sdlc upgrade --apply`.

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

Before any speckit step on an existing feature: `sdlc feature activate <id>`. After `speckit-specify` creates `specs/NNN-name`,
run `sdlc feature link <id> <dir>`. Never invent speckit commands; if a skill is missing, say so and explain the blocker.
Do not use `specify workflow run` (its gates duplicate ours). Do not edit `.specify/templates/*` in Phase 1.
If Spec Kit asks to create git branches via an extension, prefer `sdlc branches create` (multi-repo aware).

## Routing: stage -> role

proposed/defined -> sdlc-product | specified -> sdlc-ux first when the feature is UI (`ui: true`) and `ux.md` is missing or incomplete (`sdlc status <id>` shows it), otherwise sdlc-architect | designed -> sdlc-architect | planned/implementing -> sdlc-build |
verifying -> sdlc-verify | accepted -> sdlc-product (acceptance walkthrough) | released/done -> sdlc.
Only the role for the current stage is activated.
