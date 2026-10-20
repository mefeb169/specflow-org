# Task 5 Plan: review from Wali App use, and the next version of specflow

Source request: [task-5.md](task-5.md), the owner's review after using specflow 0.4.0 on Wali App (`D:\Work\Wali_app`).
State reviewed: specflow `3daa51e` (0.4.0). Wali App: `.specflow/` (127 features, 4 spec folders), the three repos' git history, the Claude memory notes and the owner's messages from the 16 to 20 October sessions.
Audience: the owner (Parts A to C and the questions in Part E). Part D is the build spec, refined phase by phase for the implementing agent once Part E is answered.
Status: **Decisions locked (Part E).** Next: detailed build spec per phase (Part D), starting with Phase 1.

---

# Part A: The review notes in technical terms

The technical version in task-5.md (sections A to J) is accurate and is kept as the requirement set. Below, each raw note is mapped to it, so nothing is lost. Where I had to interpret a note, that is marked *(interpretation)*.

| Raw note | Technical requirement | Section |
|---|---|---|
| Code conventions; product designing, naming | Per-project naming, coding and architecture conventions, discovered, recorded and enforced in build and review | E |
| Plain English with the user, adapted to their interactions | The PM speaks plain English and adjusts detail level to the user's replies | H |
| Use graphify as RAG | Use the AST-only code graph (when installed) as the retrieval layer for code context, instead of reading files broadly | G |
| Steps produced by the TPM/lead, followed by the team | Plans are produced at the lead level and executed by implementers without re-planning | B, C |
| Product must be very clear about requirements | Product role produces unambiguous, testable requirements; ambiguity is escalated, never invented | D |
| Turn requirements into features by roles, tags, phases | Backlog items carry role, tag, phase/milestone metadata; requirements are decomposed automatically | C |
| Plan approved by the user | Plan approval is a gate (configurable) | C, I |
| Configure itself by asking questions; always ask on confusion | Setup interview + persisted preferences; targeted questions on ambiguity | A, H |
| Testing side by side with development; unit tests where possible | Test tasks are interleaved with implementation tasks; unit tests preferred | C, F |
| DB analyzer, DB normalizer | Database engineering role: schema analysis, normalization review, migration safety | E |
| Third-party suggestions | Research role evaluates libraries/services against requirements | D, E |
| User may interrupt with an urgent/simple task; check the dependency map; keep the standard flow | Interrupt queue: triage against the dependency graph, park and checkpoint the current feature, resume afterwards | C, H |
| Learn from user decisions; comment code for AI; avoid repeated mistakes | Decision and lessons log at the right scope; review findings turned into rules (with approval); useful, not noisy, code comments | E, G, I |
| A separate way to improve the existing system | An audit-and-improve pipeline separate from new feature delivery | E, F |
| Pipelines: development, publishing, testing | Declared pipelines with inputs, outputs, approvals | F |
| Opus plans and takes business decisions; only implementation by Sonnet | Model policy per role, configurable, verified against what the tools support | D |
| Feature by feature; each feature small and releasable | Features are sliced into small independently releasable increments | C, J |
| Ask user about future development | Roadmap questions at planning points, not every task | H |
| Status and the ongoing task saved; work regardless of session history; memory efficient; shorter sessions | Checkpoint/handoff state on disk; brief at session start; compact artifacts | G |
| Easy to use; adapt to user interactions | Minimal commands; defaults learned from previous answers | A, H |
| New issues while coding go to the team | Issue intake and triage; no silent scope growth | C, H |
| Stuck in a loop of moving forward, pushing to GitHub and small PRs | Delivery actions tied to lifecycle transitions; review fixes handled inside the feature, not as extra PR rounds | F |
| An agent with clear product knowledge that asks the user on confusion | PM / product-knowledge role answers team questions from the knowledge base and escalates the rest | B |
| How an ongoing project is handed over to a new team | Every feature and the project are understandable from files alone | I |
| Audit current UI/UX, features, development; ask about inconsistencies | Audit pipeline producing findings for user decision | E |
| Everything vibe coded by AI; human takes very specific decisions | Default autonomy: AI executes, human decides at gates and on escalations only | H, I |

---

# Part B: What Wali App showed (evidence)

These findings come from Wali App's real state, not assumptions. They explain most of the review notes.

