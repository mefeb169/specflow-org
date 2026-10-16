# Task 4 Plan: rename to "specflow", a real `specflow` / `sflow` CLI, local use without the marketplace

Source: [task-4.md](task-4.md). State: `v0.3.0` (commit `960377d`), plugin `specflow-org`, CLI is `node scripts/sdlc.mjs`, workspace state dir `.sdlc/`, 30 tests.
Audience: the implementing agent (Sonnet). Part A records the decisions; Part B is the build spec. Use the Edit/Write tools (not shell one-liners) for file content. Run `npm test` and `claude plugin validate` after every step, and commit each step with the attribution line. **Never push.**

---

# Part A: Decisions

## A1. One name everywhere
"specflow" is the product, the plugin, the CLI and the workspace directory. `sflow` is a short alias of the CLI.

| Thing | Before | After |
|---|---|---|
| Plugin name / dir | `specflow-org`, `plugins/specflow-org/` | `specflow`, `plugins/specflow/` |
| Marketplace | `specflow-org-marketplace` | `specflow-marketplace` |
| Install id | `specflow-org@specflow-org-marketplace` | `specflow@specflow-marketplace` |
| CLI entry | `scripts/sdlc.mjs` (run as `node …`) | `scripts/specflow.mjs`, on PATH as **`specflow`** and **`sflow`** |
| Workspace state dir | `.sdlc/` | `.specflow/` |
| CLAUDE.md markers | `<!-- sdlc:begin/end -->` | `<!-- specflow:begin/end -->` |
| Env vars | `SDLC_SKIP_TOOL_PROBE`, `SDLC_FAKE_*` | `SPECFLOW_SKIP_TOOL_PROBE`, `SPECFLOW_FAKE_*` |
| Orchestrator skill | `specflow-org:sdlc` | `/specflow` if a plugin-root `SKILL.md` resolves that way (B0), else `specflow:flow` |
| Role skills | `specflow-org:sdlc-product` … | `specflow:discover`, `specflow:product`, `specflow:ux`, `specflow:architect`, `specflow:build`, `specflow:verify` |
| Agents, vendored skill | `specflow-org:repo-profiler`, `…:frontend-design` | `specflow:repo-profiler`, `specflow:independent-reviewer`, `specflow:frontend-design` (folder names unchanged) |
| GitHub repo (metadata only) | `mefeb169/specflow-org` | `mefeb169/specflow` (user decision D1) |
| npm package (local global install) | `sdlc-framework` (private, dev only) | `@mefeb169/specflow` at the repo root, with `bin: { specflow, sflow }` |
| Version | 0.3.0 | **0.4.0** |

The word "SDLC" stays only as a generic description of the lifecycle in prose, never as an identifier.

Renaming is allowed now because nothing is published: the "never rename after publishing" rule doesn't apply yet. After this task, the names are frozen.

## A2. How the CLI reaches the user's PATH
- **Global command on the PC:** the repo root `package.json` becomes the installable package (`@mefeb169/specflow`, `bin` → `plugins/specflow/scripts/specflow.mjs` for both `specflow` and `sflow`). Installing it with `npm install -g D:/Work/skill-framework` (or `npm link` in the repo) creates the `specflow` and `sflow` commands; on Windows npm writes `.cmd` shims. A local-folder global install is a **link**, so `git pull` in the repo updates the command with no reinstall.
- **Inside Claude sessions,** the skills and hooks keep calling `node "${CLAUDE_PLUGIN_ROOT}/scripts/specflow.mjs"`. This works whether or not the global CLI is installed, and the plugin and the global CLI read the same files.
- **No plugin `bin/` directory.** Org sync rejects it, and Windows handling isn't documented.
- **Name checks (2026-10-16):** `specflow` and `@mefeb169/specflow` are free on npm. `sflow` is taken on npm by an unrelated stream library, which doesn't matter for a local install, but the alias can't be published under that package name. **Naming risk:** "SpecFlow" was a well-known .NET BDD framework (Tricentis, succeeded by Reqnroll). Expect search confusion, and check trademark exposure before a public listing (user decision D2).

