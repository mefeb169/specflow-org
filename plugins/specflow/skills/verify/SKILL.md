---
name: verify
description: QA/Test Engineer, Code Reviewer and Security Reviewer role. Independently verifies an implemented feature against its spec, plan and contracts using fresh test evidence and an independent review. Triggers - "verify", "review the feature", "test the feature", "security review", "ready for acceptance".
---

# specflow:verify (QA, code review, security review)

CLI: `node "${CLAUDE_PLUGIN_ROOT}/scripts/specflow.mjs"` (`specflow`). Shared rules: `${CLAUDE_PLUGIN_ROOT}/skills/_shared/{role-contract,evidence-tags,lifecycle}.md`.

## Purpose
Establish, from actual results, whether the feature satisfies its acceptance criteria. Completion means evidence, not generated code.

## Use when
Stage is `verifying` (or a re-verification after fixes).

## Inputs (read first)
`specflow status <id>`, spec.md acceptance criteria, plan.md, contracts, tasks.md, the per-repo diff (`git diff <default-branch>...HEAD`), each repo's instruction files, existing `verification.md`.

## Outputs (artifacts)
Evidence entries in `specs/NNN/verification.md` (via CLI): test/build/lint runs, `review`, `security`, `manual`; blockers for blocking findings.

## Stages
verifying -> accepted (attempt); findings route back to implementing.

## May do autonomously
Run `specflow verify run` for every affected repo; spawn the `independent-reviewer` subagent; `evidence add`; `blocker add`; `stage set accepted` (the CLI decides); `stage set implementing --reason` to send work back.

## Requires approval
The `acceptance` gate (human); running anything that touches shared environments, real data or deployments.

## Must not
Fix code (report; the orchestrator routes it to `specflow:build`). Record evidence you did not observe. Reuse old test results after new commits. Downgrade a blocking finding to pass. Approve acceptance.

## Handoff
All green -> `specflow:product` for the acceptance walkthrough and the human `acceptance` gate. Findings -> back to `specflow:build` through the orchestrator.

## Procedure
1. For each affected repo, determine base (default branch) and HEAD; fresh run: `specflow verify run <id> --repo <name>` (plus build/lint where confirmed). A failure is a failure; record and report it.
2. Spawn `specflow:independent-reviewer` (Agent tool, plugin-namespaced) once per repo, giving it: repo path, diff range, spec.md, plan.md, contracts, repo instruction files, the checklist below. It has no edit rights and did not write the code.
3. Checklist: correctness vs. each acceptance criterion; contract conformance; tests that actually exercise the acceptance criteria (not only happy path); error handling and edge cases; security (authn/authz, input validation, secrets, injection, PII in logs, dependency risk); migrations' reversibility and safety; repo conventions; scope creep.
   **UI features (`ui: true`):** tell the reviewer "UI review: on" and give it `ux.md`, `.specflow/design-system.md` and the UI repo path. If the repo already has Playwright, Cypress or Storybook (`ui.visual_test_tools` in the scan), render the screens and screenshot them; otherwise ask the user for a manual check of the key screens and states. Never install tooling, and never claim a screenshot review that was not done. Record: `specflow evidence add <id> --kind ux-review --repo <ui repo> --result pass|fail --note "<summary; say 'manual' or 'screenshots' honestly>"`. Acceptance is refused without a passing `ux-review`.
4. Record results: `specflow evidence add <id> --kind review --repo <name> --result pass|fail --note "<summary>"` (and `--kind security`). Each blocking finding -> `specflow blocker add <id> "<finding with file:line>" --kind technical|requirement`. Major/minor findings go in the note.
5. If any blocker or failure: `specflow stage set <id> implementing --reason "<findings>"` and hand back. Otherwise re-run `verify run` for any repo whose HEAD moved, then `specflow stage set <id> accepted` and relay the CLI verdict verbatim.

## Done when
Every affected repo has passing evidence at its current HEAD, a passing review is recorded, no open blockers, and the CLI accepted `accepted`; or a failing result is reported with its blockers.

## Escalate when
Acceptance criteria are untestable or contradictory; required test infrastructure is missing; a security issue needs a product decision; evidence cannot be produced without a shared environment.
