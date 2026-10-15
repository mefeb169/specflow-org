# Runtime behavior and what was verified

Measured or observed on Windows 11, Claude Code 2.1.x, Node 26, 2026-10-15. "Docs" means documented by Anthropic but not observed here.

## Requirements
Claude Code, **Node.js >= 18 on PATH** (hooks and the `sdlc` CLI), git. The `specify` CLI is only needed to initialize Spec Kit. The plugin has no npm dependencies.

## Node missing: hooks fail open
Simulated by pointing a copy of the plugin's hooks at a nonexistent executable. Result: the Bash call ran normally and no error reached the model. So without Node the guards **silently stop firing** (direct state edits and gate prompts are no longer intercepted) and the skills' CLI calls fail. A real Node-less machine was not tested because the Claude Code install used here itself runs on Node. Treat Node as a hard requirement.

## Permission modes
`sdlc gate approve`, `init`, `branches create`, `upgrade --apply`, `specify init` and destructive shell commands are forced to a human prompt (hook decision `ask`).

| Mode | Behavior | Evidence |
|---|---|---|
| default, acceptEdits, plan | hook `ask` shows the normal prompt | docs (interactive prompts not observed here) |
| auto | prompts forced by a hook still appear | docs |
| `-p` (non-interactive) | nothing can answer the prompt, so the call does not run | observed (the `sdlc branches create` call was not executed by the model; harness ran it itself) |
| bypassPermissions, dontAsk | the plugin **denies** these actions instead of asking (`guards.deny_in_unattended_modes`, default true) | unit tests; live behavior of `ask` in these modes is undocumented, hence the deny |

A hook-forced `ask` cannot be auto-approved by the same hook. Note that evals (`claude plugin eval`) cannot tell whether the hook or the model's own judgment prevented a forbidden edit.

## Cost of the hooks
Per tool call (Bash, Edit, Write, ...), 20-run averages: pre-tool-use hook 74 ms outside a workspace and 81 ms inside one; a bare `node -e 0` costs 64 ms. In a user-scope install the hook therefore adds about 75 ms to every tool call in every project, even where no `.sdlc/` exists. Recommended install is **project scope** in the product workspace:

```
claude plugin marketplace add mefeb169/specflow-org --scope project
claude plugin install specflow-org@specflow-org-marketplace --scope project
```

`if` filters cannot test for a file's existence, so they cannot skip the hook in non-workspace projects.

## Spec Kit
- Tested with Spec Kit 1.2.0 (`skills` style). Older command-style installs are detected by `sdlc doctor`, but were not exercised.
- Spec Kit runs fine at a non-git workspace root: the active feature comes from `.specify/feature.json`, written by `sdlc feature activate` / `speckit-specify`.
- Windows: Spec Kit's `.ps1` scripts need a PowerShell execution policy that allows scripts. Use `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or `specify init --here --integration claude --script sh` (what the end-to-end run used).

## Evals
Granting `Bash` to an eval run needs an OS sandbox backend; Windows has none, so Bash-dependent cases only run on Linux/macOS. See `plugins/specflow-org/evals/README.md`.