## A3. New CLI commands for local use
- `specflow install [--scope project|user|local] [--dir <workspace>] [--source <path|owner/repo>]`: sets up the plugin for a project without any Claude marketplace listing. It runs `claude plugin marketplace add <source> --scope <scope>`, then `claude plugin install specflow@specflow-marketplace --scope <scope>`, with cwd `<dir>` (default `.`).
  - The default source is the local repo the CLI runs from: the package root, which must contain `.claude-plugin/marketplace.json`. Otherwise `--source` is required.
  - The default scope is `project`.
  - It prints each command before running it, and stops with a clear message if `claude` isn't on PATH.
  - Afterwards it prints the next step: open `claude` in the workspace and say "set up specflow here".
- `specflow uninstall [--scope …] [--dir …]`: the reverse (`claude plugin uninstall specflow@specflow-marketplace --scope …`). It removes the marketplace entry only when given `--remove-marketplace`.
- **Legacy cleanup:** both commands detect old `specflow-org` entries in `<dir>/.claude/settings.json` and print the exact commands to remove them. They never edit settings files themselves.
- Testability: `SPECFLOW_CLAUDE_BIN` overrides the `claude` executable, so tests can use a fake that records its arguments.
- All other subcommands keep their names (`init`, `scan`, `doctor`, `status`, `next`, `stage`, `gate`, …). Only the program name changes: `specflow status` / `sflow status`.

## A4. Compatibility with workspaces made before 0.4
Workspaces initialized as `.sdlc/` (for example any project the user set up locally) keep working:
- `findRoot` accepts `.specflow/` and legacy `.sdlc/`, and marks the context as legacy.
- `brief` and `doctor` print "legacy workspace (.sdlc/): run `specflow upgrade --apply`". The hooks keep guarding legacy paths too, so direct edits to `.sdlc/backlog.json` are still denied.
- **Migration `0.4.0`:** renames `.sdlc/` to `.specflow/`, rewrites the CLAUDE.md markers (`sdlc:` → `specflow:`) and the managed block, and updates the `.gitignore` entry. A dry run shows all of it first; `--apply` is gated by the hook as before.
- The guard matches every spelling of the gate command: `specflow`, `sflow`, `specflow.mjs`, and legacy `sdlc` / `sdlc.mjs`.

## A5. Ways to use it without publishing (all go in the README)
1. **Local marketplace, project scope** (recommended; tested in the 0.3 E2E run): `specflow install` or the two `claude plugin …` commands.
2. **Local marketplace, user scope:** available in every project, at about 75 ms of hook overhead per tool call everywhere.
3. **One session, no install:** `claude --plugin-dir <repo>/plugins/specflow`.
4. **Your own GitHub repo as the marketplace** (public, or private with git credentials) for teammates: `claude plugin marketplace add mefeb169/specflow`. This isn't the Anthropic directory, and there's no review.
5. **CLI only** (`specflow status`, `next`, … in a terminal) for inspecting state outside Claude.

---

# Part B: Build spec

## B0. Verify first
- Use the `claude-code-guide` agent, and then **test empirically** with `claude --plugin-dir` + `-p` "list skills". Check whether a `SKILL.md` at the **plugin root** coexists with `skills/` and is invoked as `/specflow`. If it does, put the orchestrator there. If not, use `skills/flow/SKILL.md` (→ `specflow:flow`). Record the result in `docs/runtime.md`.
- Confirm that a plugin installed from a directory marketplace still loads after the plugin directory is renamed, and what a project whose settings point at the old `specflow-org` names shows. Document the cleanup steps.

