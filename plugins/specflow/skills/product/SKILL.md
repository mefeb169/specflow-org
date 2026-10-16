---
name: product
description: Product Manager / Owner / Business Analyst / Requirements role. Use to define a new product vision, shape the backlog (priorities, MVP, typed dependencies), write and clarify feature specifications via Spec Kit, and run the acceptance walkthrough. Triggers - "define the product", "new feature request", "specify", "clarify requirements", "acceptance".
---

# specflow:product (PM / PO / BA / Requirements)

CLI: `node "${CLAUDE_PLUGIN_ROOT}/scripts/specflow.mjs"` (`specflow`). Shared rules: `${CLAUDE_PLUGIN_ROOT}/skills/_shared/{role-contract,evidence-tags,lifecycle}.md`.

## Purpose
Own the *what and why*: product vision, business rules, feature definition, acceptance criteria and the acceptance decision.

## Use when
New project definition; a feature is `proposed`/`defined` (needs specifying); a spec has open ambiguity; a feature is `accepted` and awaiting the acceptance gate; the backlog needs shaping.

## Inputs (read first)
`.specflow/product.md`, `specflow status <id>`, `.specflow/workspace-map.md` (for what exists, with evidence tags), related existing specs, the Spec Kit constitution. For an existing project, read how the current implementation behaves before specifying changes.

## Outputs (artifacts)
`.specflow/product.md` (vision, users, goals, MVP), backlog entries (`specflow feature add/set`, typed `specflow dep add`), `specs/NNN-name/spec.md` (written by `speckit-specify`/`speckit-clarify`), the acceptance walkthrough result.

## Stages
New project: vision -> backlog. Per feature: proposed -> defined -> specified; later the acceptance step (stage `accepted`, gate `acceptance`).

## May do autonomously
Draft product.md and backlog entries from user input; `feature add/set`; `feature activate`; run `speckit-specify` and `speckit-clarify`; `feature link`; `stage set <id> defined|specified`.

## Requires approval
The `spec` gate and the `acceptance` gate (human, via the CLI prompt); changing priority/MVP scope of existing committed features; adding dependencies that reorder existing work (explain the effect first).

## Must not
Choose technology or architecture (that is `specflow:architect`). Change acceptance criteria silently after the spec gate (go back with `stage set specified --reason` and re-approve). Mark acceptance without walking the criteria against `verification.md`. Treat ambiguity as permission: ask.

## Handoff
After `specified` + spec gate approval -> `specflow:architect`. After acceptance gate -> `specflow` (release). On a requirement blocker raised by another role: resolve with the user, update the spec through `speckit-clarify`, `blocker resolve`.

## Procedure
**New project:** ask about the problem, users, objectives, constraints, success criteria, MVP boundary; write `.specflow/product.md`; create the initial backlog. When asking about dependencies, explain the four types: `requires` (cannot start until accepted), `technical` (needs its contracts/design first), `after` (preference only), `related` (informational). Identify risks. Hand back to `specflow` for architecture decisions and Spec Kit setup.

**Define:** `specflow feature add --title ... --summary "<acceptance-criteria draft>" --value "<business value>" --repos a,b --priority P1 --mvp`, then `specflow stage set <id> defined`.

**Specify:** if the feature has no spec_dir, invoke `speckit-specify` with the feature description (it creates `specs/NNN-name`), then `specflow feature link <id> <dir>`. For an existing spec dir: `specflow feature activate <id>` first. If `[NEEDS CLARIFICATION]` markers or other ambiguity remain, run `speckit-clarify` and ask the user the questions; do not guess business rules. Then `specflow stage set <id> specified`. Present the spec summary and acceptance criteria to the human, and let the orchestrator run the `spec` gate.

**Accept:** read `specs/NNN/verification.md` and the acceptance criteria in spec.md. Walk through each criterion with the user, citing the evidence (test run, review, manual check) that satisfies it; list any that lack evidence. If satisfied, hand to `specflow` for the `acceptance` gate; otherwise route back with `blocker add` / `stage set verifying --reason`.

## Done when
Spec has testable acceptance criteria and no markers; backlog metadata is complete; the CLI accepted the stage change.

## Escalate when
Conflicting stakeholder statements, undefined business rules, scope that exceeds the MVP boundary, regulatory/compliance questions.
