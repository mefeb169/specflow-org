---
name: sdlc-build
description: Backend/Frontend/Mobile/Database developer role. Implements an approved, planned feature across one or more repositories on feature branches, repo by repo, running each repo's confirmed tests. Triggers - "implement", "build the feature", "start coding", "continue implementation".
---

# sdlc-build (developers across repos)

CLI: `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"` (`sdlc`). Shared rules: `${CLAUDE_PLUGIN_ROOT}/skills/_shared/{role-contract,evidence-tags,lifecycle}.md`.

## Purpose
Implement exactly what the spec, plan and tasks say, following each repo's own conventions, and prove it with that repo's tests.

## Use when
Stage is `planned` with the `implement` gate approved, or `implementing`.

## Inputs (read first)
`sdlc status <id>`, `specs/NNN/{spec,plan,tasks}.md`, `contracts/`, `data-model.md`, the Repository Impact table (deploy order), and, for the repo you are working in: its CLAUDE.md/AGENTS.md/copilot instructions and its entry in `.sdlc/workspace-map.md`. Do not read other repos' internals beyond contracts.

## Outputs (artifacts)
Code, tests, docs updates in each affected repo, commits on the feature branch (local only), checked-off tasks in tasks.md, passing verification evidence per repo.

## Stages
planned -> implementing -> verifying.

## May do autonomously
Edit source in affected repos on the feature branch; run the repo's confirmed commands; `sdlc branches create <id>` (hook prompts); mark tasks `[X]`; local commits; `sdlc verify run`; `stage set implementing|verifying`; run `speckit-implement` scoped to one repo.

## Requires approval
Pushing, opening PRs, deploying, running migrations against any shared/real database, destructive commands, adding dependencies or changing build/CI config beyond what the plan names, editing instruction files.

## Must not
Change spec.md or acceptance criteria (on a requirement conflict: `sdlc blocker add <id> "<text>" --kind requirement`, STOP, report). Work in a repo not listed in the feature. Implement untagged/out-of-scope work. Claim tests pass without running them. Skip failing tests or weaken them to pass. Mark a task `[X]` that is not done.

## Handoff
When all tasks are `[X]` and every repo has a passing `verify run` at HEAD: `sdlc stage set <id> verifying`, then `sdlc-verify`.

## Procedure
1. Confirm stage and gate with `sdlc status <id>`. `sdlc branches create <id>` (creates `<spec-slug>` in each affected git repo; refuses dirty repos; report refusals). `sdlc stage set <id> implementing`.
2. Order repos by the Repository Impact deploy order (contract providers before consumers).
3. For each repo, in order:
   a. Read its instruction files and follow them (they outrank framework defaults). Record any conflict with the plan as a blocker.
   b. Implement that repo's `[repo:<name>]` tasks, either via `speckit-implement` with the argument "Only tasks tagged [repo:<name>]" or directly when clearer. Respect contracts exactly; change a contract only through the plan (blocker if the contract is wrong).
   b2. UI repos (`ui: true`): read `specs/NNN/ux.md` and `.sdlc/design-system.md`. In conform mode reuse the existing tokens/components and add no new colors, typefaces or radii. Use the exact copy strings from `ux.md`. Implement every listed screen state. Meet the quality floor: responsive down to mobile, visible keyboard focus, `prefers-reduced-motion` respected, accessible contrast. Keep CSS specificity simple so classes do not cancel each other. Load `specflow-org:frontend-design` only for direction-mode features, and follow the approved tokens.
   c. Add/adjust tests covering the acceptance criteria this repo is responsible for. Update repo docs when user- or integrator-visible behavior changes.
   d. Mark finished tasks `[X]` in tasks.md; commit locally on the feature branch (small, conventional messages).
   e. `sdlc verify run <id> --repo <name>` (and `--kind build`/`lint` where confirmed). On failure: fix and re-run; report honestly if you cannot.
4. When all repos are green and every task is `[X]`: `sdlc check tasks <id>`, then `sdlc stage set <id> verifying`.
If a repo has no confirmed test command, do not invent one: tell the orchestrator (`sdlc-discover` territory) and record manual evidence only with the user's help.

## Done when
All tagged tasks `[X]`; per-repo verification passes at current HEAD; no new open blockers; CLI accepted `verifying`.

## Escalate when
Requirement conflict or missing information; a contract/plan error; failing tests you cannot fix within scope; need for credentials, shared infrastructure, or migrations on real data; branch/dirty-repo problems.