## B1. Mechanical rename (one commit, `git mv` for directories)
- `git mv plugins/specflow-org plugins/specflow`; `git mv scripts/sdlc.mjs scripts/specflow.mjs`; rename the skill folders `sdlc` → (B0 result), `sdlc-discover` → `discover`, `sdlc-product` → `product`, `sdlc-ux` → `ux`, `sdlc-architect` → `architect`, `sdlc-build` → `build`, `sdlc-verify` → `verify`. Update each `name:` frontmatter field.
- `plugin.json`: `name: specflow`, `displayName: Specflow`, `version: 0.4.0`, and `homepage`/`repository` per D1. `marketplace.json`: `name: specflow-marketplace`, plugin `specflow`, `source: ./plugins/specflow`.
- Replace every identifier listed in A1 across scripts, skills, agents, templates, hooks, evals (skill-name regexes in graders, `.specflow/` in `_shared/lib.sh`), tests and docs. Afterwards, `grep -rn "sdlc" plugins tests docs README.md` may only show the legacy-compat code, the migration and the CHANGELOG history. Review every remaining hit.
- The help text uses `specflow <command>` and mentions the `sflow` alias.

## B2. Global CLI packaging
- Root `package.json`: `"name": "@mefeb169/specflow"`, `"version": "0.4.0"`, `"bin": {"specflow": "plugins/specflow/scripts/specflow.mjs", "sflow": "plugins/specflow/scripts/specflow.mjs"}`, `"files"` limited to `plugins/specflow`, `.claude-plugin`, `LICENSE`, `README.md`, `"engines": {"node": ">=18"}`, `"license": "MIT"`, `repository`, `"scripts": {"test": "node --test"}`. Keep it zero-dependency, and remove `"private": true` only if D3 says the user wants npm publishing; otherwise keep `private` (global install from a folder still works).
- Keep the shebang `#!/usr/bin/env node` on `specflow.mjs`.
- **Live check on this PC** (it's the user's own machine, so ask before running it): `npm install -g D:/Work/skill-framework`, then from another directory run `specflow help`, `sflow help` and `where specflow` (Windows). Then `npm uninstall -g @mefeb169/specflow` unless the user wants to keep it. Report the result.

## B3. `install` / `uninstall` commands (`scripts/commands/install.mjs`)
- Implement A3. Resolve the package root from the script location (`../../..` from `scripts/`) and check for `.claude-plugin/marketplace.json`.
- Run `claude` with `spawnSync` with `shell: true` on win32 (`claude` is a `.cmd` shim there), and quote paths. Print stdout/stderr through. Exit non-zero on any failure, and print the manual commands as a fallback.
- Guard: add `specflow|sflow … (install|uninstall)` to the gated (`ask`) Bash patterns. These are meant for a human in a terminal.

## B4. Legacy workspace support (A4)
- `lib/state.mjs`: `STATE_DIRS = ['.specflow', '.sdlc']`. `findRoot` returns `{root, stateDir, legacy}` (update the callers). `paths()` uses the found state dir.
- `lib/migrations.mjs`: a `0.4.0` entry that renames the directory (`fs.renameSync`; refuse if `.specflow/` already exists), rewrites the markers and block via `applyClaudeBlock`, and updates the `.gitignore` line. It has a clear `plan()` description and is idempotent.
- `lib/guard.mjs`: state-file protection covers both dirs, and the gate/command regexes cover all spellings (A4). The `NON_SOURCE` list includes both dirs.
- `render.brief` / `doctor`: the legacy warning.

