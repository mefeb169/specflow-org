# Evidence tags and instruction precedence

Tag every claim about the existing project:

| Tag | Meaning |
|---|---|
| `[code]` | Seen in the implementation (cite file:line or path) |
| `[run]` | Confirmed by running a command (cite the command and result) |
| `[doc]` | Stated only in documentation, not verified against code |
| `[planned]` | A spec, backlog item or roadmap entry, not yet built |
| `[unknown]` | Not determined; say what would resolve it |
| `[conflict]` | Two sources disagree; name both |

Documentation alone never earns `[code]`. Missing documentation does not mean functionality is absent.
A feature is never "done" because of its title, a ticked task, or unverified code.

## Instruction precedence (highest first)
1. The user's explicit instruction in this session.
2. Repo-level instructions (`<repo>/CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, ...) for work inside that repo.
3. Workspace `CLAUDE.md` (non-framework content).
4. The Spec Kit constitution (`.specify/memory/constitution.md`) for specs, plans and tasks.
5. Framework defaults (the sdlc role skills).

## Design authority (UI work), highest first
1. The user's explicit design direction in this session.
2. The existing design system in code and the repo's own UI instructions.
3. `.sdlc/design-system.md`.
4. `frontend-design` defaults (aesthetic guidance, applied by `sdlc-ux`).

Cross-level conflict that changes behavior: apply the higher source AND record it in `.sdlc/workspace-map.md` under Conflicts.
Same-level conflict: stop and ask the user. Never overwrite an existing instruction file without approval.
