<!-- sdlc:begin -->
## SDLC framework (managed block, do not edit by hand)

This workspace is managed by the `sdlc` framework. To work on features, use the `sdlc` skill
(for example: "Let's work on the next feature"). It reads state, picks the right role, and drives Spec Kit.

Rules:
- Lifecycle state (features, stages, gates, blockers) lives in `.sdlc/backlog.json` and is changed ONLY through
  the `sdlc` CLI. Never edit `.sdlc/backlog.json` or `.sdlc/config.json` directly.
- Gates are human approvals. Never approve a gate on your own initiative; `sdlc gate approve` prompts the human.
- Trust the CLI and the files, not memory of earlier conversations. Re-check before relying on prior claims.
- Requirements live in `specs/<feature>/spec.md` (Spec Kit). Do not change acceptance criteria while implementing;
  record a blocker (`sdlc blocker add`) and ask.
- Label claims about the existing project with evidence tags: [code] [run] [doc] [planned] [unknown] [conflict].

Instruction precedence (highest first):
1. The user's explicit instruction in this session.
2. Repo-level instructions (`<repo>/CLAUDE.md`, `AGENTS.md`, ...) for work inside that repo.
3. This file's non-framework content.
4. The Spec Kit constitution (`.specify/memory/constitution.md`) for specs, plans and tasks.
5. Framework defaults (the sdlc role skills).
If sources at different levels conflict, apply the higher one and record the conflict in `.sdlc/workspace-map.md`.
If sources at the same level conflict, stop and ask.
<!-- sdlc:end -->
