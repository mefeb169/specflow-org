# specflow

**An AI software organization for Claude Code.** Open Claude Code at your product root, say *"Let's work on the next feature,"* and a team of role skills takes the feature from request to verified delivery: product, UX, architecture, build and verification, across as many Git repositories as the product has, driven by [GitHub Spec Kit](https://github.com/github/spec-kit).

- **Feature-oriented.** One feature, one lifecycle, even when it spans `api/`, `web/` and `mobile/`.
- **Context before action.** It scans your repos, instructions and docs first, and labels every claim `[code]`, `[doc]`, `[planned]`, `[unknown]` or `[conflict]`.
- **Controlled autonomy.** Human gates for spec, design, implementation, acceptance and release. State changes go through a CLI that checks real files and test evidence; hooks block direct edits.
- **No lock-in.** Your repos keep their histories and conventions. State lives in plain files at the workspace root; nothing is pushed.

```
Feature request
  -> product (spec via Spec Kit) -> [spec gate]
  -> ux (UI features) + architect (plan, repo impact, tasks) -> [design gate]
  -> [implement gate] -> build, repo by repo, on feature branches
  -> verify (tests at HEAD, independent review) -> [acceptance gate] -> release
```

## One name everywhere

| What | Name |
|---|---|
| Product and Claude Code plugin | `specflow` |
| Command-line tool | `specflow` (short alias: `sflow`, identical) |
| Marketplace (local or GitHub) | `specflow-marketplace`, so the install id is `specflow@specflow-marketplace` |
| Workspace state folder | `.specflow/` (plus `specs/` from Spec Kit) |
| Skills inside Claude | `specflow:flow` (the orchestrator), `specflow:discover`, `specflow:product`, `specflow:ux`, `specflow:architect`, `specflow:build`, `specflow:verify`, `specflow:frontend-design` |
| Subagents | `specflow:repo-profiler`, `specflow:independent-reviewer` |

## Requirements

- [Claude Code](https://code.claude.com), **Node.js 18 or newer**, and git.
- The [Spec Kit](https://github.com/github/spec-kit) CLI (`specify`) for the specification workflow. Tested with 1.2.0. specflow offers to initialize it and never does so without asking.
- **Windows:** Spec Kit's `.ps1` scripts need a PowerShell execution policy that allows scripts. Either run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or initialize Spec Kit with `specify init --here --integration claude --script sh`.

## Install on your PC (local use, no marketplace)

You do not need to publish anything. The repository is both the plugin source and an installable command-line package.

1. **Get the code.** Use the folder you already have, or clone it once it is on GitHub:
   ```
   git clone https://github.com/mefeb169/specflow.git
   cd specflow
   ```
2. **Install the command globally** from that folder:
   ```
   npm install -g .
   ```
   npm creates the `specflow` and `sflow` commands, with shims for bash, cmd and PowerShell. A global install from a folder is a **link** to that folder, not a copy (verified on Windows).
3. **Check it** from any directory:
   ```
   specflow --version
   sflow help
   ```
   If the command is not found, npm's global bin folder is not on your PATH. Find it with `npm prefix -g` (on Windows that folder itself; elsewhere its `bin/`) and add it to PATH.
4. **Update:** `git pull` in the repository. Because it is a link, the command and the plugin update together. Re-run `npm install -g .` only if the package name or `bin` entries ever change.
5. **Uninstall the command:** `npm uninstall -g @mefeb169/specflow`.

The command is optional for using the plugin inside Claude (the skills and hooks call the bundled script themselves), but it is the easiest way to install the plugin into projects and to inspect state from a terminal.

## Use it in a project without publishing to a marketplace

Pick one. All of them work from your local copy.

**1. Local marketplace, project scope (recommended).** The hooks then run only in this project.
```
cd my-product            # the folder that contains your repos
specflow install         # same as: sflow install
claude
> set up specflow here
> let's work on the next feature
```
`specflow install` runs these two Claude Code commands for you and prints them first:
```
claude plugin marketplace add <path-to-the-specflow-repo> --scope project
claude plugin install specflow@specflow-marketplace --scope project
```
It writes `.claude/settings.json` in that project and nothing else. Useful options: `--scope user|local`, `--dir <project>`, `--source <repo folder or owner/repo>`.

**2. Without the specflow command.** Run the two `claude plugin ...` lines above yourself, with the real path to the repo.

**3. Every project on this PC (user scope).** `specflow install --scope user`. It works everywhere, but the hooks then start a Node process on every tool call in every project (about 75 ms each, even outside specflow workspaces). Prefer project scope.

**4. One session only, nothing installed.**
```
claude --plugin-dir <path-to-the-specflow-repo>/plugins/specflow
```

**5. Terminal only.** Inside any workspace that has a `.specflow/` folder you can inspect and drive state without Claude: `specflow status`, `specflow next`, `specflow doctor`. (The AI roles themselves need Claude Code.)

After installing, check with `claude plugin list` (it should show `specflow@specflow-marketplace` enabled), and in a session type `/` to see the `specflow:` skills.

### Share it with a team without the Anthropic directory

Push the repository to GitHub (public, or private with git credentials set up), then each teammate runs:
```
claude plugin marketplace add mefeb169/specflow --scope project
claude plugin install specflow@specflow-marketplace --scope project
```
Committing a project's `.claude/settings.json` is only portable when the marketplace is declared from GitHub (`owner/repo`). A marketplace added from a **local folder** records an absolute path such as `D:\Work\...` that only exists on your machine. This is not the Anthropic directory and involves no review.

## Daily use

Talk to Claude Code at the workspace root:

| You say | What happens |
|---|---|
| "set up specflow here" | `specflow init` (asks first), scan of repos, Spec Kit check, workspace map |
| "let's work on the next feature" | the orchestrator reads state, picks the next *ready* feature and explains why, then routes to the right role |
| "status" / "what's blocked?" | answered from `specflow status` and `specflow next` output |
| "write the UX for F-001", "plan F-001", "implement F-001", "verify F-001" | the matching role skill, only if the feature is at the right stage |
| "do X first, it's urgent" | `specflow interrupt`: the current item is checkpointed and parked, an urgent P0 item is focused, conflicts on shared repos are listed. "Back to what we were doing" runs `specflow resume` |
| "continue" / "resume F-004" (new session) | the brief names the focus item and its handoff file (`specs/<dir>/handoff.md`); work continues from that, not from re-reading the artifacts |
| "also fix X" / "note that Y is broken" | `specflow issue add` (a bug, debt or chore item in the lite lane, linked to the current item); nothing grows the current scope silently |
| a question the team needs answered | `specflow question add`; the answer is logged as a decision and never asked again |
| "configure specflow" / first use | `specflow:setup`: a short interview (workflow, approvals, Git and PR policy, release, tests, models, team leads, update detail, graphify, milestone, slice size); answers go to `config.json` and the decision log, and are never asked twice |
| "deliver it" / "open the PRs" | `specflow deliver`: pushes the item's branch and opens (or updates) one PR per repo after verification passed; you merge. Delivery mode is set in setup |
| "release it" | `specflow release plan` writes `release.md` for you to follow; with release by AI on, the PM runs your configured steps one by one and asks before each risky one |
| "this is too big" | `specflow slice add`: slices are releasable pieces of a feature, planned in the lite lane |

Human gates (`spec`, `design`, `implement`, `acceptance`, `release`) show an approval prompt; no skill approves them for you. In `bypassPermissions`/`dontAsk` modes these actions are refused instead.

From a terminal:
```
sflow status            # all features, stage, what is next
sflow status F-001      # one feature: gates, tasks, evidence freshness
sflow next              # ranked ready features and what holds the others back
sflow doctor            # Node, git, Spec Kit, PowerShell policy, state validity
sflow brief             # the short summary Claude sees at session start
sflow focus F-004       # mark what you are working on; sflow interrupt "..." / sflow resume
sflow checkpoint F-004 --next "run verify"   # rewrite the handoff file
sflow issue list        # open bugs, debt and chores; sflow question list --open
```

## How the team works

The Claude session you talk to is the **Project Manager (PM)**. It is the only role that talks to you and the only one that approves gates. Every other role is a subagent with its own model and a fixed contract:

| Role | Agent | Default model | Does |
|---|---|---|---|
| product | `specflow:product` | opus | defines features, writes spec.md, runs the acceptance walkthrough |
| ux | `specflow:ux` | opus | ux.md for UI items (enabled when a repo has `ui: true`) |
| architect | `specflow:architect` | opus | plan, Repository Impact, tagged tasks, slicing |
| lead (optional) | `specflow:lead` | opus | plans one area and spawns one builder per repo |
| builder | `specflow:builder` | sonnet | implements one repo of one slice |
| verifier | `specflow:verifier` | sonnet | runs verification, spawns the independent reviewer |
| release (optional) | `specflow:release-manager` | sonnet | proposes release steps from your docs, checks migrations, writes rollback notes (never runs a deploy) |
| reviewer, profiler | `independent-reviewer`, `repo-profiler` | opus, haiku | read-only review and repo profiling |

The PM loop: `specflow dispatch <id> --json` names the agent, model and prompt for the item's stage; the PM spawns that agent, reads its short report, routes its questions (team questions to the role that owns the answer, user questions batched and checked against the decision log first), presents gates, and dispatches the next step. Roles never talk to the user: they write questions with `specflow question add` and checkpoint before returning. The hook denies `gate approve`, `init`, `upgrade --apply`, `install`, `uninstall`, `specify init`, `git push`, `gh pr create`, `gh pr merge`, `specflow deliver` and `specflow release run|verify` for subagents. Models come from `specflow team show`, so `specflow team set builder --model opus` takes effect at the next dispatch. `specflow:setup` asks about the team once, after `init`.

## Command reference

Every command accepts `--json`. `specflow help` prints this list.

| Command | What it does |
|---|---|
| `init [--root-is-repo]` | Create `.specflow/`, the managed block in `CLAUDE.md`, scan repos (never overwrites existing files) |
| `scan` | Re-scan repos, manifests, instructions, design-system evidence |
| `doctor` | Check Node, git, Spec Kit (style, version range), PowerShell policy, state validity |
| `validate` | Schema and reference checks of config and backlog |
| `upgrade [--apply]` | Dry run by default; `--apply` migrates the workspace to this version (additive, never overwrites your files) |
| `brief` / `status [id] [--all]` / `next [--all]` | Read-only views of state. `status` and `next` hide done and dropped items and honour the current milestone (urgent and bug items always show); `--all` disables the filter |
| `slice add <feature> --title s [--repos a,b --summary s --value s]` | Split a large feature: a lite-lane child that inherits repos, ui, priority, milestone and tags. A feature with slices is a container (no tasks.md of its own; `done` once all slices are done) |
| `issue add "<text>" [--kind bug\|debt\|chore --from id --repos a,b --priority P --milestone m]` / `issue list` | Record a problem outside the current scope as a lite-lane item |
| `intake <file> [--kind feature\|bug\|debt\|chore --title s]` | Turn a task file into one backlog item (refuses a file already imported) |
| `feature drop <id> --reason s` / `feature restore <id>` | Drop an item (leaves `next`, holds its dependents) or bring it back |
| `question add "<text>" [--feature id --to role]` / `question answer Q-n "<answer>"` / `question list [--open --feature id]` | Open questions; answering one also logs a decision |
| `rework start <id> --reason s` / `rework close <id>` | A rework round from verifying or accepted: back to implementing on the same branches, no new PR; moving to accepted closes it |
| `focus [id\|--clear]` / `interrupt "<text>" [--kind bug\|chore --repos a,b]` / `resume` | The active item, urgent interrupts (park, P0 item, conflict report) and coming back |
| `milestone [set <name>\|clear]` | The current milestone; `feature set <id> milestone <m>\|none` and `tags a,b` assign items |
| `checkpoint <id> [--note s] [--next s]` | Save a note and next step and (re)write the handoff file; stage changes, gate approvals and rework regenerate it too |
| `pref set <key> <value>` / `pref list` / `pref rm <key>` | Learned preferences (`.specflow/memory.json`) |
| `decision add "<q>" "<a>" [--feature id]` / `decision list [--feature id --limit n]` | Owner decisions, newest first |
| `lesson add "<text>" [--from id]` / `lesson list [--status s]` / `lesson promote\|reject L-n` | Recurring findings proposed as rules; only the owner promotes one |
| `team [show]` / `team set <role> [--model m --enabled true|false]` / `team set --communication short|normal|detailed` / `team set --workflow feature|task` | The team: roles, models, leads. `team set <role>` locks the role against `team generate` |
| `team lead add <name> --repos a,b` / `team lead rm <name>` / `team generate` | Leads per area (one repo belongs to at most one lead); `generate` re-derives defaults from the repos and suggests leads with 4+ repos |
| `dispatch <id> [--role r --repo name --question Q-n]` | The packet the PM uses to spawn a role: agent, model, repos still to do, and a prompt under 1,200 characters |
| `setup questions` / `setup apply --answers <file.json>` / `setup status` | The setup interview as data: questions with defaults from the workspace, validated answers (logged as decisions), what is answered |
| `repo set <name> [--test c --build c --lint c --purpose s --stack a,b --ui true\|false --confirm --deploy-order n]` | Registry of repos and their confirmed commands |
| `feature add --title s [--priority P2 --mvp --repos a,b --summary s --value s --risk r --ui true\|false]` | New backlog feature |
| `feature set <id> <field> <value>` / `feature link <id> <spec-dir>` / `feature activate <id>` | Edit fields, link a Spec Kit directory, point Spec Kit at the feature |
| `dep add\|rm <id> <dep> --type requires\|technical\|after\|related` | Typed dependencies (cycles rejected) |
| `blocker add <id> "<text>" --kind k` / `blocker resolve <id> <B-n>` | Record and clear blockers |
| `stage set <id> <stage> [--reason s]` | Advance one stage (entry criteria checked against real files and evidence) or move back with a reason |
| `gate approve <id> <gate>` / `gate required <id>` | Record a human approval / list required gates |
| `check tasks <id>` / `check size <id>` | Every task carries a registered `[repo:<name>]` tag / task and migration counts against the size limit (`config.slicing`, default 15 tasks and 1 migration; `feature set <id> size_waiver "<reason>"` waives it) |
| `deliver <id> [--dry-run]` / `deliver status <id>` / `deliver merge <id>` | After `accepted`: push the item's branch (never `--force`) and open or update ONE PR per repo with `gh`, only from fresh passing evidence at HEAD on a clean tree, never during a rework round. `status` refreshes PR states (all merged is recorded as evidence); `merge` only in `push-pr-merge` mode after the acceptance gate |
| `release step add <name> --run c [--repo r --kind k --approval ask or none --timeout s --post]` / `release step rm <name> [--post]` / `release step list` / `release set --by-ai true or false --require-merged true or false` | The release configuration: steps (deploy, migrate, restart, smoke, other) run in order from the repo folder, post-release checks, whether the AI team may release |
| `release plan <id>` / `release run <id> [--step name --again]` / `release verify <id>` | `plan` writes `release.md` (always); `run` (only with release by AI, PRs merged) runs steps without approval and stops at each step that needs it; `verify` runs the post-release checks at stage released |
| `branches create <id>` | Create the feature branch in each affected repo (refuses dirty repos; pushing is `deliver`) |
| `verify run <id> --repo r [--kind test\|build\|lint]` | Run the confirmed command and record evidence at the repo's HEAD |
| `evidence add <id> --kind k --result pass\|fail --note s` | Record review, security, manual, ux-review, release evidence |
| `install` / `uninstall` | Install or remove the plugin for a project (see above). Options: `--scope`, `--dir`, `--source`, `--fix-legacy`, `--remove-marketplace` |
| `--version`, `help` | Version and usage |

Lifecycle: `proposed > defined > specified > designed > planned > implementing > verifying > accepted > released > done`.

## Releasing with specflow

Delivery and release are separate, PM-only pipelines. Both ask for confirmation in the main session, are refused for subagents and in modes that cannot prompt, and never touch a repo that is not clean and verified.

1. Verification passes and the item is `accepted`. `specflow deliver F-001 --dry-run` shows what would be pushed and which PRs would be created or updated; `specflow deliver F-001` does it. The same feature branch and the same PR are reused after rework; a merged or closed PR is never reopened or duplicated.
2. You merge the PRs (or, in `push-pr-merge` mode, `specflow deliver merge F-001` after the acceptance gate). `specflow deliver status F-001` refreshes the PR states.
3. `specflow release plan F-001` writes `specs/<dir>/release.md`: PRs, migrations, steps, post-release checks and a rollback section. With release by AI off, that file is your checklist.
4. With release by AI on (`specflow release set --by-ai true`, or the setup interview), configure the steps once. A neutral example:

```
specflow release step add migrate-db --repo api --run "make migrate" --kind migrate
specflow release step add deploy-api --repo api --run "make deploy" --kind deploy --approval ask --timeout 900
specflow release step add smoke --run "./scripts/smoke.sh" --kind smoke --approval none
specflow release step add health --run "./scripts/health.sh" --post
```

   `specflow release run F-001` runs steps whose approval is `none` in order and stops at the first one that needs approval (migrate and restart steps always do); run `specflow release run F-001 --step deploy-api` after confirming. A failed step stops the run and is retried by the next run; passed steps are skipped unless `--again`. When every step passed: `stage set F-001 released`, `specflow release verify F-001`, then `stage set F-001 done`. The release role (`specflow:release-manager`) can propose the steps from your repos' docs; the PM shows them to you and adds only what you confirm.

## Updating, uninstalling, migrating

- **Update the plugin and command:** `git pull` in the repository, then in Claude `/reload-plugins` (or start a new session). Existing workspaces keep working; if a release needs a state migration, `specflow brief` and `specflow doctor` say so.
- **0.6.0:** `specflow upgrade --apply` adds `team`, `delivery`, `release`, `testing` and `tools` to `config.json` (additive; the ux role is enabled when a repo has `ui: true`). Nothing is rewritten on read; a 0.5.0 config works unchanged.
- **0.7.0:** `specflow upgrade --apply` extends `release` with `steps`, `post_release` and `require_merged` (keeping `by_ai`) and adds the `release` team role (enabled when `release.by_ai` is true). Additive only.
- **0.5.0 (schema v2):** a 0.4.0 workspace keeps working unchanged (missing fields are filled in memory, nothing is rewritten on read). `specflow upgrade` lists the additions, `specflow upgrade --apply` writes them (kinds, lanes, focus, questions, `.specflow/memory.json`, slicing and lane config) without changing any existing value.
- **Migrate a workspace after an update:** `specflow upgrade` (shows what would change), then `specflow upgrade --apply`.
- **Uninstall from a project:** `specflow uninstall` (add `--remove-marketplace` to drop the marketplace entry too). Your `.specflow/` and `specs/` folders are untouched.
- **Coming from 0.3 (`specflow-org`, `.sdlc/`):**
  1. In the repository, `git pull`, then `npm install -g .` if you want the global command.
  2. In each project that used the old plugin: `specflow install --fix-legacy`. This removes the old `specflow-org-marketplace` entry (Claude Code reuses a registration by folder path, so the old name would otherwise shadow the new one and the plugin would not be found), then installs `specflow@specflow-marketplace`.
  3. In each workspace that has a `.sdlc/` folder: `specflow upgrade --apply`. It renames `.sdlc/` to `.specflow/`, rewrites the managed block in `CLAUDE.md` and the `.gitignore` line. Your backlog, specs and evidence are kept. Until you migrate, the legacy folder keeps working and stays guarded by the hooks.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `specflow: command not found` | npm's global bin folder is not on PATH (`npm prefix -g`), or the global install was never run (`npm install -g .` in the repo) |
| `install` says the plugin "was not found in marketplace" or mentions `specflow-org-marketplace` | An old registration shadows the new one: `specflow install --fix-legacy` |
| `claude` CLI not found | Install Claude Code, or set `SPECFLOW_CLAUDE_BIN` to its path |
| Spec Kit steps fail on Windows with "running scripts is disabled" | PowerShell policy: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or re-init Spec Kit with `--script sh` |
| Guards or the session brief never appear | Hooks need `node` on PATH and **fail open** without it. Check `node --version` (18+) and that the plugin is enabled in this project (`claude plugin list`) |
| "Refused: permission mode ... cannot show an interactive prompt" | Gate approvals, `init`, `branches create`, `upgrade --apply`, install/uninstall and destructive commands need a mode that can ask (default, acceptEdits or auto) |
| `stage set` refuses | It prints exactly which criteria failed (open clarifications, missing tags, stale evidence, missing review, ...) |

More detail on what was verified and what was not: [docs/runtime.md](docs/runtime.md).

## Status

Public beta (0.7.0). Tested on Windows with Node 26 and Spec Kit 1.2.0. The CI workflow covers Ubuntu, macOS and Windows on Node 18 and 22 but has not run yet; macOS/Linux and Node 18 are untested. Known gaps are in the [plugin README](plugins/specflow/README.md).

## Development

`npm test` runs the node test suite (no dependencies). `claude plugin validate .` checks the manifests. Behavioral evals: [plugins/specflow/evals](plugins/specflow/evals/README.md). Planning history is in [tasks/](tasks/).

## More

[Plugin README](plugins/specflow/README.md) · [runtime notes](docs/runtime.md) · [architecture](docs/architecture.md) · [end-to-end run report](docs/e2e-report.md) · [security](SECURITY.md) · [changelog](CHANGELOG.md)

## License

MIT, see [LICENSE](LICENSE). The bundled `frontend-design` skill is Anthropic's, under Apache-2.0 (see the plugin's [NOTICE](plugins/specflow/NOTICE)). "SpecFlow" was also the name of a .NET BDD framework (now Reqnroll); this project is unrelated to it.
