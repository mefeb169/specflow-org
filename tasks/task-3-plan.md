# Task 3 Plan: codebase review, next phases, publishing

Source request: [task-3.md](task-3.md): analyze the codebase, say what's next, and publish it to the Claude plugin marketplace.
State reviewed: commits `d51572f` (Phase 1), `d45f2b2` and `2cf89c9` (UI/UX). About 2,000 lines across scripts, skills and agents; 22 passing tests.
Audience: the user (Part A and the decisions in Part C) and the implementing agent, Sonnet (Part B). Part D is the roadmap after publishing.

---

# Part A: Analysis

## A1. What is solid
- **The enforcement model works:** state changes only go through the CLI. Stage entry is checked against real files and evidence at HEAD. Hooks deny direct state edits and force a prompt for gates and destructive commands. This was verified live: an edit to `backlog.json` was denied.
- **Spec Kit integration is grounded** in the installed 1.2.0 layout (`speckit-*` skills, `.specify/feature.json`).
- **The scope is lean:** 7 role skills plus 2 agents instead of 17 personas, zero npm dependencies, and the plugin passes `claude plugin validate`.
- **UX:** conform/direction modes. The live run caught and fixed a real defect (the scan's design-system evidence not reaching `sdlc-ux`).

## A2. Findings, ranked (what blocks or weakens a public release)

| # | Severity | Finding | Fix (Part B step) |
|---|---|---|---|
| 1 | **Blocker** | No `LICENSE` for the plugin itself. The Anthropic directory blocks a listing without one. A `NOTICE` for the vendored Apache-2.0 `frontend-design` is also missing. | B1 |
| 2 | **Blocker** | No public git repo or remote, and `homepage`/`repository` are unset. The directory needs a public repo, and users install from `owner/repo`. | C (user) + B1 |
| 3 | **Blocker** | The plugin name `sdlc` is generic and probably taken. It also produces the awkward `/sdlc:sdlc`. The docs warn **never to rename after publishing**, so the name must be chosen now. | C, D1 |
| 4 | **High** | The plugin root is the repo root, so `tasks/` (internal plans), `tests/` and `package.json` ship to every user. | B2 |
| 5 | **High** | Hooks and the CLI need **Node.js**, which Claude Code's native installer does not guarantee. Without Node, every Bash/Edit call would show a hook error. | B3 |
| 6 | **High** | **Gate approval can be bypassed by permission mode:** a hook `ask` behaves as documented in auto mode and is denied in `-p`, but behavior under `bypassPermissions`/`dontAsk` is undocumented. The hook input includes `permission_mode`, so we can refuse deterministically. | B4 |
| 7 | **High** | **Never run end to end:** no feature has gone through real Spec Kit plan → tasks → implement. Windows was blocked by the PowerShell execution policy, and macOS/Linux have never been run (tests ran on Windows only). | B6, B7 |
| 8 | Medium | A user-scope install spawns `node` on every Bash/Edit call in **every** project (the call exits early, but costs about 50–100 ms each). `if` filters can't test for `.sdlc/`. | B3 (project-scope install as the default in the docs) |
| 9 | Medium | Spec Kit coupling: only 1.2.0 has been tested. Older Spec Kit installs commands (`.claude/commands/speckit.*.md`) rather than skills, and `doctor` doesn't detect that. | B5 |
| 10 | Medium | No skill evals. The directory reviews quality, and nothing measures whether "let's work on the next feature" actually triggers the orchestrator. | B6 |
| 11 | Medium | Every new workspace starts at `schema_version: 1`, and there is no migration path once users have real state. That has to exist before shipping v0.2 of the schema. | B5 (version stamp + check now; migrations in D) |
| 12 | Low | CRLF churn (no `.gitattributes`); tests take about 2 minutes because every `init` spawns `specify version`; `sdlc.mjs` is 507 lines. | B1, B2 |
| 13 | Low | Hook commands use shell form. The docs recommend exec form (`node` + args) for Windows robustness. | B3 |

## A3. Publishing facts (from the docs, checked 2026-10-15)
- **Anthropic's directory:** submit at `claude.ai/directory/manage` and choose "Plugin bundle". It needs a **paid plan**, a **public repo**, `plugin.json`, a README of at least 40 words, a `LICENSE` or `license` field, and a unique kebab-case name. `description`/`author`/`version` trigger warnings if missing. Each version gets automated validation and a security scan, and a person reviews new listings. `claude-plugins-official` itself only takes partner submissions.
- **Self-hosted marketplace** (no review): a public GitHub repo with `.claude-plugin/marketplace.json`. Users run `claude plugin marketplace add owner/repo`, then `claude plugin install <name>@<marketplace>`.
- **Updates:** if `version` is set, users only get a new copy when it changes. Set it in **one** place (plugin.json). Auto-update is off by default for third-party marketplaces.
- **Directory-only fields:** `icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl`. A top-level `bin/` is rejected by org sync, so the CLI stays in `scripts/`.
- **`claude plugin eval`:** cases live in `evals/<case>/prompt.md` + `graders/*.md`. Graders include `tool_used` (skill triggering), `file_exists`, `regex` and `llm`. Results go to an HTML report.

**Recommended route:** publish a self-hosted marketplace first as a public beta (v0.3.0), dogfood it on one real product, then submit to Anthropic's directory (v1.0.0).

---

# Part B: Phase 3 build spec: release readiness (for Sonnet)

Placeholders `<NAME>`, `<OWNER>`, `<REPO>`, `<LICENSE>` and `<AUTHOR>` come from the user's decisions (Part C). **If any is still unfilled, stop and ask. Do not invent them.** Use Edit/Write for file changes (not shell one-liners). Commit after each step with the attribution line. `npm test` and `claude plugin validate` must pass after every step.

## B1. Legal and metadata
- `LICENSE` at the repo root **and** inside the plugin dir (after B2): full `<LICENSE>` text, copyright `<AUTHOR>` 2026. Fetch the canonical text (the SPDX/OSI page). Never write it from memory.
- `NOTICE` in the plugin dir: names the vendored `skills/frontend-design` (Anthropic, Apache-2.0) and states that its own `LICENSE.txt` governs that folder.
- `plugin.json`: `name: <NAME>`, `version: "0.3.0"`, `description`, `author {name, email?, url?}`, `homepage: https://github.com/<OWNER>/<REPO>`, `repository` (same URL), `license: <LICENSE SPDX>`, `keywords`. Optional directory fields: `documentationUrl` (README) and `supportUrl` (issues). **No `version` in marketplace.json.**
- `marketplace.json`: `name: <NAME>-marketplace` (not reserved), `owner`, plugin entry `{name, source: "./plugins/<NAME>", description, category: "development", tags}`.
- `.gitattributes`: `* text=auto eol=lf`, and `*.cmd`/`*.ps1 eol=crlf`. Renormalize in its own commit.
- `CHANGELOG.md` (Keep a Changelog): 0.1.0 (Phase 1), 0.2.0 (UX), 0.3.0 (this phase).
- `SECURITY.md`: how to report issues, and what the hooks do and don't guarantee (copy the limits from the README).

## B2. Repo restructure (the plugin ships only what users need)
```
/                          ← git repo / marketplace root
├── .claude-plugin/marketplace.json
├── plugins/<NAME>/        ← plugin root (source "./plugins/<NAME>")
│   ├── .claude-plugin/plugin.json
│   ├── skills/ agents/ hooks/ scripts/ templates/
│   ├── README.md LICENSE NOTICE
├── evals/                 ← plugin evals (B6), not shipped
├── tests/                 ← node tests, not shipped
├── docs/                  ← architecture (copy of task-1 Part A, kept current), contributing
├── tasks/                 ← planning history, not shipped
├── .github/workflows/ci.yml
├── README.md (repo/landing) LICENSE CHANGELOG.md SECURITY.md package.json .gitattributes
```
- Move the files with `git mv` so history is kept. Update `tests/make-fixture.mjs` paths. `TEMPLATES` in `sdlc.mjs` is already relative to the script.
- Split `scripts/sdlc.mjs` command handlers into `scripts/commands/{init,feature,stage,verify,views}.mjs`. Keep `sdlc.mjs` as the dispatcher only. There must be no behavior change, which the tests prove.
- **Speed up tests:** an `SDLC_SKIP_TOOL_PROBE=1` env var makes `doctor` skip `specify version` and report "skipped". The test helpers set it. Add one test that runs the real probe.

## B3. Runtime robustness (Node, hooks, cost)
- **Exec-form hooks:** each hook becomes `{"type":"command","command":"node","args":["${CLAUDE_PLUGIN_ROOT}/scripts/hooks/<x>.mjs"]}`. Confirm the exec-form schema in the hooks reference first (`args` with `${CLAUDE_PLUGIN_ROOT}` substitution).
- **No Node available:** document "Requires Node.js ≥ 18 on PATH" at the top of the plugin README and the directory description. Test what happens when `node` is missing, on Windows and on Linux: run Claude Code with PATH stripped of node in a throwaway environment, and record whether the hook error is blocking or just a notice. If each tool call shows a noisy notice, switch the hooks to a tiny shell-form wrapper that only runs node when it exists, and otherwise prints a single SessionStart line ("sdlc: Node.js ≥18 not found; framework disabled"). Pick the lighter option and write the result down in `docs/runtime.md`.
- **Node version check:** `scripts/hooks/common.mjs` and `sdlc.mjs` exit cleanly with a clear message on Node < 18.
- **Install guidance:** recommend **project-scope** install (`claude plugin install <NAME>@<NAME>-marketplace --scope project`) in the product workspace, so the hooks only run there. Explain that a user-scope install is harmless but costs a process spawn per tool call.
- **Cheap PreToolUse filtering:** add `if` filters where they are safe. Edit/Write hooks have no reliable `if`, so the hook stays. Measure the hook's wall time on a no-`.sdlc` project and record it.

## B4. Gate integrity under every permission mode
- `guard.mjs`: for `sdlc gate approve` (and `init`, `branches create`, `specify init`), when `input.permission_mode` is `bypassPermissions` or `dontAsk` → **deny**, with the reason "Gate approvals need an interactive human prompt; switch out of <mode> to approve." Destructive Bash patterns in those modes → deny as well (configurable with `guards.deny_in_unattended_modes`, default `true`).
- Tests: stdin samples for each mode (`default`, `acceptEdits`, `auto`, `plan`, `bypassPermissions`, `dontAsk`) with the expected decision.
- **Live check** (B7): in an interactive session under `acceptEdits` and auto mode, confirm the gate prompt appears. Under `-p`, confirm it is denied. Write the matrix down in `docs/runtime.md`.

## B5. Compatibility and state versioning
- `doctor`: detect the Spec Kit integration style. That is either skills (`.claude/skills/speckit-*`) or commands (`.claude/commands/speckit.*.md`). Record `config.speckit.style = skills|commands`. The skills' Spec Kit mapping must say: with the commands style, run the `/speckit.<step>` slash commands instead. Warn when the Spec Kit version is outside the tested range (`TESTED_SPECKIT = ">=1.2.0 <2"` in `lifecycle.mjs`).
- `doctor`: warn on Node < 18 and missing git, and on Windows add the execution-policy check (already there) plus a `--script sh` hint.
- **State versioning:** when `config.framework_version` is older than the plugin version, `brief` and `doctor` print "workspace created by vX; run `sdlc upgrade`". Add `sdlc upgrade` as a **no-op migration runner**: a `migrations/` list keyed by schema version, which currently holds only the CLAUDE.md block refresh. It never overwrites user files (it shows a diff instead) and updates `framework_version`. Tests cover a v0.1.0 workspace upgrading cleanly.

## B6. Quality gates: CI and evals
- `.github/workflows/ci.yml`: matrix `os: [ubuntu-latest, macos-latest, windows-latest]` × `node: [18, 22]`. Steps: `npm test`, then install Claude Code (`npm i -g @anthropic-ai/claude-code`) and run `claude plugin validate plugins/<NAME>` and `claude plugin validate .`. Fix every POSIX failure the matrix finds (paths, `shell: true` quoting, git default branch name).
- `evals/` (run locally, not in CI; it costs model tokens). Create cases with `claude plugin eval init --bare <case>`, then fill them in:
  1. `next-feature-triggers-orchestrator`: the prompt is "Let's work on the next feature" in a fixture workspace. Graders: `tool_used` Skill matching `<NAME>:sdlc`; `regex` on output mentioning a feature ID.
  2. `ux-conform-with-tailwind`: the fixture has a Tailwind config and asks for UX for F-001. Graders: `file_exists` `specs/001-*/ux.md`; `regex` `Mode: conform`.
  3. `no-direct-state-edit`: the prompt asks it to set `next_id` to 50. Graders: `regex` that `next_id` is still 1, and `llm` that the response explains the CLI route.
  4. `discover-builds-map`: "set up the framework here" (init approved in a pre-initialized fixture). Graders: `file_exists` `.sdlc/workspace-map.md`, `regex` on evidence tags.
  5. `build-refuses-spec-change`: when implementation hits a requirement conflict, `regex` for `blocker add`.

  Eval fixtures are generated by a script `evals/fixtures/make.mjs` that reuses `tests/make-fixture.mjs`. Run `claude plugin eval . --runs 3` and keep `evals/results/` out of git. Pass threshold 1.0 for cases 1–3, 0.67 for 4–5. Report pass rates honestly.

## B7. End-to-end dogfood (manual, report honestly)
On a two-repo sample product (an Express API plus a React app, scaffolded in a temp directory), take one feature from `proposed` to `accepted` through real Spec Kit (`speckit-specify` → `clarify` → `plan` → `tasks` → `analyze` → scoped `implement`). Use the plugin as installed from the **local marketplace** at project scope, with gates approved interactively by the user. Do it on Windows (with `--script sh`, or after the user has set the execution policy) and, if available, on WSL/Linux. Write `docs/e2e-report.md` covering what worked, the friction points, and any skill or CLI fixes made (each fix gets its own commit and test).

## B8. Release v0.3.0 (agent prepares; the user publishes)
- The README landing page covers: what it is, requirements (Claude Code, Node ≥18, git, Spec Kit CLI), install (self-hosted marketplace, project scope), a 60-second quickstart, the concept diagram, what's enforced and what's advisory, limits, and the license and attribution.
- Tag `v0.3.0` locally. **Do not push, create a GitHub repo or submit anything.** Those are the user's actions (Part C).

---

# Part C: Decisions and actions for the user

| # | Decision / action | Recommendation |
|---|---|---|
| D1 | **Plugin name** (permanent once published, kebab-case, unique) | Something distinctive that reads well as `/<name>:sdlc`, e.g. `feature-forge`, `specflow-org`, `sdlc-crew`. Check that it is free in the directory first. |
| D2 | **License** | MIT (simplest) or Apache-2.0 (matches the vendored skill, with a patent grant) |
| D3 | **Author/owner** shown publicly (`DevMechanix`? personal?) + contact email/URL | |
| D4 | **GitHub owner/repo** (public) | e.g. `devmechanix/<NAME>` |
| D5 | **Route** | Self-hosted public beta now, directory submission at v1.0 |
| A1 | Create the public GitHub repo, add the remote, and push (after B8) | user |
| A2 | Submit at `claude.ai/directory/manage` → Plugin bundle (needs a paid plan) | user, at v1.0 |
| A3 | Windows: allow Spec Kit scripts (`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`) or use `--script sh` | user |

---

# Part D: Roadmap after publishing

| Phase | Goal | Contents | Entry condition |
|---|---|---|---|
| **3** (this plan) | Publishable beta | Part B | — |
| **4** | Native Spec Kit integration | A Spec Kit **extension** registering `after_specify/plan/tasks/implement` → `sdlc` sync (auto-link spec dirs, auto stage checks); a **preset** adding `## Repository Impact` to `plan-template` and `[repo:]` to `tasks-template` (this replaces the instruction-based tagging, the most fragile part today) | E2E report shows tagging/linking friction |
| **5** | Delivery | `sdlc-release` role: deploy runbooks from discovered CI/CD, the release gate, post-deploy verification evidence; per-repo PRs through `gh` (with approval) and the PR URL recorded on the feature | Phase 4 is stable |
| **6** | Lifecycle maturity | Real schema migrations in `sdlc upgrade`; a `speckit-converge`-driven drift reconciliation (spec vs. code); a `speckit-taskstoissues` bridge to GitHub Issues; an optional blocking Stop hook ("claimed done without evidence"); a status dashboard artifact | Users with live state exist |
| **7** | Scale | An indexed project map for large workspaces, parallel per-repo build agents in worktrees, org presets through `userConfig` (autonomy, guard modes) | Demand |
| **v1.0** | Directory submission | Evals green, CI green on 3 OSes, E2E on at least 2 real products, docs complete | Phases 3–4 done |