| # | Finding | Evidence | Requirement hit |
|---|---|---|---|
| 1 | **Features are far too big.** F-004 (X-6) absorbed nine product features, had 75 tasks, and produced about 200 KB of artifacts (spec 28 KB, tasks 30 KB, ux 35 KB, verification 60 KB). Every role re-reads these. | `specs/002-x-6-auth-user-management/` | C (small, releasable), G, J |
| 2 | **The "push and PR loop" is rework outside the lifecycle.** After review, F-004 needed `fix/f-004-review-findings`, `-walkthrough`, `-owner-decisions`, `-reset-channel`, `-a11y-modal` branches, each with its own PR in up to three repos, merged into `usama` *before* acceptance. specflow has no concept of a rework round, so each round became a new push/PR cycle driven by "PR merged, move forward". | backend PRs #5 to #10, web-ui #6 to #11, mobile #1 to #5 | F, C |
| 3 | **The real delivery flow is not in specflow.** Wali's flow is feature branch, PR into `usama`, owner PR to `main`, deploy by ssh + pm2, ask before a backend restart. That lives in CLAUDE.md and Claude memory; specflow only knows "never push". | Wali `CLAUDE.md` › Deploying; memory `feedback-branch-usama-pr-only`, `feedback-create-prs-with-gh` | F, I |
| 4 | **Progress lived in Claude memory, not specflow.** The detailed F-004 status (what's pending, owner decisions, release steps) was kept in `memory/f-004-auth-redesign-state.md`. specflow's state only holds the stage. A new session without that memory would lose the thread. | Wali memory folder | G, I |
| 5 | **Very long sessions.** One session ran two days, produced a 73 MB transcript and ran out of context once. Nothing in specflow encourages ending a session at a safe point. | session `f275a8dd…` | G, J |
| 6 | **Preferences are scattered.** yopmail for test emails, work only on `usama`, PRs via gh as mefeb169, graphify AST-only, "live server has demo data": all Claude memory, none in specflow config. | Wali memory folder | A, G |
| 7 | **No model policy.** All roles ran in one main context; implementation subagents were spawned ad hoc (one stalled for 600 s). | session log | D, J |
| 8 | **Role skills run inside the main context.** Product, architect, build and verify all load into the same conversation, so context grows with every stage. Only the reviewer and profiler are isolated. | `plugins/specflow/skills/*` | B, G, J |
| 9 | **The owner already tried a PM/team model** (Wali task 6: backend-dev, web-dev, mobile-dev, reviewer agents) and replaced it with specflow for control. The new team model has to keep specflow's enforcement, not go back to free-form agents. | memory `specflow-replaces-pm-team-model` | B |
| 10 | **Double bookkeeping.** The owner still writes `tasks-new/task-N.md`, which becomes a thin index pointing at specflow. Work outside specflow (task 9 lint cleanup) is invisible to it. | Wali `CLAUDE.md` › Feature tasks | C, H |
| 11 | **126 features seeded at once, all `proposed`**, with no milestones or phases. `next` ranks them, but there is no "current milestone" to keep scope small. | `.specflow/backlog.json` (189 KB) | C |
| 12 | **What worked:** gates, evidence at HEAD, independent review (it caught an account-takeover chain), blockers for review findings, the short session brief (547 bytes), `verify run`. These stay. | F-004 blockers B-1 to B-6 | keep |

---

# Part C: Proposed design

## C1. The main idea: the session is the Project Manager, the roles are a team of subagents

Today the role skills run in the main conversation. Proposal:

- **The main session (Opus) is the PM.** It is the only role that talks to the user. It reads the brief, picks work, batches questions, presents gates.
- **Each role becomes a subagent** with its own model, tools and a fixed input and output contract: `product`, `planner` (research), `architect`, `ux`, `db-engineer`, `builder` (one run per repo and slice, Sonnet), `verifier`/`independent-reviewer`, `auditor`, `release-manager`. Claude Code agent files support a `model:` field, so the Opus/Sonnet split is enforceable per role. This must be verified on the installed Claude Code version before Phase 2 relies on it.
- **Roles talk through files, not through the user.** A role that hits a question writes it to the feature's `questions.md` with who should answer (product knowledge, architect, user). The PM routes: team questions go to the role that owns the answer; only unanswered or business questions reach the user, batched. This gives "team members answer each other" without uncontrolled agent chatter.
- **Enforcement stays where it is:** CLI for state, hooks for guards and gates. Subagents call the same CLI.

Trade-off, stated honestly: subagents keep the main context small, but each one starts cold and re-reads its inputs, so the total token count only drops if the inputs are small. That is why C3 (compact context) is a prerequisite, not an extra.

## C2. Setup that configures itself

`specflow:flow` on a new workspace runs a short plain-English interview after the scan (about 8 questions, each with a default derived from the scan), and stores the answers in `.specflow/config.json` (machine-readable) and `.specflow/preferences.md` (readable). Example questions:

- Work feature by feature, or task by task?
- Which approvals do you want: spec, plan, implementation, acceptance, release?
- Who handles Git: AI commits only / AI pushes and opens PRs / AI also merges? Which target branch?
- Should the AI team also release and deploy? If yes: how (commands, servers, what needs your OK)?
- Test policy: unit tests required for new logic? Which test data rules (e.g. yopmail)?
- Which model plans and which implements?
- How much detail do you want in updates: short / normal / detailed?

The team is configured from the stack: the builder gets one profile per repo (NestJS, React, Flutter), the db-engineer is enabled only when the scan finds migrations or an ORM, ux only when a repo has `ui: true`.

Later answers update the preferences instead of being asked again ("learned preferences", see C5).

## C3. Lean context and session continuity

- **Feature handoff file** `specs/<feature>/handoff.md`, at most about 60 lines, rewritten (not appended) at every stage change and on `PreCompact`/`Stop`: goal, current stage, done, next step, open questions, decisions, blockers, branch and HEAD per repo. The brief links it. This replaces feature status in Claude memory.
- **Artifact budgets.** Role contracts set size targets (spec about 8 KB for a slice, verification as a summary table with evidence kept in `.specflow/cache/evidence`). Roles read the handoff and only the sections they need.
- **Code retrieval:** graphify query (AST-only, never its AI modes) when installed, otherwise grep. A builder gets a list of files to read from the plan, not the whole repo.
- **Session boundaries:** the PM suggests ending the session at natural checkpoints (after a gate, after a slice), because state is on disk. "Resume F-004" in a new session works from the brief + handoff.
- **Split backlog:** `backlog.json` keeps identity, stage, deps; long text (summary, value, blockers history) moves to per-feature files, so status commands and the brief stay small as the backlog grows.

## C4. Work items, slicing, issues and interrupts

- **Slices:** a feature above a size threshold (configurable, proposed: more than about 15 tasks or more than one repo with migrations) must be split into slices at planning, each one releasable and with its own acceptance. F-004 would have been about five slices.
- **Milestones:** backlog items get `milestone` and `tags` (role, area, phase). `next` only picks from the current milestone unless asked.
- **Issues:** new item kinds `bug`, `debt`, `scope-change`, `question`, recorded with `specflow issue add`. Findings from review that belong to the current slice stay in the slice as a rework round (same branch, no new PR); everything else becomes an issue for triage. No silent scope growth.
- **Interrupts:** "Do X first" → the PM records it, checks its dependencies and conflicts with the active slice (repos, files, branches), writes the active feature's handoff, does X on its own branch, then resumes. Small fixes get a light lane (issue + branch + verify, no spec), which also covers the work done outside specflow today.
- **Intake:** the owner's `task-N.md` files become an intake: `specflow intake <file>` turns a task file into a feature, slice or issue, so there is one record instead of two.

## C5. Knowledge, decisions and learning

- `.specflow/knowledge/`: one short page per delivered feature (what it does, where the code is, key decisions, links), written by the verifier at `done`. This is the PM's product knowledge and what a new team member or a new session reads.
- `.specflow/decisions/`: keeps ADRs; adds a light `decisions.md` log for owner decisions (date, question, answer, scope: project or feature), so answered questions are never asked again.
- `.specflow/lessons.md`: recurring review findings become proposed rules ("guard every public route with RolesGuard"). The PM asks the owner before turning a lesson into a convention, matching the existing Wali rule "ask before adding to CLAUDE.md".
- Code comments: the builder adds comments only where the reason is not obvious from code (business rule, workaround, cross-repo contract), citing the spec ID. No narrative comments.

## C6. Pipelines

Pipelines are declared in config, each with inputs, outputs, approvals and on-failure behavior. Proposed set:

| Pipeline | Trigger | Output | Default approval |
|---|---|---|---|
| feature | backlog item reaches `defined` | released slice | gates as configured |
| fix (light lane) | bug / small task | merged fix + evidence | owner merge or none |
| delivery | slice passes verify | branches pushed, one PR per repo per slice (gh), merge per policy | as configured in setup |
| release | acceptance gate | deployed build + post-release evidence | release gate |
| audit | on request or every N slices | audit report → issues | owner decides each finding |
| docs | slice `done` | knowledge page, changelog | none |

**Fix for the loop:** delivery runs once per slice, after verify passes. Review findings are fixed on the same branch before any PR is opened. A second PR round only happens for an owner request after review, and it is recorded as a rework round on that slice.

## C7. New roles

- **planner / researcher:** before planning a slice, checks prior decisions, existing code, and (when the slice is non-trivial) alternatives and third-party options; writes `research.md`, reused later instead of researching again.
- **db-engineer:** schema analysis, normalization and integrity review, migration safety (rehearsal on a copy, rollback note). Recommends; schema changes still go through the slice and its gates.
- **auditor:** on request, reviews UI/UX consistency, code maturity ("AI-ness": duplication, dead code, over-abstraction, inconsistent patterns), test gaps, and process. Produces findings; the owner chooses which become issues.
- **release-manager:** runs the delivery and release pipelines from the configured steps (Wali: PR into `usama`, deploy by ssh + pm2, ask before backend restart).

---

# Part D: Phased roadmap (each phase is a release, dogfooded on Wali App)

Ordered by value per effort. Each phase ships as its own versioned release with passing tests and fixture checks, and the next phase follows straight after (decision 11).

| Phase | Version | Content | Addresses |
|---|---|---|---|
| 1 | 0.5.0 | **Continuity and lean context:** handoff.md + PreCompact/Stop checkpoint, preferences.md and decisions log, artifact budgets, split backlog, milestones/tags, slicing rule in architect, issues + rework rounds + interrupt lane, `intake` | Findings 1, 2, 4, 5, 6, 10, 11 |
| 2 | 0.6.0 | **Team model:** roles as subagents with model policy, PM-only user contact, questions.md routing, setup interview, stack-based team config | Findings 7, 8, 9 |
| 3 | 0.7.0 | **Delivery and release pipelines:** configurable git/PR/merge/deploy, release-manager, post-release check | Findings 2, 3 |
| 4 | 0.8.0 | **Improve the existing system:** auditor, db-engineer, planner/researcher, knowledge pages, graphify retrieval | Section E notes |
| 5 | 0.9.0 | Upgrade path from schema v1 to v2 (tested on fixtures; the owner installs it on Wali), evals for each new behavior, docs | all |

Per phase, before building: a detailed build spec section (like task-3 Part B) is added to this file, with acceptance criteria and tests. Phase 1 is detailed first.

## D1. Phase 1 outline (superseded by the build spec in Part F)

1. Schema v2 + migration: per-feature files, `milestone`, `tags`, `kind` (feature, slice, bug, debt, scope-change, question), `parent` (slice → feature), rework rounds.
2. CLI: `checkpoint <id>` (writes handoff.md from state + a short note), `issue add|list|triage`, `slice add <feature>`, `interrupt`, `intake <file>`, `pref set|list`, `decision add|list`, `milestone set`.
3. Hooks: `PreCompact` and `Stop` remind/write the checkpoint; brief includes the active handoff (still under about 1 KB) and current milestone.
4. Skills: architect enforces the slicing threshold; verify sends in-slice findings back as a rework round, out-of-slice ones as issues; flow handles interrupts and session-end suggestions; budgets in role-contract.md.
5. Tests + evals: slicing, rework round without a new PR, interrupt and resume from a fresh session.
6. Check it on a fixture workspace modelled on Wali (three repos, an oversized feature, an interrupt). Wali itself is not touched.

---

# Part E: Questions for the owner

Each has my recommendation. Answers go into "Decisions locked" below.

1. **Scope of task 5.** Plan all five phases now but build only Phase 1, then review on Wali before Phase 2? *(Recommended.)* Or build several phases in one go?
2. **Team hierarchy depth.** Option A: PM + role subagents, where the "leads" are the architect (per slice) and the builder per repo. Option B: an explicit lead layer (backend lead, web lead, mobile lead) between architect and builders. A costs fewer tokens; B is closer to a real org. *(Recommend A; add leads only for products with many repos.)*
3. **Model policy default.** PM, product, planner, architect, auditor on Opus; builder and routine checks on Sonnet; scan/profiler on Haiku. Is that the split you want, and do you run the main session on Opus?
4. **Git and PR policy default** (for the setup interview, and for Wali): AI commits on the feature branch, pushes and opens **one PR per repo per slice** into the target branch after verify passes; you merge. Or should the AI also merge into `usama` after the acceptance gate?
5. **Release autonomy for Wali.** Should the release-manager deploy (ssh + pm2) after the release gate, asking only before backend restarts? Or do you keep deploys manual?
6. **Slice size.** Is "about 15 tasks, releasable on its own, at most one migration" the right threshold, or do you have a different measure (for example "one day of work")?
7. **Your task files.** Keep writing `tasks-new/task-N.md` and let `specflow intake` convert them? Or talk to the PM directly and stop writing task files for features?
8. **Spec Kit weight.** Spec Kit's artifacts are large. Use full Spec Kit for features and a lite path (short spec + tasks, no ux/research files) for small slices and fixes? *(Recommended.)*
9. **Learning.** Record your answers to questions automatically in the decisions log (no prompt), and ask only before turning a lesson into a project rule? *(Recommended.)*
10. **graphify.** Optional retrieval when installed (AST-only), or a required dependency?

## Decisions locked
Answered 2026-10-20.

| # | Topic | Decision |
|---|---|---|
| 1 | Scope | Build **all five phases** in this task. |
| 2 | Team depth | **Configurable.** Default: PM + roles (the architect leads each slice, one builder per repo). The setup interview can turn on a lead layer (for example backend, web and mobile leads) for products with many repos. |
| 3 | Models | PM, product, planner, architect and auditor on **Opus**; builders and routine checks on **Sonnet**; repo scans on Haiku. Configurable per role. |
| 4 | Git policy default | The AI commits on the feature branch, pushes, and opens **one PR per repo per slice** with gh into the configured target branch once verify passes. **The owner merges.** Review fixes stay on the same branch before the PR. |
| 5 | Release and deploy | **Asked in the setup interview.** If the owner wants the AI to release and deploy, setup configures the release team (release manager + deploy steps, approvals such as "ask before backend restart"). Otherwise the release pipeline only prepares notes and commands. |
| 6 | Slice size | Split when a slice has more than **about 15 tasks or more than one migration**. Each slice is releasable on its own. Configurable. |
| 7 | Intake | **Both:** talk to the PM directly, or write a task file that `specflow intake` turns into a backlog item. One record either way. |
| 8 | Spec Kit | **Full Spec Kit for features; a lite path** (short spec + tasks, no ux or research files) for small slices and fixes. |
| 9 | Learning | Owner answers are logged automatically in the decisions log. Turning a lesson into a project rule needs the owner's OK. |
| 10 | graphify | **Asked in the setup interview** (install and use or not). When used: AST-only, never its AI modes; fall back to grep. |
| 11 | Checkpoints | **One release per phase** (0.5.0 to 0.9.0): committed, versioned, tests passing, short report after each phase. **Updated 2026-10-20: stop after Phase 1**; Phase 2 starts only when the owner says so. |
| 12 | Wali App | **Reference only.** Wali is evidence for the design, not a migration target in this task. The owner installs the new version there. Phase 5 drops "migrate Wali" and keeps the upgrade path (schema v1 to v2) and its documentation, tested on fixtures. |

---

# Part F: Phase 1 build spec — 0.5.0 "Continuity and lean context"

Written for the implementing agent (Sonnet). Self-contained: read this part, then the files it links. Do not re-ask decisions in Part E.

## F0. Rules for this build
- Work on branch `task-5` (create it from `main`). Commit after each numbered step (F1 to F10) with a conventional message and the attribution line. Never push.
- Zero npm dependencies. Node >= 18. Match the existing code style: ES modules, small pure functions in `lib/`, command handlers in `commands/`, `emit(data, text)` for every output so `--json` works, `UserError` for user mistakes.
- `npm test` must pass after every step. Add tests in a new file [tests/phase1.test.mjs](../tests/phase1.test.mjs) using the helpers in [tests/make-fixture.mjs](../tests/make-fixture.mjs) (`makeFixture`, `cli`, `hook`, `w`). Do not weaken existing tests; adjust them only where the behavior change below makes them wrong, and say so in the log.
- **Backward compatibility:** a 0.4.0 workspace (schema_version 1, no new fields) must keep working for every read and write command before `upgrade --apply`. Do this by normalizing in memory in [state.mjs `load()`](../plugins/specflow/scripts/lib/state.mjs) (fill missing feature fields with defaults), never by rewriting files on read.
- Change in scope vs. Part C3: the split of `backlog.json` into per-feature files is **dropped from Phase 1**. The AI never reads `backlog.json` directly (it is guarded); the token cost is in CLI output, which F6 reduces. Revisit in Phase 5 only if CLI speed suffers.

## F1. Data model (schema v2) and normalization
Feature record, new fields (defaults in brackets):
- `kind`: `feature | slice | bug | debt | chore` [`feature`]
- `lane`: `full | lite` [`full` for feature; `lite` for slice, bug, debt, chore]
- `parent`: feature id or null [null] (slices only)
- `milestone`: string or null [null]
- `tags`: string[] [[]]
- `origin`: `{ from: <id>|null, source: <relative file>|null, note }` or null [null] (issues, intake)
- `rework`: `[{ n, reason, at, closed_at }]` [[]]
- `size_waiver`: string or null [null]
- `checkpoint`: `{ at, note, next }` or null [null]
- `dropped`: `{ at, reason }` or null [null]

Backlog top level: `focus` (id or null), `parked` (id[]), `next_question` (int, starts 1), `questions` (see F5).
Config: `current_milestone` [null], `slicing: { max_tasks: 15, max_migrations: 1 }`, `lanes: { lite: { gates: ['acceptance', 'release'] } }`.

New file `.specflow/memory.json` (created on demand): `{ schema_version: 2, preferences: { <key>: { value, at, by } }, decisions: [{ id: 'D-n', at, question, answer, scope: 'project'|<feature id>, by }], lessons: [{ id: 'L-n', at, text, from, status: 'proposed'|'promoted'|'rejected' }] }`. Load it in `ctx.memory` with a `saveMemory()` like the others.

Put defaults in one place (`lib/lifecycle.mjs`: `KINDS`, `LANES`, `defaultLane(kind)`, `SLICING_DEFAULTS`, `LITE_GATES_DEFAULT`). [validate.mjs](../plugins/specflow/scripts/lib/validate.mjs) accepts schema_version 1 **or** 2 and checks the new fields (known kind, lane, parent exists and is kind `feature`, slices have a parent, focus/parked ids exist).

Guard ([guard.mjs](../plugins/specflow/scripts/lib/guard.mjs)): `memory.json` is protected exactly like `backlog.json`/`config.json` (Edit/Write deny, shell-write ask). Add a test.

## F2. Upgrade migration `0.5.0`
Add to [migrations.mjs](../plugins/specflow/scripts/lib/migrations.mjs): writes the normalized feature fields and top-level keys, config defaults, sets both `schema_version` to 2, creates `memory.json` if missing. Additive: never changes an existing value. `upgrade --apply` must save the backlog too (today it only saves config; check [upgrade.mjs](../plugins/specflow/scripts/commands/upgrade.mjs)). Bump the version to **0.5.0** in [plugin.json](../plugins/specflow/.claude-plugin/plugin.json) and [package.json](../package.json), and the init templates to schema 2.
Test: a v1 fixture (write a 0.4.0-shaped backlog) → all read commands work → `upgrade` dry run lists the changes → `--apply` → `validate` passes and existing values are untouched.

## F3. Lanes and gates
- `requiredGates` ([gates.mjs](../plugins/specflow/scripts/lib/gates.mjs)): a `lite` item requires only `config.lanes.lite.gates` (filtered by autonomy as today).
- Entry criteria for `lite`: `specified` needs spec.md (short is fine); `designed` does **not** require plan.md or ux.md (if plan.md exists and repos > 1, Repository Impact is still required); everything from `planned` on is unchanged (tasks tagged, branches, evidence at HEAD, review). `ux-review` evidence is still required for UI items in the lite lane (UI regressions are the common case for small fixes).
- `feature set <id> lane full|lite` (allowed only before `implementing`).

## F4. Slices and the size rule
- `slice add <parent> --title s [--repos a,b] [--summary s] [--value s]`: creates `kind: slice`, `lane: lite`, `parent`, inheriting repos (unless given), ui, priority, mvp, milestone, tags from the parent. Ids come from the same `F-` sequence.
- Size rule, entry check for `planned` (all kinds): count task lines in tasks.md and migration tasks (task lines matching `/migrat/i`). If tasks > `config.slicing.max_tasks` or migration tasks > `max_migrations`, fail with: `too large (N tasks, M migrations; limit X/Y): split into slices (specflow slice add <id> ...) or record a waiver (specflow feature set <id> size_waiver "<reason>")`. A non-empty `size_waiver` skips the check. `specflow check size <id>` prints the counts.
- A feature that has slices (any child with `parent === id`, not dropped) is a container: its own forward moves beyond `planned` are refused ("work happens in its slices: …"); it needs no tasks.md to reach `planned`; `stage set <id> done` is allowed **from any stage** once every non-dropped child is `done` (exception to one-step moves; log it in history).
- `status <id>` of a container lists its slices with stage; `status` of a slice shows its parent.

## F5. Issues, questions, drop, intake
- `issue add "<text>" --kind bug|debt|chore [--from <id>] [--repos a,b] [--priority P] [--milestone m]`: creates a lite backlog item, `stage: proposed`, `origin.from`. Title = text truncated to 80 chars; summary = full text. Output the new id.
- `issue list` = backlog items of kind bug, debt or chore that are not done or dropped (id, kind, priority, stage, from).
- `feature drop <id> --reason s` sets `dropped`; dropped items are excluded from `next`, from default `status` and from deps checks (a dep on a dropped item holds the dependent: "dependency X was dropped"). `feature restore <id>` clears it.
- `question add "<text>" [--feature id] [--to user|product|architect|ux|build|verify]` → `Q-n`, open. `question answer Q-n "<answer>" [--by user|<role>]`: closes it **and** appends a decision (`decisions` in memory.json, scope = the question's feature or `project`). `question list [--open] [--feature id]`.
- `intake <file> [--kind feature|bug|debt|chore] [--title s]`: title = first `#` heading (fallback: file name); summary = the first non-heading paragraph (up to 400 chars); `origin.source` = file path relative to the root. Refuse a file already used as a source by another item (print that id).

## F6. Focus, interrupts, milestones and lean views
- `focus <id>` sets `backlog.focus` (refuse done/dropped). `focus` with no id prints it. `focus --clear`.
- `interrupt "<text>" [--kind bug|chore] [--repos a,b]`: (1) if a focus exists, checkpoint it (F7) and push it on `parked`; (2) create the item as `issue add` would, with priority P0 and tag `urgent`; (3) focus it; (4) print **conflicts**: other in-flight items (stage implementing or verifying) whose repos overlap, with their recorded branches and whether that repo is dirty now. It never switches branches itself.
- `resume`: pops the last parked id, focuses it, prints its handoff path and checkpoint `next`. With nothing parked, says so.
- `milestone set <name>` / `milestone clear` (config.current_milestone); `feature set <id> milestone <m>|none`; `feature set <id> tags a,b`.
- `next`: when a current milestone is set, rank only items in that milestone plus any `urgent`-tagged or kind `bug` items; `--all` disables the filter. The output header says which filter is active.
- `status` (list): hide done and dropped items by default, apply the milestone filter like `next`; `--all` shows everything. Add a `kind` column. Keep rows to one line.

## F7. Checkpoint and handoff
- `checkpoint <id> [--note s] [--next s]`: stores `checkpoint = { at, note, next }` (keep the previous note/next when a flag is absent) and (re)writes the handoff file: `specs/<spec dir>/handoff.md`, or `.specflow/handoff/<id>.md` when there is no spec dir. Pure render function in a new `lib/handoff.mjs`, at most about 60 lines:
  ```
  <!-- generated by specflow checkpoint; do not edit, run `specflow checkpoint <id> --note/--next` -->
  # Handoff: F-004 Auth redesign (slice of F-002) — stage implementing, rework round 2
  Updated: <iso>   Lane: lite   Milestone: m1
  ## Next step
  <checkpoint.next or the CLI's nextAction>
  ## Note
  <checkpoint.note>
  ## Progress
  tasks 12/15; gates approved: spec, implement; pending: acceptance
  ## Repos
  | repo | branch | HEAD | last verified | fresh |
  ## Open blockers / Open questions / Recent decisions (max 5 each)
  ## Artifacts
  links to spec.md, plan.md, tasks.md, verification.md that exist
  ```
- `stage set` (forward and back), `rework start/close`, `gate approve` and `interrupt` regenerate the handoff of that item automatically (no note change).
- Brief ([render.mjs `brief()`](../plugins/specflow/scripts/lib/render.mjs)): add a `Focus:` line (id, title, stage, handoff path, checkpoint `next`), a `Parked:` line, `Milestone:`, one `Preferences:` line (`key=value; …`, max 8, truncated), and counts of open questions. Keep the whole brief under 1,500 characters for a workspace like Wali (test with 120 features). In-flight list: focus first, max 5.
- Hooks: add `PreCompact` to [hooks.json](../plugins/specflow/hooks/hooks.json) running a new `scripts/hooks/pre-compact.mjs` that regenerates the focus item's handoff (no output needed, never fails the session). The `Stop` hook also regenerates the focus handoff when the focus item's last history entry is newer than its handoff file. Both are no-ops outside a workspace and must finish fast (no git calls beyond what the handoff needs).

## F8. Rework rounds
- `rework start <id> --reason s`: allowed from `verifying` or `accepted`; moves the item back to `implementing` (same gate clearing as a backward `stage set`), appends `{ n, reason, at, closed_at: null }`, keeps branches. Output tells the agent: fix on the same branch(es); do not push or open a new PR for the rework; re-run verify.
- Moving forward to `accepted` closes the open round (`closed_at`). `status <id>` and the handoff show `rework round n` while open and the total count.
- `verify` skill uses `rework start` instead of `stage set implementing --reason`.

## F9. Memory commands
- `pref set <key> <value>` / `pref list` / `pref rm <key>` (`by: user` unless `--by role`).
- `decision add "<question>" "<answer>" [--feature id] [--by user]` / `decision list [--feature id] [--limit n]` (newest first, default 20).
- `lesson add "<text>" [--from id]` / `lesson list [--status s]` / `lesson promote L-n` / `lesson reject L-n`. Promote only changes status; writing the rule into CLAUDE.md or conventions stays an AI edit that the instruction-file guard already asks about.
- Update `HELP` in [specflow.mjs](../plugins/specflow/scripts/specflow.mjs) for every new command.

## F10. Skills, docs, release
Skills (keep each SKILL.md near its current size; prefer short rules over prose):
- [_shared/lifecycle.md](../plugins/specflow/skills/_shared/lifecycle.md): kinds, lanes and their gates, slices and the size rule, rework rounds, focus/parked.
- [_shared/role-contract.md](../plugins/specflow/skills/_shared/role-contract.md): add universal rules: artifact budgets (spec for a slice about 8 KB; verification.md a summary table, raw output stays in evidence); new problems found outside the current item's scope become `issue add --from <id>`, never silent scope growth; questions go to `question add`, answers are logged; call `checkpoint <id> --next "..."` when you hand back.
- [flow](../plugins/specflow/skills/flow/SKILL.md): set `focus` when work starts; urgent requests use `interrupt`, then `resume`; read the handoff on resume instead of re-reading artifacts; before asking the user, check `decision list`/`pref list` and never re-ask; batch user questions; record answers with `question answer` / `decision add` / `pref set` without prompting (decision 9); suggest ending the session after a gate or a finished slice ("state is saved; a new session continues from the handoff"); intake for task files.
- [architect](../plugins/specflow/skills/architect/SKILL.md): apply the size rule while planning; when a feature is too large, propose slices (each releasable, own acceptance) in plan.md under `## Slices`, create them with `slice add`, and plan each slice in the lite lane; never request a waiver without a reason the user approved.
- [verify](../plugins/specflow/skills/verify/SKILL.md): findings inside the item's scope → `rework start`; outside it → `issue add --from`. Recurring finding types → `lesson add`.
- [build](../plugins/specflow/skills/build/SKILL.md): `checkpoint --next` after each repo; during a rework round no push or PR; code comments only where the reason is not obvious from the code (business rule, workaround, cross-repo contract), citing the spec id.
- [product](../plugins/specflow/skills/product/SKILL.md): `intake`, issues, milestones.
- Workspace [claude-md-block.md](../plugins/specflow/templates/workspace/claude-md-block.md): add "Feature progress lives in specflow (handoff files, `specflow checkpoint`), not in assistant memory" and the focus/interrupt rule. Keep it short.

Docs: README command reference and "Daily use" rows (interrupt, resume, checkpoint, issue, questions), CHANGELOG `[0.5.0]`, a short note in [docs/architecture.md](../docs/architecture.md) on the new state file and handoff. One eval case `resume-from-handoff` (fixture: a focused feature with a handoff and a parked item; prompt "continue"; graders: the agent names the focus item and its next step, and does not open spec.md before the handoff).

## F11. Acceptance criteria (Phase 1)
1. `npm test` passes; new tests cover F1 to F9 (at least: v1 compat + upgrade, guard on memory.json, lite gates, slice container rules incl. `done`, size rule + waiver, issue/drop/restore, question → decision, intake dedupe, focus/interrupt/resume with conflicts, milestone filter in next/status, checkpoint file content and auto-regeneration on stage set, PreCompact hook writes the handoff, rework start/close, brief under 1,500 chars with 120 features).
2. A 0.4.0 workspace keeps working before upgrade, and `upgrade --apply` leaves `validate` clean without changing existing values.
3. `claude plugin validate plugins/specflow` passes (if the `claude` CLI is available; otherwise say so in the log).
4. README, CHANGELOG, HELP and skills describe the same commands.
5. Version 0.5.0 everywhere it is declared.

## Implementation Log

### Phase 1 (0.5.0), branch `task-5`

**Commits (hash, subject)**
- f670b6e feat: schema v2 data model, in-memory normalization, memory.json and guard (F1)
- 8735f8d feat: 0.5.0 upgrade migration, schema 2 templates, version bump (F2)
- b7864eb feat: lite lane with configurable gates and relaxed design entry (F3)
- 0ef0e05 feat: slices, container rules and the size rule (F4)
- e91305a feat: issues, drop/restore, questions with decision log, intake (F5)
- 005ebc1 feat: focus, interrupt, resume, milestones and lean status/next (F6)
- 85511d4 feat: checkpoint and handoff files, PreCompact/Stop hooks, lean brief (F7)
- 9b2f258 feat: rework rounds (F8)
- da63268 feat: pref, decision and lesson commands; HELP for all Phase 1 commands (F9)
- ae1d9e8 docs: skills, README, CHANGELOG, architecture note, resume-from-handoff eval; version 0.5.0 (F10)
- (this log is committed separately after F10)

**Files changed per step** (all under `plugins/specflow/` unless noted)
- F1: `scripts/lib/lifecycle.mjs` (KINDS, LANES, defaultLane, SLICING_DEFAULTS, LITE_GATES_DEFAULT, ...), `lib/state.mjs` (normalizeFeature/normalizeBacklog, memory load/save, config helpers), `lib/validate.mjs`, `lib/guard.mjs`, `commands/feature.mjs`, `tests/phase1.test.mjs` (new).
- F2: `lib/migrations.mjs` (0.5.0), `commands/upgrade.mjs` (saves backlog), `templates/workspace/{backlog,config}.json`, `plugin.json` and root `package.json` (0.5.0), `tests/compat.test.mjs`, `tests/legacy.test.mjs`.
- F3: `lib/gates.mjs`, `commands/feature.mjs` (`feature set lane`).
- F4: `lib/gates.mjs` (sizeCounts/sizeFailure, container planned), `lib/state.mjs` (childrenOf/isContainer), `commands/{feature,stage,work,views}.mjs`, `lib/render.mjs`, `specflow.mjs`.
- F5: `commands/work.mjs` (slice, issue, question, intake), `commands/feature.mjs` (drop/restore, createItem), `lib/memory.mjs` (new; committed in F8, see deviations), `lib/gates.mjs` (dropped dep), `lib/render.mjs`.
- F6: `commands/flow.mjs` (focus, interrupt, resume, milestone), `commands/{views,io}.mjs`, `lib/{render,state}.mjs`, `specflow.mjs`.
- F7: `lib/handoff.mjs`, `hooks/pre-compact.mjs`, `hooks/stop.mjs`, `hooks/hooks.json`, `lib/render.mjs` (brief), `commands/{flow,stage}.mjs`. (`lib/handoff.mjs`, `pre-compact.mjs`, `stop.mjs` were written while the F6 test run was in flight and so landed in the F6 commit; F7 commit has the wiring.)
- F8: `commands/flow.mjs` (rework), `commands/stage.mjs` (accepted closes round), `lib/render.mjs`, `commands/views.mjs`.
- F9: `commands/memory.mjs`, `specflow.mjs` (HELP rewritten for every command).
- F10: skills (`_shared/lifecycle.md`, `_shared/role-contract.md`, flow, architect, verify, build, product), `templates/workspace/claude-md-block.md`, README.md, plugins/specflow/README.md, CHANGELOG.md, docs/architecture.md, `evals/resume-from-handoff/*`, `evals/README.md`.

**Existing tests adjusted:** `tests/compat.test.mjs` and `tests/legacy.test.mjs` asserted `framework_version === '0.4.0'` after `upgrade --apply`; now `'0.5.0'` (the real plugin version). No other existing test was changed.

**Deviations / decisions where the spec was open**
1. Config defaults (`slicing`, `lanes`, `current_milestone`) are read through helpers (`slicingCfg`, `liteGates`, `currentMilestone`) instead of being copied into `ctx.config` on load, so a read followed by `saveConfig()` never writes migration fields into a 0.4.0 config. Feature/backlog fields are normalized in memory in `load()` as specified (and therefore get persisted on the next write command).
2. `issue add` default `--kind` is `bug`; `interrupt` accepts `bug|chore` only (default `bug`). Interrupt with no `--repos` skips the conflict check and says so.
3. `slice add` leaves `summary`/`value` empty unless given (only the fields listed in F4 are inherited).
4. Dropped dependency holds a dependent only for blocking dep types (`requires`, `technical`); `after`/`related` never hold.
5. `rework start` while a round is already open closes the old round and starts the next; `rework close <id>` (explicit close without stage change) was added because the spec's test list mentions close.
6. Brief budget is enforced by truncating lines and dropping lowest-priority lines until under 1,450 characters; the old trailing text was shortened. The `Warnings:` header line is gone (warnings are `! ...` lines, max 3).
7. `status` list truncates title (40) and next (60) to keep rows on one line.
8. Interrupt stores a checkpoint on the parked item (keeping its note/next, default note "parked for interrupt <id>") before regenerating its handoff.
9. The eval grader "does not open spec.md before the handoff" cannot be expressed with the supported grader types; `resume-from-handoff` has `names-focus-and-next` (regex on the reply) and `read-handoff` (tool_used Read handoff.md). The ordering check is not enforced. The eval was NOT run (it calls the model).
10. `lib/memory.mjs` and `commands/memory.mjs` were created in the working tree earlier than their step and swept into the F5/F8 commits by `git add -A`; contents are as described above.

**Test results**
- Final `npm test` on commit ae1d9e8: tests 65, pass 65, fail 0 (45 pre-existing + 20 new in `tests/phase1.test.mjs`, P1-1 .. P1-20). `npm test` was green before every commit.
- New tests cover: v1 compatibility and no-rewrite-on-read, v2 fields, validate, guard on memory.json, upgrade dry run/apply, lite gates, lite Repository Impact rule, slice inheritance, container rules incl. `done`, size rule and waiver, issues/drop/restore/dependents, question -> decision, intake dedupe, focus/interrupt/resume with conflicts, milestone filter, checkpoint content and regeneration, PreCompact/Stop hooks, brief < 1,500 chars with 120 features, rework start/close, pref/decision/lesson, HELP coverage.

**`claude plugin validate plugins/specflow`:** run on the final tree; output: "Validating plugin manifest ... plugin.json  Validation passed".

**Open issues / not done**
- The `resume-from-handoff` eval has not been run, and its ordering grader is approximated (see 9).
- Tests are slow on this machine (full suite about 80 s); one early run exceeded a tool timeout but passed when re-run.
- The README "Daily use" table and command reference were updated by hand; no automated check that README, HELP and skills list the same commands beyond the HELP test.
- Not exercised: Node 18, macOS/Linux; the F11 "Wali-like" fixture is the 120-feature brief test only.

### Review of Phase 1 (Opus, 2026-10-20)
- Re-ran the full suite: 65/65 pass. Read the diff of state, gates, stage, migrations, guard, hooks, flow commands, handoff and brief against Part F: matches the spec; the deviations above are reasonable and accepted.
- Smoke test on a **copy** of Wali App's `.specflow/` and `specs/` (scratch folder, Wali untouched): v1 brief/status/next work before upgrade; `upgrade` dry run and `--apply` succeed and `validate` is clean; focus, checkpoint, interrupt, brief, resume and the generated handoff.md behave as specified.
- Fixed in review: the brief's trust line ("State is in the specflow CLI, not memory") had the lowest priority, so it was the first line cut when over budget; it now outranks optional lines, with a test assertion (P1-18). Merged three duplicate `state.mjs` imports in `commands/flow.mjs`.
- Noted for later (not changed): with no current milestone, `status` still lists every non-done item (126 rows on Wali). Setting a milestone fixes it; Phase 2's setup interview should ask for one, or `status` could collapse `proposed` items by default.
- Stopped after Phase 1 as the owner asked.

### Phase 2 (0.6.0), branch `task-5`

**Commits (hash, subject)**
- d3d2441 feat: team configuration, roles, leads and 0.6.0 migration (G2)
- 9859901 feat: role agents with model policy and subagent contract (G3)
- 0054ccf feat: dispatch packets for the PM (G4)
- e0ea0d7 feat: guard denies PM-only actions from subagents (G5)
- 38ee1e6 feat: setup interview as data (questions, apply, status) (G6)
- 5df4103 feat: setup skill, PM-loop flow, subagent sections, lifecycle team table (G7)
- 9afdeed docs: team model docs, lean status, pm-dispatches-role eval; version 0.6.0 (G8)
- (this log is committed separately after G8)

**Files changed per step** (under `plugins/specflow/` unless noted)
- G2: `scripts/lib/team.mjs` (new: roles, `teamCfg` and the delivery/release/testing/tools helpers, `fillTeamDefaults`, `validateTeam`), `scripts/commands/team.mjs` (new), `scripts/lib/migrations.mjs` (0.6.0), `scripts/lib/validate.mjs`, `scripts/specflow.mjs`, `templates/workspace/config.json`, `tests/phase2.test.mjs` (new, P2-1..5).
- G3: `agents/{product,architect,ux,lead,builder,verifier}.md` (new); test P2-6.
- G4: `scripts/lib/dispatch.mjs`, `scripts/commands/dispatch.mjs` (new), `scripts/specflow.mjs`; tests P2-7..11.
- G5: `scripts/lib/guard.mjs`; test P2-12.
- G6: `scripts/lib/setup.mjs`, `scripts/commands/setup.mjs` (new), `scripts/specflow.mjs`; tests P2-13..17.
- G7: `skills/setup/SKILL.md` (new), `skills/flow/SKILL.md` (rewritten, 5.7 KB), "When dispatched as a subagent" sections in product, ux, architect, build, verify, discover, `skills/_shared/{lifecycle,role-contract}.md`, `templates/workspace/claude-md-block.md`; test P2-18.
- G8: `scripts/commands/views.mjs` (lean status), version 0.6.0 in `.claude-plugin/plugin.json` and root `package.json`, `README.md`, `plugins/specflow/README.md`, `CHANGELOG.md`, `docs/architecture.md`, `evals/README.md`, `evals/pm-dispatches-role/*`, `tests/{compat,legacy}.test.mjs` (version string), tests P2-19..20.

**Existing tests adjusted:** `tests/compat.test.mjs` and `tests/legacy.test.mjs` asserted `framework_version === '0.5.0'` after `upgrade --apply`; now `'0.6.0'`. Nothing else changed.

**Deviations / decisions where the spec was open**
1. Setup has 14 question ids, not 12: G6 items 6 and 7 each carry two answers, so they are `testing.unit_required` + `testing.data_rules` and `models.planning` + `models.building`. Answers file is a flat JSON map keyed by id (`{"delivery.mode": "commit"}`); booleans accept yes/no/true/false; `slicing` accepts `"15 / 1"` or `{max_tasks, max_migrations}`; `delivery.target_branch` and `milestone` accept `none`.
2. `models.planning/building` answers skip roles listed in `team.locked` (a role set by hand with `team set` keeps its model). `team.leads: yes` creates one lead per registered repo when none exist; `no` disables the lead role but keeps the leads list.
3. `team set` and `team lead add|rm` write the full effective team into `config.team` (materialized); before that, `teamCfg` derives defaults so a 0.5.0 config is not rewritten on read. The `ux` role's `enabled` is left unset in the init template so it follows the repos until the migration, `team generate` or `team set` materializes it. When leads exist and `lead.enabled` is unset, the lead role counts as enabled.
4. Lead routing: the packet names `lead` only when the lead role is enabled and EVERY repo of the item belongs to a lead. With repos spread over several leads, `--repo` is required and picks that repo's lead. A dispatch for a feature that is a container (has slices) at planned/implementing is refused ("dispatch one of its slices").
5. `dispatch` at `released` returns `role: pm` (agent/model null) because no team role owns that stage; `--role` accepts any of the 8 roles. When a disabled role is covered, `role` is the covering role, `requested_role` the original and `covered_by` names it. The prompt shows at most 4 open questions (80 chars each) plus a "+N more" hint so the closing lines (update level, contract) are never cut by the 1,200-character cap.
6. `dispatch` writes to the backlog (history entry `dispatch <role>`, event type `link`) although it is otherwise deterministic.
7. Guard: PM-only patterns apply only when `agent_id` is present and return `deny`; the main-session behavior is untouched (so `gh pr create` is still not guarded for the main session, as before).
8. `status` lean rule: the summary line uses ASCII `...` instead of the ellipsis character; it also applies to `--json` output (rows hidden there too). "Open" counts non-done, non-dropped items.
9. Agent descriptions are quoted YAML strings (the colon-free spec wording is followed; role summaries use " - "). Role skills' headings contract gained one trailing section; `role-contract.md` says so.
10. The `pm-dispatches-role` eval is not run (it calls the model and needs Bash and Agent, so not runnable on Windows).

**Test results**
- Final `npm test` on commit 9afdeed: tests 85, pass 85, fail 0 (65 from Phase 1 + 20 new in `tests/phase2.test.mjs`, P2-1 .. P2-20). `npm test` was green before every commit (70, 71, 76, 77, 82, 83, 85 tests).
- New tests cover: team defaults and ux derivation, set/lock/generate, validation, lead add/rm and the 4+ repo suggestion, migration 0.6.0 from 0.5.0 and chained from 0.4.0, agent frontmatter and contract, dispatch routing for every stage, ux before architect, lead vs builder, `--repo` rule and deploy order, disabled-role fallbacks, refusal for done/dropped, prompt cap, guard with and without `agent_id`, setup questions/defaults, apply partial/invalid/decision logging/locked roles, status, skills and docs presence, lean status, versions and HELP.

**`claude plugin validate plugins/specflow`:** run after G3, G7 and G8; output: "Validating plugin manifest ... plugin.json  Validation passed".

**Open issues / not done**
- Not exercised in a live Claude Code session: that agent `model` overrides via the Agent tool, that `agent_id` really arrives on subagent hook calls, and that the PM loop in the flow skill dispatches correctly. These rest on the G1 platform facts; only the CLI, hook logic (with a synthetic `agent_id`) and file contents are tested.
- `pm-dispatches-role` eval not run.
- Setup `tools.graphify` detection checks PATH only (stubbed in tests by `SPECFLOW_FAKE_GRAPHIFY`); `delivery`, `release`, `testing` and `tools` are recorded but nothing consumes them yet (Phase 3/4).
- Not exercised: Node 18, macOS/Linux. Full suite takes roughly 100 s here.

### Phase 3 (0.7.0), branch `task-5`

**Commits (hash, subject)**
- 9ec4303 feat: deliver command (push, one PR per repo, status, merge) with guard (H2)
- 2ce1557 feat: release configuration (steps, post-release checks, flags) and CLI (H3)
- ed074c5 feat: release plan, run and verify with progress, evidence and guard (H4)
- 47d26c4 feat: release role, dispatch to release, setup release.steps, 0.7.0 migration (H5)
- 4c6a894 feat: verify skill unit-test rule and setup skill release.steps flow (H6)
- be9f834 docs: delivery and release in flow skill, lifecycle, README, CHANGELOG, architecture (H7)
- 3129200 chore: version 0.7.0 (plugin.json, package.json), migration note, version tests (H8)
- (this log is committed separately after H8)

**Files changed per step** (under `plugins/specflow/` unless noted)
- H2: `scripts/lib/deliver.mjs`, `scripts/commands/deliver.mjs` (new), `scripts/lib/git.mjs` (`git`, `remoteUrl`, `defaultBranch` exported), `scripts/lib/state.mjs` (`delivery` and `release_progress` normalized in memory; `inDeployOrder`, also used by dispatch), `scripts/lib/guard.mjs`, `scripts/lib/lifecycle.mjs` (evidence kinds `delivery`, `merge`), `scripts/lib/handoff.mjs`, `scripts/lib/render.mjs`, `scripts/commands/{views,io}.mjs`, `scripts/specflow.mjs`, `tests/phase3.test.mjs` (new, P3-1..8).
- H3: `scripts/commands/release.mjs` (new), `scripts/lib/team.mjs` (`releaseCfg` extended, `stepApproval`, `validateRelease`, `setReleaseByAi`), `scripts/lib/validate.mjs`, `scripts/lib/release.mjs` (stub, replaced in H4), `scripts/specflow.mjs`; test P3-9.
- H4: `scripts/lib/release.mjs`, `scripts/lib/gates.mjs` (`released` needs every step), `scripts/lib/guard.mjs`; tests P3-10..15.
- H5: `agents/release-manager.md` (new), `scripts/lib/{team,dispatch,setup,migrations}.mjs`, `templates/workspace/config.json`; tests P3-16..19. This commit also carries the H6 code (dispatch `Testing:` line, accurate setup `why` texts) and the H8 migration; see deviation 8.
- H6: `skills/verify/SKILL.md`, `skills/setup/SKILL.md`.
- H7: `skills/flow/SKILL.md` (6.3 KB, under the 7 KB test limit), `skills/_shared/lifecycle.md`, `templates/workspace/claude-md-block.md`, `README.md`, `CHANGELOG.md`, `docs/architecture.md` (A12 and the approval table), `plugins/specflow/README.md`; test P3-20.
- H8: `.claude-plugin/plugin.json` and root `package.json` (0.7.0), `README.md` (migration note), `tests/{compat,legacy,phase2}.test.mjs` (version strings), test P3-21.

**Existing tests adjusted:** `tests/compat.test.mjs` and `tests/legacy.test.mjs` asserted `framework_version === '0.6.0'` after `upgrade --apply`; now `'0.7.0'`. `tests/phase2.test.mjs` P2-20 asserted version 0.6.0 in `plugin.json` and `package.json`; now 0.7.0 (title shortened). Nothing else changed.

**Deviations / decisions where the spec was open**
1. `deliver`: item-level and repo-level preconditions are all checked up front for every repo; any failure refuses the whole run with the list and nothing is pushed. Only runtime failures (push rejected, `gh` error) and PR-state refusals (MERGED/CLOSED, no target branch, `gh pr view` error) are per repo, with the other repos still running and exit code 1. `--dry-run` reports failed preconditions as `blocked:` lines with exit code 1 and changes nothing.
2. A container item (one with slices) is refused by `deliver` ("deliver one of its slices"). `deliver` records the PR number from the URL printed by `gh pr create`.
3. `gh` is resolved from `SPECFLOW_GH` (tokens split on whitespace, quotes allowed) and run without a shell. Tests use `"<node>" "<fake-gh.mjs>"`. `deliver status` and `deliver merge` re-read PR state with `gh pr view`; `merge` refreshes first and merges only OPEN PRs.
4. `release run` with `--step` runs that step even if earlier steps have not passed (no ordering enforcement, as the spec says "runs that one step"); a step that already passed needs `--again` (error otherwise). `release run` reads PR states from the recorded `delivery` (refresh them with `deliver status`).
5. `released` requires every configured step to have passed only when `release.by_ai` is true. With AI release off the steps are the owner's checklist, and requiring progress that only `release run` records would make the stage unreachable. Spec text said "when steps exist".
6. `release plan` keeps an existing `## Rollback` body across regenerations (otherwise the release role's notes would be overwritten); without a spec dir the file goes to `.specflow/release/<id>.md`. `release verify` does not require `by_ai`.
7. Release role question target is `build` (the closest of the fixed question targets). `dispatch` at `accepted` without an approved acceptance gate still goes to `product`; with the gate it goes to `release` (enabled) or `pm` (prompt says the PM delivers and releases, or the owner does). The old `released` PM prompt had empty parentheses `(, )` from stripped text; it now says the PM runs `release verify`.
8. The H5 commit also contains the H6 code (Testing line, `why` texts) and the H8 config migration because those edits were made together; the H6 commit holds only the skill changes and H8 only the version bump and tests. Migration 0.7.0 materializes `release` keys and the `release` role (`enabled` from `by_ai`). `fillTeamDefaults` (the 0.6.0 migration) still writes `release: { by_ai: false }` only, so the 0.6.0 migration tests keep their shape; `releaseCfg` fills the new keys on read.
9. `setReleaseByAi` (used by `release set --by-ai` and setup `release.by_ai`) moves the `release` role with the flag unless that role was set by hand (`team set release`, which locks it).
10. `release.steps` in setup is a free-text question that only logs the answer; the setup skill dispatches the release role, which needs a work item (`dispatch <id> --role release`), so with an empty backlog drafting waits for the first item. The skill says so.
11. `parseArgs` treats `--post`, `--dry-run` and `--again` as boolean flags.
12. Not done from the spec's optional-looking items: no eval case for the release flow (evals call the model).

**Test results**
- Final `npm test` on commit 3129200: tests 106, pass 106, fail 0 (85 from Phases 1-2 + 21 new in `tests/phase3.test.mjs`, P3-1 .. P3-21). `npm test` was green before every commit (93, 94, 100, 104, 105, 106 tests).
- New tests cover: every deliver precondition refusal and commit mode; dry run changes nothing; push to a local bare repo; PR create vs reuse (OPEN) vs refuse (MERGED, CLOSED) and the origin/HEAD fallback with a fake `gh`; delivery record, evidence, handoff and `status` table; partial failure and exit code; `deliver status` merge evidence once; `deliver merge` mode and gate checks, no `--admin` or `--delete-branch`; refusal during a rework round; release step add/rm/list/validation/settings; `release plan` file and kept rollback; `release run` preconditions, stop at the first approval step, `--step`, progress skip, `--again`, failure stops and retries; `released` entry needs every step; `release verify` evidence; guard (ask in main, deny unattended and for subagents, `deliver status`, `--dry-run`, `release plan` and `release step` not guarded); release role agent and config; dispatch to release, PM fallback and the Testing line; setup `release.steps` and why texts; migration 0.7.0 from 0.6.0 and chained from 0.4.0; skills, docs and block; versions and HELP.
- All pushes in tests go to bare repos inside a temp folder; `gh` is a fake script; release steps are `node -e` commands. Nothing contacted a real server.

**`claude plugin validate plugins/specflow`:** run on the final tree (commit 3129200); output: "Validating plugin manifest ... Validation passed".

**Open issues / not done**
- Not exercised against real GitHub or a real `gh` (output shapes of `gh pr view --json url,state,number` and `gh pr create` follow its documented behavior; the "no pull requests found" detection is a regex on stderr).
- Not exercised in a live Claude Code session: that the guard's `ask` for `deliver` and `release run` shows the intended prompt, that `agent_id` arrives on subagent hook calls, and the PM loop in the flow skill.
- `deliver` has no way to push to a remote other than `origin`, and no `--force` by design.
- `release run` executes configured commands through the shell as given; the safety is the approval prompt and the `ask` default, not command inspection.
- Not exercised: Node 18, macOS/Linux. Full suite takes roughly 2 minutes here.

---

# Part G: Phase 2 build spec — 0.6.0 "Team model"

Written for the implementing agent (Sonnet). Read this part, Part C1/C2 for intent, and the Phase 1 code it builds on. Locked decisions: Part E (team depth configurable, Opus plans / Sonnet builds, release and graphify asked at setup).

## G0. Rules for this build
- Continue on branch `task-5` (not merged yet). Commit after each step G2 to G8 with a conventional message ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Same code rules as F0: zero dependencies, `emit()` for output, `UserError`, defaults read through helpers so a 0.5.0 config needs no rewrite on read. New tests in `tests/phase2.test.mjs`. `npm test` passes after every step. The full suite takes about 100 s: run single test files while iterating and the full suite before each commit; keep tool calls short.
- Do not touch `D:\Work\Wali_app`. Stop after Phase 2.

## G1. Verified platform facts (Claude Code docs, checked 2026-10-20). Design on these, not on assumptions
- Plugin agents (`agents/*.md`) honor `model` (sonnet, opus, haiku, inherit, or a full id) and `tools`/`disallowedTools`; they ignore `hooks`, `mcpServers`, `permissionMode`.
- The caller can override the model per call (Agent tool `model` parameter). This is how config-chosen models are applied.
- Subagents can spawn subagents (up to 3 levels). Omit `Agent` from `tools` to prevent it.
- `AskUserQuestion` is not available to subagents. Permission prompts still reach the user.
- Hook input carries `agent_id` and `agent_type` when the tool call comes from inside a subagent.
- `${CLAUDE_PLUGIN_ROOT}` is expanded in agent and skill Markdown bodies (not in the Bash environment).
- `PreCompact` cannot inject context (Phase 1 only writes the handoff there, which is correct).

## G2. Team configuration
Config key `team` (defaults via a helper `teamCfg(ctx)`; written by the migration):
```json
"team": {
  "roles": {
    "product":   { "enabled": true,  "model": "opus" },
    "architect": { "enabled": true,  "model": "opus" },
    "ux":        { "enabled": "<true when any repo has ui: true>", "model": "opus" },
    "lead":      { "enabled": false, "model": "opus" },
    "builder":   { "enabled": true,  "model": "sonnet" },
    "verifier":  { "enabled": true,  "model": "sonnet" },
    "reviewer":  { "enabled": true,  "model": "opus" },
    "profiler":  { "enabled": true,  "model": "haiku" }
  },
  "leads": [],
  "locked": [],
  "communication": "short",
  "workflow": "feature"
}
```
`leads` entries look like `{ "name": "backend", "repos": ["wali-backend"] }`. `communication` is short | normal | detailed (how much the PM tells the user); `workflow` is feature | task.
Also new config keys recorded now, used by later phases: `delivery: { mode: "push-pr", target_branch: null, pr_tool: "gh" }` (modes `commit`, `push-pr`, `push-pr-merge`), `release: { by_ai: false }`, `testing: { unit_required: true, data_rules: "" }`, `tools: { graphify: false }`.
CLI:
- `team` / `team show`: roles (enabled, model, agent name), leads, communication, workflow.
- `team set <role> [--model m] [--enabled true|false]` (adds the role to `locked`); `team set --communication short|normal|detailed`; `team set --workflow feature|task`.
- `team lead add <name> --repos a,b` / `team lead rm <name>`. Adding the first lead enables the `lead` role; removing the last disables it. A repo belongs to at most one lead.
- `team generate`: re-derives defaults from the registered repos (ux enabled when any repo has `ui: true`). With 4 or more repos it prints a suggestion of one lead per repo but does not enable it. Never changes a role listed in `locked`.
Validate: known roles; model one of `opus|sonnet|haiku|inherit|fable` or a string starting with `claude-`; lead repos registered and unique.

## G3. Role agents
New plugin agents under `plugins/specflow/agents/`: `product.md`, `architect.md`, `ux.md`, `lead.md`, `builder.md`, `verifier.md`. Keep `independent-reviewer.md` (role `reviewer`) and `repo-profiler.md` (role `profiler`). Each new file:
- Frontmatter: `name`, `description` ("specflow team role, dispatched by the specflow PM; not for direct use"), `model` (the G2 default), `tools` without `Agent` except for `lead` (spawns builders) and `verifier` (spawns the independent reviewer).
- Body, under about 40 lines: "First read `${CLAUDE_PLUGIN_ROOT}/skills/<role skill>/SKILL.md` and `${CLAUDE_PLUGIN_ROOT}/skills/_shared/role-contract.md` and follow them." Then the **subagent contract**:
  1. You never talk to the user. Anything you need from the user or another role: `specflow question add "<q>" --feature <id> --to user|product|architect|ux|build|verify`, then continue with what you can, or stop if blocked.
  2. Never run `gate approve`, `init`, `upgrade --apply`, `install`, `uninstall`, `git push` or `gh pr` (the hook denies them for subagents).
  3. Start from the handoff file and the inputs in the dispatch prompt; read other files only when needed.
  4. Before returning: `specflow checkpoint <id> --next "<next step>" --note "<what you did>"`.
  5. Return a report of at most 15 lines: outcome, artifacts changed (paths), CLI state changes, open questions (ids), blockers (ids), recommended next step. No file dumps.
- `lead.md`: for its area's repos, reads plan and tasks, writes `specs/<dir>/lead-<name>.md` (ordered steps, files to touch, pitfalls, test plan; under about 80 lines), then spawns one `specflow:builder` per repo of its area with that file as input (model from `specflow team show --json`), collects their reports, runs `specflow verify run` per repo, and returns one report.
- `builder.md`: ONE repo per dispatch, only that repo's `[repo:<name>]` tasks.

## G4. Dispatch packets
`specflow dispatch <id> [--role r] [--repo name] [--question Q-n] [--json]`: deterministic, no AI. Gives the PM what it needs to spawn the right agent:
- `role`: default from the stage routing (same source as `nextAction`). UI items at `specified` with incomplete ux.md go to `ux`. At `planned`/`implementing`: `lead` when the item's repos are covered by an enabled lead, otherwise `builder`; a multi-repo builder dispatch requires `--repo`, and the output lists the repos still to do in deploy order.
- `agent` (`specflow:<agent file name>`), `model` (team config), `enabled`. When the role is disabled, name who covers it: ux → architect, lead → builder, verifier → the PM runs verify itself.
- `prompt`: compact text (under 1,200 characters) to pass verbatim as the Agent prompt: id, title, kind, lane, stage, rework round, repo (builder), handoff path, spec dir and which artifacts exist, open questions addressed to this role (`--question` focuses on one), the `team.communication` level, and "Follow the subagent contract in your agent definition."
- Refuse for done or dropped items. Log `dispatch <role>` in the item history.

## G5. Guard: PM-only actions
In `lib/guard.mjs` `decide()`: when `input.agent_id` is present (call from inside a subagent), **deny** `gate approve`, `init`, `upgrade --apply`, `install`, `uninstall`, `specify init`, `git push`, `gh pr create`, `gh pr merge`, with the reason "Only the specflow PM (main session) may do this; return it to the PM in your report." Everything else unchanged. Tests through the existing `hook()` helper with and without `agent_id`.

## G6. Setup interview
- `specflow setup questions [--json]`: the interview as data. Each question has `id`, plain-English `text`, `options`, `default` derived from the workspace (scan, config, git), and `why` (one line). In order:
  1. `workflow`: feature by feature or task by task? [feature]
  2. `autonomy`: which approvals: guided (all), standard (spec, implement, acceptance, release, plus design when risky), autonomous (acceptance, release)? [standard]
  3. `delivery.mode`: after review passes: commit only / push and open PRs (you merge) / push, open and merge PRs? [push-pr]
  4. `delivery.target_branch`: which branch PRs go to? [the repos' current branch when all agree, else none]
  5. `release.by_ai`: should the AI team also release and deploy? [no] (yes is recorded now; Phase 3 configures the release team)
  6. `testing.unit_required`: require unit tests for new logic? [yes]. `testing.data_rules`: rules for test data, for example "use yopmail.com addresses"? [none]
  7. `models.planning` / `models.building`: [opus / sonnet]. Planning applies to product, architect, ux, lead, reviewer; building to builder, verifier.
  8. `team.leads`: use team leads per area? [no; the `why` suggests yes with 4+ repos]
  9. `team.communication`: short / normal / detailed updates? [short]
  10. `tools.graphify`: use the graphify code graph (AST-only, no AI) for code search? [yes when `graphify` is on PATH, else no; tests stub detection with an env var]
  11. `milestone`: current milestone name, if any [none; when more than 30 items are open the `why` says the status list will be long without one]
  12. `slicing`: slice limit [15 tasks / 1 migration]
- `specflow setup apply --answers <file.json>`: validates and writes every given answer (partial is fine) to config, logs each as a decision (`scope: project`, `by: user`, question text as the question), prints a short summary. Unknown ids or invalid values: `UserError` listing them, nothing written.
- `specflow setup status`: which questions are answered (from the decisions log) and which are on defaults.

## G7. Skills
- New skill `skills/setup/SKILL.md` (`specflow:setup`): runs after `init` + discover, or on "configure specflow". `setup questions --json` → skip what `setup status` shows as answered → ask the rest with AskUserQuestion in batches of up to 4, plain English, recommended default first → write the answers file to a temp folder → `setup apply` → show `team show`. Never asks again what the decisions log answers.
- Rewrite [flow](../plugins/specflow/skills/flow/SKILL.md) as the **PM loop**: brief → focus → `dispatch <id> --json` → spawn the agent (`subagent_type` = `agent`, `model` = `model`, prompt verbatim) → read its report → `question list --open --feature <id>`: role questions are routed by dispatching that role with `--question`; user questions are batched (check `decision list`/`pref list` first, never re-ask) and answered with `question answer` → gates are presented and approved by the PM in the main session only → next dispatch. The PM does no role work itself (no specs, plans or code), except when the dispatch packet says a disabled role falls back to the PM. Communication follows `team.communication`. Run `specflow:setup` when `setup status` shows nothing answered. Keep it under about 7 KB.
- Each role skill (product, ux, architect, build, verify, discover) gets a short "When dispatched as a subagent" section that points to the subagent contract in its agent file (no duplicated text).
- [_shared/lifecycle.md](../plugins/specflow/skills/_shared/lifecycle.md): stage → role → agent table and the lead routing rule.
- Workspace CLAUDE.md block: one line "Only the PM (main session) talks to the user and approves gates; team roles run as subagents via `specflow dispatch`."

## G8. Migration, lean status, docs, release
- Migration `0.6.0`: adds `team` (ux enabled from the repos), `delivery`, `release`, `testing`, `tools`; additive only. Version 0.6.0 in plugin.json and package.json.
- Lean `status` (from the Phase 1 review): when no milestone is set and more than 30 items are open, the list shows only items past `proposed`, plus one line `… and N proposed items (status --all, or set a milestone)`.
- README (team, dispatch, setup commands; a short "How the team works" section), CHANGELOG `[0.6.0]`, docs/architecture.md (roles as subagents, dispatch, PM-only guard).
- One eval `pm-dispatches-role`: fixture with a feature at `defined`; prompt "work on F-001"; grader: the Agent tool was used with `specflow:product` (tool_used). Not run (calls the model).

## G9. Acceptance criteria (Phase 2)
1. `npm test` passes; `tests/phase2.test.mjs` covers: team defaults and ux derivation; team set/lock, lead add/rm; team validation; dispatch routing for every stage (ux before architect, lead vs builder, `--repo` required for multi-repo builders, disabled-role fallback, refused for done/dropped); prompt under 1,200 chars; guard denies PM-only actions for `agent_id` calls and leaves the main session unchanged; setup questions defaults; setup apply partial/invalid/decision logging; setup status; migration 0.6.0 from 0.5.0 and chained from 0.4.0; lean status rule.
2. `claude plugin validate plugins/specflow` passes with the new agents and skill.
3. README, HELP, skills and agents describe the same commands; version 0.6.0 everywhere.
4. Implementation Log: append a `### Phase 2 (0.6.0)` section like Phase 1's.

## Review of Phase 2 (Opus, 2026-10-20)
- Full suite re-run: 85/85 pass. Read the guard, team, dispatch and agent changes; they match Part G, and the 10 recorded deviations are accepted.
- Smoke test on the copy of Wali's state (scratch folder, Wali untouched): upgrade 0.5.0 → 0.6.0 applied, `validate` clean, `team` shows the expected roles and models, `dispatch F-005 --repo wali-backend` gives builder/sonnet with a correct prompt, `dispatch F-001` gives product/opus, lean `status` shows 2 rows plus "… and 124 proposed items".
- Gap (fixed in Phase 3, H6): setup's `why` texts for `testing.unit_required` and `testing.data_rules` describe behavior nothing implements yet, and `release.by_ai` says "a later phase".
- Not verifiable offline: Agent-tool model override, `agent_id` on real subagent hook calls, the PM loop in a live session.

---

# Part H: Phase 3 build spec — 0.7.0 "Delivery and release pipelines"

Written for the implementing agent (Sonnet). Read this part, Part C6 for intent, and the Phase 1 and 2 code it builds on. Locked: decision 4 (push and open one PR per repo per slice after verify passes; the owner merges; mode configurable), decision 5 (release by AI only if setup says so; then configure the release team).

## H0. Rules for this build
Same as G0: branch `task-5`, one commit per step H1 to H8 with explicit `git add <paths>`, attribution line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, never push, zero dependencies, `emit()`/`UserError`, new tests in `tests/phase3.test.mjs`, short bounded tool calls, single test files while iterating and the full suite before each commit. Do not touch `D:\Work\Wali_app`. Stop after Phase 3.
**Testing outward-facing commands:** never call real GitHub. Pushes go to a local bare repository created in the test fixture (`git init --bare`, added as `origin`). `gh` is resolved from env `SPECFLOW_GH` (path to an executable or `node <script>`); default `gh`. Tests use a small fake gh script (Node) that records its arguments to a file and prints canned JSON/URLs. Release steps in tests are harmless `node -e` commands.

## H1. Why this phase exists (the PR loop)
Wali's F-004 produced five fix branches and PRs per repo after review. The fix is structural: delivery happens only from a verified state, always from the same feature branch, and updates the existing PR instead of opening a new one. Every rule below serves that.

## H2. Delivery: `specflow deliver`
- `deliver <id> [--dry-run]`: for each affected repo in deploy order:
  1. Preconditions (all must hold, else refuse with the list): delivery mode is not `commit` (then say "delivery mode is commit: pushing and PRs are done by you"); item stage is `accepted` or later; no open rework round; no open blockers; for this repo, the latest test/manual evidence passes **at the current HEAD**; the repo is a git repo, clean, and on the item's recorded branch; an `origin` remote exists.
  2. `git push -u origin <branch>` (plain push, never `--force`).
  3. PR: `gh pr view <branch> --json url,state,number` in the repo. If a PR exists and is OPEN, reuse it (the push updated it) and report "updated". If none exists, `gh pr create --base <target> --head <branch> --title "<id> <title>" --body-file <tmp>`. Target = `delivery.target_branch`, else the repo's `origin/HEAD` default branch, else refuse. If the PR is MERGED or CLOSED, refuse for that repo and say so (do not open a second PR for the same branch; a new slice gets a new branch).
  4. PR body (generated, under about 40 lines): item, kind, slice parent, link paths to spec/plan/handoff, acceptance summary (spec's first acceptance lines are optional; keep it simple: link only), verification table per repo (result, sha), rework rounds count, and "Generated by specflow deliver".
  5. Record per repo on the item: `delivery: { <repo>: { branch, pushed_sha, pr_url, pr_number, pr_state, at } }`, log history, add evidence `--kind delivery --repo <r> --result pass --note "<pr url>"` (add `delivery` and `merge` to EVIDENCE_KINDS).
  `--dry-run` prints the plan (repos, push target, PR action: create/update/refuse) and changes nothing.
- `deliver status <id>`: refreshes each recorded PR with `gh pr view` and updates `pr_state`; prints a table. When all PRs of the item are MERGED, record evidence `--kind merge --result pass` once.
- `deliver merge <id>`: only in mode `push-pr-merge`, only after the `acceptance` gate is approved, only for OPEN PRs: `gh pr merge <number> --merge` (no `--admin`, no `--delete-branch`), then refresh as `deliver status`. Otherwise refuse with the reason.
- Failures (push rejected, gh error) are reported per repo with the command output tail; other repos still run; exit code 1 when any repo failed.
- Guard: `specflow deliver` (any subcommand except `status` and `--dry-run`) is treated like other outward-facing CLI actions: `ask` in the main session (deny in unattended modes, as today) and **denied for subagents** (add to PM_ONLY).
- The handoff file and `status <id>` show the delivery table (repo, PR url, state).

## H3. Release configuration
Config `release` (extends Phase 2's `{ by_ai }`):
```json
"release": {
  "by_ai": false,
  "steps": [
    { "name": "deploy-backend", "repo": "wali-backend", "run": "<shell command>", "kind": "deploy", "approval": "ask", "timeout_s": 900 }
  ],
  "post_release": [
    { "name": "health", "run": "<shell command>", "timeout_s": 120 }
  ],
  "require_merged": true
}
```
`kind`: deploy | migrate | restart | smoke | other. `approval`: ask | none (`migrate` and `restart` are always treated as ask). Steps run in array order; `repo` sets the working directory (root when absent).
CLI: `release step add <name> --run "<cmd>" [--repo r --kind k --approval ask|none --timeout s --post]`, `release step rm <name> [--post]`, `release step list`, `release set --by-ai true|false`, `release set --require-merged true|false`. Validate names unique, repos registered, kinds/approvals known.

## H4. Release runs
- `release plan <id>`: prints the steps with their approval mode and writes `specs/<dir>/release.md` (generated; regenerated each time): item, repos and their delivered PRs, migrations (from traits), the steps in order, post-release checks, a rollback section placeholder the release role fills, and the line "Generated by specflow release plan". Works whether or not `by_ai` is on; with `by_ai` off this is the document the owner follows.
- `release run <id> [--step <name>]`: only when `release.by_ai` is true. Preconditions: stage `accepted`, `acceptance` gate approved, no open blockers, and when `require_merged` and delivery mode is not `commit`, every repo's PR is MERGED (from `deliver status`). Without `--step`, runs every step whose approval is `none` until it reaches the first step that needs approval, and stops there telling the PM to run `release run <id> --step <that name>` (one approval prompt per risky step, see guard). With `--step`, runs that one step. Each step: `spawnSync` with `shell: true`, cwd, timeout; records evidence `--kind release --repo <repo|all> --result pass|fail --note "<step name>"` with command, exit code and tail (reuse `appendEvidence`). Stops at the first failure. Progress is stored on the item (`release_progress: { <step>: { result, at } }`) so a re-run skips passed steps unless `--again`.
- When every step has passed, print "all release steps passed: run `specflow stage set <id> released`" (the existing entry check already needs release evidence; also require that every configured step passed when steps exist).
- `release verify <id>`: runs the `post_release` checks; records `--kind post-release` evidence pass/fail per check. Allowed at stage `released`.
- Guard: `release run` and `release verify` are `ask` in the main session with the step name(s) in the reason, deny in unattended modes, deny for subagents.

## H5. Release role and setup
- Team role `release` (agent `agents/release-manager.md`, default model `sonnet`, enabled = `release.by_ai`). Contract as in G3. Its job: read the repos' instructions and docs for deployment sections, draft or update `release.steps` **as a proposal** (it writes `specs/<dir>/release.md`'s rollback section and returns proposed `release step add` commands in its report for the PM to confirm with the user — it never adds steps itself), check migrations against the plan, and fill the rollback notes. It never runs `release run` (PM-only).
- `dispatch`: at `accepted` with the acceptance gate approved → role `release` when enabled, else `pm`.
- Setup: when `release.by_ai` is answered yes, `setup questions` adds `release.steps` ("Which commands deploy each repo? The release role can draft them from your docs") with default "draft from docs"; `specflow:setup` then dispatches the release role to draft and shows the proposal to the user before adding steps.

## H6. Wire the Phase 2 settings (fix from review)
- Dispatch prompt for `builder`, `lead` and `verifier` includes a `Testing:` line: unit tests required yes/no and the data rules text when set. The verify skill: when `testing.unit_required` is on and the diff adds logic without tests, that is a blocking finding.
- Setup `why` texts become accurate for `testing.*` and `release.by_ai` (describe what now happens).
- `tools.graphify` stays recorded only (Phase 4 uses it); its `why` must say so.

## H7. Skills and docs
- [flow](../plugins/specflow/skills/flow/SKILL.md): after `accepted`: `deliver <id> --dry-run` → explain → `deliver <id>` → tell the user the PR links (one message) → `deliver status` when the user says they merged → acceptance gate → `release plan` → (by_ai) dispatch release role, confirm proposed steps with the user, `release run` step by step → `stage set released` → `release verify` → `stage set done`. During a rework round, never deliver; after rework, `deliver` updates the same PRs.
- [verify](../plugins/specflow/skills/verify/SKILL.md): unit-test rule from H6.
- `_shared/lifecycle.md`: delivery and release section (short). README: delivery and release commands, a "Releasing with specflow" section with a neutral example config (no real hosts). CHANGELOG `[0.7.0]`. docs/architecture.md: pipelines.
- Workspace CLAUDE.md block: "Pushes, PRs and releases go through `specflow deliver` and `specflow release`, run by the PM."

## H8. Migration and release
Migration `0.7.0`: extends `release` with `steps: []`, `post_release: []`, `require_merged: true` (keeps `by_ai`), adds team role `release` (`enabled` = `release.by_ai`, model sonnet); additive only. Version 0.7.0 in plugin.json and package.json.

## H9. Acceptance criteria (Phase 3)
1. `npm test` passes; `tests/phase3.test.mjs` covers: deliver preconditions (each refusal), dry run changes nothing, push to the local bare remote, PR create vs reuse (OPEN) vs refuse (MERGED/CLOSED) with the fake gh, delivery record and evidence, partial failure exit code, `deliver status` merge evidence once, `deliver merge` mode and gate checks, refusal during a rework round, release step add/rm/validate, `release plan` file, `release run` preconditions, stop at the first approval step, `--step`, failure stops and progress skip/`--again`, `released` entry needs all steps, `release verify` evidence, guard (ask main / deny subagent / deny unattended; `deliver status` and `--dry-run` not guarded), dispatch to `release` role, testing line in dispatch prompts, migration 0.7.0 from 0.6.0 and chained from 0.4.0.
2. `claude plugin validate plugins/specflow` passes.
3. README, HELP, skills and agents agree; version 0.7.0 everywhere.
4. Implementation Log: append `### Phase 3 (0.7.0)`.

## Review of Phase 3 (Opus, 2026-10-20)
- Full suite re-run: 106/106 pass. Read the deliver, release and guard changes against Part H; the 8 recorded deviations are accepted (deviation 3 is a correct fix to the spec).
- Checked: `git push` is never forced; PRs are reused when OPEN and never reopened when MERGED/CLOSED; preconditions refuse stale evidence, open rework rounds and blockers; release steps needing approval stop the run.
- Fixed in review: the guard exempted `deliver` as a dry run whenever `--dry-run` appeared anywhere later on the command line, including inside a shell comment (`specflow deliver F-1 # --dry-run` would have pushed without a prompt). The exemption is now judged per shell segment with comments stripped; four test assertions added (P3-8).
- Smoke test on the copy of Wali's state (Wali untouched): upgrade 0.6.0 -> 0.7.0 applied, `validate` clean; `deliver F-005 --dry-run` refuses with the right reasons; `release plan F-005` writes the plan with the migration warning.
- Not verified: real `gh` output (the "no pull request found" detection is a regex on gh's stderr), guard prompts and `agent_id` in a live session, Node 18, macOS/Linux.
- Stopped after Phase 3.
