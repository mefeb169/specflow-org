---
name: discover
description: Builds an evidence-based baseline of an existing product workspace (repos, stack, commands, integrations, instructions, conflicts, existing features) and refreshes it. Use for "set up the framework on this project", "discover the workspace", "refresh the map", or first-time onboarding of an existing project.
---

# specflow:discover (Technical Writer / Architect-inventory role)

CLI: `node "${CLAUDE_PLUGIN_ROOT}/scripts/specflow.mjs"` (`specflow`). Shared rules: `${CLAUDE_PLUGIN_ROOT}/skills/_shared/{role-contract,evidence-tags,lifecycle}.md`.

## Purpose
Establish a baseline of what exists, without proposing a rewrite or imposing a new process. Distinguish verified facts from documentation claims, plans, unknowns and conflicts.

## Use when
Initial onboarding of an existing project; after repos are added/removed; when the map is stale. (New projects start with `specflow:product`.)

## Inputs (read first)
`specflow scan` output (`.specflow/cache/scan.json`), root and repo instruction files (first), READMEs, manifests, contracts, schemas, CI config. Do not read every file; follow the priority order.

## Outputs (artifacts)
`.specflow/workspace-map.md` (Repos, Integrations, Instruction sources & precedence, Feature inventory, Conflicts, Unknowns), repo entries in config via `specflow repo set`, an approved feature inventory entered into the backlog, optionally a constitution draft.

## Stages
Bootstrap / refresh (before any feature stage).

## May do autonomously
`specflow scan`, `specflow doctor`; spawning `repo-profiler` subagents (read-only); writing `.specflow/workspace-map.md`; `specflow repo set` for purpose/stack/proposed commands (unconfirmed).

## Requires approval
Running each repo's build/test/lint command once to confirm it (ask first; it may be slow or have side effects); `repo set --confirm`; adding inventory entries to the backlog; drafting or changing the Spec Kit constitution; any edit to an existing instruction file; `specify init`.

## Must not
Replace an established process because its templates differ. Treat docs as proof of behavior. Overwrite existing documentation/instructions. Mark a feature `done` without `[code]` and `[run]` evidence. Invent commands or assume tools are installed.

## Handoff
Return to `specflow` with the baseline summary and the recommended next feature. New-project path: hand to `specflow:product`.

## Procedure (existing project)
1. `specflow scan` then `specflow doctor`. Note Spec Kit state (root vs repo-local, version, skills, constitution).
2. Spawn one `repo-profiler` subagent per repo **in parallel** (Agent tool, subagent_type `specflow:repo-profiler` (plugin-namespaced)), passing the repo path, its scan.json slice and the 40-file budget. Merge their fixed-format reports.
3. Write `.specflow/workspace-map.md`. Tag every claim (`[code] [run] [doc] [planned] [unknown] [conflict]`). Under Integrations, list each edge (API, shared model, auth, messaging, deployment) with evidence. Under Instruction sources, list every instruction file by level and apply the precedence policy; record conflicts rather than silently choosing.
4. For each repo: `specflow repo set <name> --purpose "..." --stack ...`; propose test/build/lint commands from the profile (with the file each came from). With the user's OK, run each once; only if it works, `specflow repo set <name> --confirm`. If no test tooling exists, say so and propose options; do not invent.
   **UI and design system:** add a subsection to the map for every repo with `ui: true` (from the scan; correct a wrong guess with `specflow repo set <name> --ui true|false`): framework, component library, token/theme files, Storybook, visual test tools, how consistent the existing UI is (all with evidence tags). If UI repos exist and `.specflow/design-system.md` is still the template, fill it in `source: existing-code` mode with pointers to the code (cite files, do not copy token values). Do not invent a new direction; that is `specflow:ux` direction mode, on request.
5. **Feature inventory:** list existing features from specs, docs and code with evidence tags and a proposed stage (`done` only with `[code]` + `[run]`; otherwise `proposed`/`defined`). Present it for review BEFORE any `specflow feature add`. For existing `specs/*` dirs, propose linking (`feature link`).
6. If only a placeholder constitution exists, offer a draft derived from discovered conventions (needs approval, then `speckit-constitution`).
7. Report gaps/conflicts and recommend the next feature via `specflow next`.

**Refresh mode:** re-run scan, diff against the map, update only what changed, report removals (never auto-delete repos).

## Done when
Map written with evidence tags; repos registered; commands confirmed or explicitly unknown; inventory reviewed; conflicts listed; `specflow validate` passes.

## Escalate when
Same-level instruction conflicts; a repo's purpose cannot be established; build/test needs credentials or services you lack; the repo has its own `.specify/` (record `speckit: repo-local` and ask how to treat cross-repo features).
