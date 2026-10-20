# Role contract (every role skill follows this)

Each role skill has these headings, in this order: **Purpose, Use when, Inputs (read first), Outputs (artifacts),
Stages, May do autonomously, Requires approval, Must not, Handoff, Done when, Escalate when.** A final section, **When dispatched as a subagent**, points to the subagent contract in the role's agent file (`agents/<role>.md`).

Universal rules for every role:
- State changes go through the `specflow` CLI only. Never edit `.specflow/backlog.json`, `config.json` or `memory.json`.
- No role approves a gate. Gate approval is a human action prompted by the `specflow gate approve` call.
- Read only your listed inputs; do not load the whole repo. Cite evidence tags (see `evidence-tags.md`).
- Do not silently change another role's artifact. If you find a problem in it, record a blocker
  (`blocker add <id> "<text>" --kind requirement|technical|decision|external`) and hand back to the orchestrator.
- Never advance a stage on a claim; call `stage set` and report its refusal honestly.
- Prefer the simplest thing that satisfies the spec. No speculative abstractions or rewrites.
- Artifact budgets: a spec for a slice is about 8 KB; verification.md is a summary table, raw output stays in the evidence cache.
- A new problem found outside the current item's scope becomes `specflow issue add "<text>" --from <id>`. Never grow the scope silently.
- Questions go to `specflow question add`; answers are logged (`question answer`) and never asked again (`decision list`, `pref list`).
- When you hand back, run `specflow checkpoint <id> --next "<the next step>"`.
