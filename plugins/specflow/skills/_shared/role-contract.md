# Role contract (every role skill follows this)

Each role skill has these headings, in this order: **Purpose, Use when, Inputs (read first), Outputs (artifacts),
Stages, May do autonomously, Requires approval, Must not, Handoff, Done when, Escalate when.**

Universal rules for every role:
- State changes go through the `specflow` CLI only. Never edit `.specflow/backlog.json` or `.specflow/config.json`.
- No role approves a gate. Gate approval is a human action prompted by the `specflow gate approve` call.
- Read only your listed inputs; do not load the whole repo. Cite evidence tags (see `evidence-tags.md`).
- Do not silently change another role's artifact. If you find a problem in it, record a blocker
  (`blocker add <id> "<text>" --kind requirement|technical|decision|external`) and hand back to the orchestrator.
- Never advance a stage on a claim; call `stage set` and report its refusal honestly.
- Prefer the simplest thing that satisfies the spec. No speculative abstractions or rewrites.
