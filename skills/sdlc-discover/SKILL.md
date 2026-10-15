---
name: sdlc-discover
description: Builds an evidence-based baseline of an existing product workspace (repos, stack, commands, integrations, instructions, conflicts, existing features) and refreshes it. Use for "set up the framework on this project", "discover the workspace", "refresh the map", or first-time onboarding of an existing project.
---

# sdlc-discover (Technical Writer / Architect-inventory role)

CLI: `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"` (`sdlc`). Shared rules: `${CLAUDE_PLUGIN_ROOT}/skills/_shared/{role-contract,evidence-tags,lifecycle}.md`.

## Purpose
Establish a baseline of what exists, without proposing a rewrite or imposing a new process. Distinguish verified facts from documentation claims, plans, unknowns and conflicts.

## Use when
Initial onboarding of an existing project; after repos are added/removed; when the map is stale. (New projects start with `sdlc-product`.)

## Inputs (read first)
`sdlc scan` output (`.sdlc/cache/scan.json`), root and repo instruction files (first), READMEs, manifests, contracts, schemas, CI config. Do not read every file; follow the priority order.

## Outputs (artifacts)
`.sdlc/workspace-map.md` (Repos, Integrations, Instruction sources & precedence, Feature inventory, Conflicts, Unknowns), repo entries in config via `sdlc repo set`, an approved feature inventory entered into the backlog, optionally a constitution draft.

## Stages
Bootstrap / refresh (before any feature stage).

## May do autonomously
`sdlc scan`, `sdlc doctor`; spawning `repo-profiler` subagents (read-only); writing `.sdlc/workspace-map.md`; `sdlc repo set` for purpose/stack/proposed commands (unconfirmed).

## Requires approval
Running each repo's build/test/lint command once to confirm it (ask first; it may be slow or have side effects); `repo set --confirm`; adding inventory entries to the backlog; drafting or changing the Spec Kit constitution; any edit to an existing instruction file; `specify init`.

## Must not
Replace an established process because its templates differ. Treat docs as proof of behavior. Overwrite existing documentation/instructions. Mark a feature `done` without `[code]` and `[run]` evidence. Invent commands or assume tools are installed.

## Handoff
Return to `sdlc` with the baseline summary and the recommended next feature. New-project path: hand to `sdlc-product`.

## Procedure (existing project)
1. `sdlc scan` then `sdlc doctor`. Note Spec Kit state (root vs repo-local, version, skills, constitution).
2. Spawn one `repo-profiler` subagent per repo **in parallel** (Agent tool, subagent_type `sdlc:repo-profiler` (plugin-namespaced)), passing the repo path, its scan.json slice and the 40-file budget. Merge their fixed-format reports.
3. Write `.sdlc/workspace-map.md`. Tag every claim (`[code] [run] [doc] [planned] [unknown] [conflict]`). Under Integrations, list each edge (API, shared model, auth, messaging, deployment) with evidence. Under Instruction sources, list every instruction file by level and apply the precedence policy; record conflicts rather than silently choosing.
4. For each repo: `sdlc repo set <name> --purpose "..." --stack ...`; propose test/build/lint commands from the profile (with the file each came from). With the user's OK, run each once; only if it works, `sdlc repo set <name> --confirm`. If no test tooling exists, say so and propose options; do not invent.
   **UI and design system:** add a subsection to the map for every repo with `ui: true` (from the scan; correct a wrong guess with `sdlc repo set <name> --ui true|false`): framework, component library, token/theme files, Storybook, visual test tools, how consistent the existing UI is (all with evidence tags). If UI repos exist and `.sdlc/design-system.md` is still the template, fill it in `source: existing-code` mode with pointers to the code (cite files, do not copy token values). Do not invent a new direction; that is `sdlc-ux` direction mode, on request.
5. **Feature inventory:** list existing features from specs, docs and code with evidence tags and a proposed stage (`done` only with `[code]` + `[run]`; otherwise `proposed`/`defined`). Present it for review BEFORE any `sdlc feature add`. For existing `specs/*` dirs, propose linking (`feature link`).
6. If only a placeholder constitution exists, offer a draft derived from discovered conventions (needs approval, then `speckit-constitution`).
7. Report gaps/conflicts and recommend the next feature via `sdlc next`.

**Refresh mode:** re-run scan, diff against the map, update only what changed, report removals (never auto-delete repos).

## Done when
Map written with evidence tags; repos registered; commands confirmed or explicitly unknown; inventory reviewed; conflicts listed; `sdlc validate` passes.

## Escalate when
Same-level instruction conflicts; a repo's purpose cannot be established; build/test needs credentials or services you lack; the repo has its own `.specify/` (record `speckit: repo-local` and ask how to treat cross-repo features).