## B5. Tests (all existing tests updated; new cases)
1. `specflow`/`sflow`: the `bin` entries exist in the root `package.json`, point at a file that exists, and that file starts with a shebang. Running the entry with `help` prints `specflow <command>` and mentions `sflow`.
2. `install` with `SPECFLOW_CLAUDE_BIN` set to a fake (a node script that appends its argv to a log file): the scope default is project, `--scope user` is honored, the source defaults to the repo root, `--source owner/repo` is passed through, and cwd is `--dir`. A missing `claude` gives a clear error with exit 1. Legacy `specflow-org` settings produce the printed cleanup commands.
3. Legacy workspace: an `.sdlc/` workspace is found, `brief` warns, the hook denies an edit to `.sdlc/backlog.json`, `upgrade` (dry run) changes nothing, and `upgrade --apply` renames the directory, rewrites the markers, preserves user CLAUDE.md content and the backlog, and is idempotent.
4. The guard asks for `sflow gate approve F-001 spec`, `specflow gate approve …`, `node …/specflow.mjs gate approve …` and legacy `sdlc gate approve …`, and denies them in `bypassPermissions`.
5. Evals: the grader regexes reference the new skill names. Re-run the three Windows-runnable cases once and report the scores.

## B6. README (the user asked for all instructions here)
Root `README.md`, with these sections in order. The plugin README links back to it.
1. **What it is** (keep it short).
2. **Requirements:** Claude Code, Node >= 18, git, Spec Kit `specify` CLI, and on Windows the PowerShell policy or `--script sh`.
3. **Install on your PC (local, no marketplace)**:
   a. get the code (`git clone https://github.com/mefeb169/specflow` or use the existing folder);
   b. install the CLI globally: `npm install -g <path-to-repo>` (or `npm link` inside the repo), then verify with `specflow --version` / `sflow help`;
   c. update with `git pull` (it's linked); uninstall with `npm uninstall -g @mefeb169/specflow`.
4. **Use it in a project (without publishing)**: the five ways from A5, with exact commands. Lead with `cd my-product && specflow install`, then `claude`, then "set up specflow here". Explain project vs user scope and the per-call hook cost.
5. **Share with your team:** push the repo (public or private), and teammates run `claude plugin marketplace add mefeb169/specflow --scope project` + `install`. Committing `.claude/settings.json` from a GitHub-sourced marketplace works for everyone; one from a local-path marketplace does not (it's an absolute path).
6. **Daily use:** the conversation entry points ("set up specflow here", "let's work on the next feature", "status") and the terminal commands (`sflow status`, `sflow next`, `sflow doctor`, `sflow upgrade`).
7. **Command reference:** a table of every subcommand with a one-line description.
8. **Updating, uninstalling, migrating from `specflow-org` / `.sdlc` (0.3):** exact commands.
9. **Troubleshooting:** `specflow` not found (npm global bin not on PATH: `npm prefix -g`), Spec Kit scripts blocked on Windows, hooks silent without Node, gates denied in bypass mode.
10. Links: plugin README, runtime notes, architecture, E2E report, security, changelog, license.

Also update `CHANGELOG.md` (0.4.0: rename, global CLI, install/uninstall, legacy migration), `docs/runtime.md` (the B0 findings, global CLI) and `SECURITY.md`/`NOTICE` names. Re-tag: create `v0.4.0` locally; leave `v0.3.0` as it is.

## B7. Done when
- `npm test` passes, and `claude plugin validate .` and `claude plugin validate plugins/specflow` pass.
- A fresh `specflow install` into a temp workspace works, followed by `claude -p` listing the `specflow` skills (orchestrator name as decided in B0).
- The global `specflow` / `sflow` commands work on this PC (if the user approved the install).
- The README covers every point in task-4.md.
- The report states what was verified and what was not.

---

# Decisions for the user (defaults in bold; Sonnet proceeds with the defaults unless told otherwise)
- **D1** GitHub repo name: **`mefeb169/specflow`** (it should match the product), or keep `specflow-org`.
- **D2** Name risk: SpecFlow (.NET BDD tool) exists. **Proceed with "specflow"**, or choose a variant before anything is published (e.g. `specflow-ai`).
- **D3** npm: **local/global install from the folder only (package stays private)**, or also publish `@mefeb169/specflow` to npm later.
- **D4** Orchestrator command: **`/specflow` if the plugin-root skill works, else `/specflow:flow`**.
