# specflow

A role-based, feature-oriented AI software organization for Claude Code. It manages a whole product workspace (one or many Git repositories under one root) around **features**, uses **GitHub Spec Kit** as its specification and implementation engine, keeps project state in files instead of chat history, and puts human approval gates and verification evidence between "code was generated" and "feature is done".

You open Claude Code at the product root and say *"Let's work on the next feature."* The orchestrator skill (`specflow:flow`) reads the workspace state, picks the next ready feature, activates only the roles that stage needs, runs the right Spec Kit steps, and stops at gates for your approval.

## Requirements
- Claude Code, **Node.js >= 18 on PATH**, git.
- [GitHub Spec Kit](https://github.com/github/spec-kit) CLI (`specify`) for the specification workflow (tested with 1.2.0). The plugin offers to initialize it and never does so without asking.

## Install
Full instructions (local install on your PC without any marketplace, the `specflow` / `sflow` command, per-project and team setups, migration from 0.3, troubleshooting) are in the **[repository README](../../README.md)**. The short version, from your product workspace:

```
specflow install                      # local copy, project scope (see the repository README to get the command)
# or, from GitHub, without the command:
claude plugin marketplace add mefeb169/specflow --scope project
claude plugin install specflow@specflow-marketplace --scope project
```

Then open Claude Code in the workspace and say "set up specflow here". Updating the plugin replaces only plugin files; workspace files created by `specflow init` are never overwritten (`specflow upgrade` shows a dry run first).

## What you get

| Piece | What it is |
|---|---|
| Skills (`specflow:*`) | `specflow:flow` (the PM loop), `specflow:setup` (setup interview), `specflow:discover`, `specflow:product`, `specflow:ux`, `specflow:architect`, `specflow:build`, `specflow:verify`, plus the vendored `frontend-design` |
| Agents (`specflow:*`) | team roles run as subagents dispatched by the PM: `product`, `architect`, `ux`, `lead`, `builder`, `verifier`, `release-manager`, plus `independent-reviewer` and `repo-profiler` |
| Agents | `repo-profiler` (one per repo, parallel, read-only), `independent-reviewer` (fresh-context code/security/UI review) |
| `specflow` CLI | The only writer of lifecycle state. Validates every stage change against real files and evidence |
| Hooks | Session brief; guards for state files, gates and destructive commands; handoff refresh on PreCompact; validation and handoff refresh on stop |

**Lifecycle:** `proposed > defined > specified > designed > planned > implementing > verifying > accepted > released > done`, one step forward at a time (backward with a reason). Entry criteria are checked by the CLI: a spec without open clarifications, a plan with a Repository Impact table for multi-repo features, tasks tagged `[repo:<name>]`, passing tests at each repo's current commit, a review, and for UI features a complete `ux.md` and a `ux-review`. Human gates: `spec`, `design`, `implement`, `acceptance`, `release` (which ones are required depends on `autonomy`: `guided`, `standard`, `autonomous`).

**State** lives at the workspace root: `.specflow/` (backlog, config, product, workspace map, design system, decisions), Spec Kit's `specs/NNN-name/` (spec, plan, tasks, `ux.md`, `verification.md`). Your repositories are not merged or restructured; the framework only creates feature branches and commits in the repos a feature lists, and never pushes by itself: pushing, PRs and releases run only through `specflow deliver` and `specflow release`, started by the PM with your confirmation.

## UI / UX
`specflow:ux` owns each UI feature's `ux.md` (flows, every screen state, copy, accessibility). *conform* mode (default for existing products) follows the design system already in code; *direction* mode (new product or an explicit redesign) runs the full `frontend-design` process and needs your approval of the visual direction. Visual checks only use tooling a repo already has (Playwright, Cypress, Storybook); otherwise the review is code-based plus a manual check, recorded honestly. Relax with `config.ux`: `{"design_gate_for_ui": false, "require_ux_review": false}`.

## CLI
`specflow <cmd>` or `sflow <cmd>` when installed globally, otherwise `node scripts/specflow.mjs <cmd>` (the skills always use the latter through `${CLAUDE_PLUGIN_ROOT}`, so the global command is optional). `--json` everywhere: `init scan doctor validate upgrade brief status next repo feature slice issue intake question dep blocker stage gate check rework focus interrupt resume milestone checkpoint pref decision lesson team dispatch setup branches verify evidence install uninstall`. The full command reference is in the repository README.

## What is enforced, and what is not
- **Enforced by hooks:** direct edits of `.specflow/backlog.json` / `config.json` / `memory.json` are denied; `specflow gate approve`, `init`, `branches create`, `upgrade --apply`, `specify init`, edits to existing instruction files, destructive shell commands and shell writes to the state files require a human prompt; in `bypassPermissions`/`dontAsk` modes the high-stakes ones are denied instead.
- **Enforced by the CLI:** stage entry criteria, gate-stage matching, dependency cycles, stale-evidence detection.
- **Advisory:** everything the skills tell the model to do. Hooks fail open if Node is missing, and cannot see every way a shell can write a file. See [docs/runtime.md](../../docs/runtime.md) and [SECURITY.md](../../SECURITY.md).

## Limits (0.3.0)
No release/deploy role yet (release is recorded manually), no Spec Kit extension or preset (repo tagging of tasks is done by instruction), no issue-tracker sync, no PR creation. Evals and CI exist; see `evals/README.md`.

## License
MIT. Bundles Anthropic's `frontend-design` skill (Apache-2.0, unmodified); see [NOTICE](NOTICE).
