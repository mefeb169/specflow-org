# sdlc: AI-driven SDLC framework for Claude Code

A Claude Code plugin that turns a product workspace (one or many Git repos under one root) into a role-based, feature-oriented delivery process built on GitHub Spec Kit. Design and rationale: [tasks/task-1-plan.md](tasks/task-1-plan.md) (Part A). This is **Phase 1**.

## Concepts

| Layer | What | Guarantee |
|---|---|---|
| Skills / agents | `sdlc` (orchestrator), `sdlc-discover`, `sdlc-product`, `sdlc-ux`, `sdlc-architect`, `sdlc-build`, `sdlc-verify`; subagents `repo-profiler`, `independent-reviewer` | advisory (AI judgment) |
| `sdlc` CLI | `scripts/sdlc.mjs`: the only writer of lifecycle state; validates every stage change against real files and evidence | deterministic |
| Hooks | SessionStart brief; PreToolUse guards; Stop validation | deterministic (harness-enforced) |
| Spec Kit | `speckit-*` skills + `.specify/` at the workspace root | owns spec/plan/tasks |

State: `.sdlc/backlog.json` (feature identity, stage, deps, gates, blockers), `.sdlc/config.json` (repos, commands, autonomy, guards), `.sdlc/product.md`, `.sdlc/workspace-map.md`, `.sdlc/decisions/`. Requirements, plans and tasks stay in Spec Kit's `specs/NNN-name/`; evidence is appended to `specs/NNN-name/verification.md`. Status views are generated, never stored.

## UI / UX

- **`sdlc:sdlc-ux`** (UX/UI Designer) owns `.sdlc/design-system.md` and each UI feature's `specs/NNN/ux.md` (mode, flows, screens and states, copy, accessibility, tokens). It runs at `specified`, before the architect.
- **Two modes**, recorded in `ux.md` (`Mode: conform | direction`). *conform* (default for existing products) follows the design system already in code and applies only the writing, restraint and quality-floor parts of `frontend-design`. *direction* (new product/surface, or an explicit redesign) runs the full `frontend-design` process (token plan, review against generic defaults, revise) and needs the user's approval before building. Precedence: user's explicit direction > design system in code > `.sdlc/design-system.md` > `frontend-design` defaults.
- **`ui` trait:** `scan` sets `repos[].ui` (UI framework or design-system evidence); features derive it from their repos (`feature add --ui`, `feature set <id> ui true|false`, `repo set <name> --ui true|false`). For UI features the CLI requires a complete `ux.md` before `designed`, makes the `design` gate required in `standard` autonomy, and requires passing `ux-review` evidence before `accepted`. Both can be relaxed in `config.json`: `"ux": {"design_gate_for_ui": false, "require_ux_review": false}`.
- **Visual checks** use only tooling a repo already has (Playwright, Cypress, Storybook); otherwise the review is code-based plus a manual check, recorded honestly in the `ux-review` note.
- **Vendored skill:** `skills/frontend-design/` is Anthropic's `frontend-design` skill, unmodified, with its Apache-2.0 `LICENSE.txt` (see `UPSTREAM.md`). It appears as `sdlc:frontend-design`; if you also install Anthropic's own copy you will see both, namespaced separately.

## Install

```
claude plugin marketplace add D:/Work/skill-framework
claude plugin install sdlc@sdlc-local
```
(or try without installing: `claude --plugin-dir D:/Work/skill-framework`). Validate with `claude plugin validate .`.

Then open Claude Code at the **product workspace root** and say "set up the framework here", later "let's work on the next feature". Skills appear as `sdlc:sdlc`, `sdlc:sdlc-product`, etc.

Updating the plugin replaces only plugin files; workspace files created by `sdlc init` are never overwritten (`init` is idempotent and only manages the marked block in the root `CLAUDE.md`).

## CLI

Run as `node scripts/sdlc.mjs <cmd>` (the skills call it through `${CLAUDE_PLUGIN_ROOT}`); `--json` on everything. Run `sdlc help` for the list: `init scan doctor validate brief status next repo feature dep blocker stage gate check branches verify evidence`.

Lifecycle: `proposed > defined > specified > designed > planned > implementing > verifying > accepted > released > done`, one step forward at a time, any step backward with `--reason` (clears gates from that stage on). Gates `spec design implement acceptance release`; required set depends on `autonomy` (`guided` / `standard` default / `autonomous`).

## What the hooks enforce

- Deny: direct Edit/Write of `.sdlc/backlog.json` / `config.json`.
- Ask (human prompt): `sdlc gate approve`, `sdlc init`, `sdlc branches create`, `specify init`, edits to existing instruction files (except inside the sdlc block of root `CLAUDE.md`), destructive/outward-facing shell commands (list in `config.guards`), shell commands that appear to write the state files, source edits in a repo while no feature touching it is `implementing` (`guards.source_edit_outside_implementing`: `ask`/`deny`/`off`).
- Hooks are no-ops outside a workspace with `.sdlc/`.

Known limits: hooks cannot see everything a shell can do (a script run via Bash can still write files in ways the patterns do not recognize), and skills remain advisory. Stop validation only warns in Phase 1.

## Environment notes (Windows)

- Spec Kit's `.ps1` scripts need a PowerShell execution policy that allows scripts. `sdlc doctor` reports it; fix with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (user decision), or initialize Spec Kit with `specify init --here --integration claude --script sh`.
- Spec Kit at a non-git workspace root works: feature selection comes from `.specify/feature.json`, which `sdlc feature activate` writes.

## Tests

`npm test` (Node built-ins only, no dependencies). Builds a temp two-repo workspace and exercises init, scan, backlog/deps, every stage refusal, evidence, branches, hooks and validation.

## Phase 1 limits (deliberate)

No release role, no Spec Kit extension/preset, no `upgrade` tooling, no issue-tracker sync, no PR creation, Stop hook does not block. See Part C of the plan.

## Deviations from the plan

- `claude plugin` skill namespace: skills are `sdlc:sdlc-*`; subagents `sdlc:repo-profiler`, `sdlc:independent-reviewer`.
- `marketplace.json` uses `"source": "."` (the documented form for a plugin at the marketplace root).
- Extra: `doctor` checks the PowerShell execution policy; a Bash guard for shell writes to state files.
