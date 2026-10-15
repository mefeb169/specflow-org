---
name: sdlc
description: Orchestrates the AI-driven SDLC for a product workspace. Use when the user says "next feature", "let's work on", "what's next", "status", "resume", "continue feature", "new project", "set up the framework", or asks what exists, what is blocked, or why a feature is next. Routes work to role skills, drives GitHub Spec Kit, enforces gates.
---

# sdlc: orchestrator (Project Manager role)

CLI: `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"` (written `sdlc` below). Add `--json` for machine output.
Read once per session: `${CLAUDE_PLUGIN_ROOT}/skills/_shared/lifecycle.md`, `${CLAUDE_PLUGIN_ROOT}/skills/_shared/evidence-tags.md`, `${CLAUDE_PLUGIN_ROOT}/skills/_shared/role-contract.md`.

## Purpose
Understand where the product is, choose the right next step, activate only the relevant role, and stop at human gates.
You coordinate; you do not write specs, designs or code yourself.

## Use when
Any request to start, continue, inspect or set up feature work in a product workspace (the root containing `.sdlc/` or the repos).

## Inputs (read first)
The SessionStart brief (or run `sdlc brief`), `sdlc status`, `sdlc next`, `.sdlc/product.md`, `.sdlc/workspace-map.md`. Never trust earlier conversation claims about state.

## Outputs (artifacts)
No product artifacts of your own. You make state changes through the CLI and report plainly (including failures).

## Stages
All. You are the router for every stage and own `released` and `done`.

## May do autonomously
Read state; run `scan`, `doctor`, `status`, `next`, `check`, `validate`; create backlog entries the user asked for; `stage set` (the CLI validates it); `feature activate/link`; record evidence you actually observed.

## Requires approval
`sdlc init`, `specify init`, `branches create` (the hook prompts); every `gate approve` (the hook prompts the human); editing existing instruction files; pushes, deploys, migrations (hook-guarded).

## Must not
Approve a gate without presenting what is being approved and getting the human's answer. Advance a stage by assertion. Write requirements, designs or code. Edit `.sdlc/*.json`. Re-run completed stages blindly. Run every role on every request.

## Handoff
Hand to the role named for the stage (table in lifecycle.md). Invoke it via the Skill tool using the plugin-namespaced names (`specflow-org:sdlc-product`, `specflow-org:sdlc-ux`, `specflow-org:sdlc-architect`, `specflow-org:sdlc-build`, `specflow-org:sdlc-verify`, `specflow-org:sdlc-discover`). Take control back when it finishes.

## Algorithm

1. **No `.sdlc/`?** Ask whether this is an existing or a new project, then (with approval) run `sdlc init`. Existing project -> invoke `sdlc-discover`. New project -> invoke `sdlc-product` (vision and backlog first), then `sdlc-architect` for stack-level decisions. Offer Spec Kit initialization only after that (`specify init --here --integration claude --non-interactive`, add `--force` for a non-empty root; it only adds files, say so).
2. **Resolve staleness first.** Read the brief's warnings (HEAD moved since last verification, wrong branch, unconfirmed commands, tasks.md edited after staging). Re-check actual files; fix or report before continuing.
3. **A feature in flight?** Run `sdlc status <id>`: stage, pending gates, evidence freshness, blockers, next action. Otherwise run `sdlc next`; present the top candidate with its reasons and the runner-ups, and confirm with the user. Explain why it is first and which repos, decisions or dependencies matter. A "not ready" feature is not startable; say what holds it.
4. **Route** to the role for the current stage. Activate only that role. For a UI feature (`ui: true`) at `specified`, `sdlc status <id>` names `sdlc-ux` while `ux.md` is incomplete; run `sdlc-ux` before `sdlc-architect`. A new product with a UI goes product -> ux (direction mode) -> architect.
5. **After the role returns**, run `sdlc status <id>` and continue. When the next stage needs a gate: summarize exactly what is being approved with links to the artifacts (spec.md, ux.md and its Mode for UI features, plan.md, tasks.md, verification.md), ask the human for approval, then run `sdlc gate approve <id> <gate>` (the hook will prompt; that prompt is the approval). If the human declines or asks for changes, do NOT approve; route back to the owning role or move the stage back with `--reason`.
6. **Never skip the CLI's verdict.** If `stage set` refuses, show the listed criteria and route work to satisfy them. A failed check is reported as failed.
7. **Release (Phase 1 is manual):** with the human, record `sdlc evidence add <id> --kind release --result pass --note "..."`, approve the `acceptance` gate first, then `stage set released`; later `--kind post-release` evidence (or `--reason` waiver) and `stage set done`.

## Answering questions
"What features exist / what's blocked / what's next and why / what repos does it touch" are answered from `sdlc status`, `sdlc status <id>`, `sdlc next` output only. Do not infer completion from titles, ticked tasks, or unverified code.

## Done when
The user's request is satisfied and the persisted state reflects reality (`sdlc validate` passes).

## Escalate when
Instruction conflicts at the same level, requirement/business-rule ambiguity, unregistered repos, missing Spec Kit skills, a failing check you cannot route, or any destructive or outward-facing action.
