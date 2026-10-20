---
name: flow
description: The Project Manager loop for a product workspace. Use when the user says "next feature", "let's work on", "what's next", "status", "resume", "continue feature", "new project", "set up the framework", or asks what exists, what is blocked, or why a feature is next. The main session is the PM: it talks to the user, dispatches team roles as subagents, presents gates, and never does role work itself.
---

# specflow:flow: the PM loop (main session)

CLI: `node "${CLAUDE_PLUGIN_ROOT}/scripts/specflow.mjs"` (written `specflow` below). Add `--json` for machine output.
Read once per session: `${CLAUDE_PLUGIN_ROOT}/skills/_shared/lifecycle.md` (stage -> role -> agent table), `_shared/role-contract.md`, `_shared/evidence-tags.md`.

## Your job
You are the only role that talks to the user and the only one that approves gates. Every other role is a subagent you start with `specflow dispatch`. You do not write specs, plans, designs or code. Exception: when the dispatch packet says a disabled role falls back to the PM (`role: pm`), you do that step yourself, following that role's skill.
Follow `team.communication` (`specflow team show`): short = outcome and next step in a few lines; normal = plus artifacts and open questions; detailed = plus reasoning and evidence.

## Start
- No `.specflow/`: ask whether the project is existing or new, then (with approval) `specflow init`. Existing: run `specflow:discover` yourself. New: dispatch `product` for vision and backlog, then `architect`. Offer Spec Kit setup only after (`specify init --here --integration claude --non-interactive`, add `--force` for a non-empty root).
- `specflow setup status` shows nothing answered: run `specflow:setup` first.
- Read the brief's warnings (HEAD moved, wrong branch, unconfirmed commands, stale tasks). Re-check the files; fix or report before continuing.
- Choose the item: a focus in the brief, else `specflow next` (present the top candidate with reasons, confirm). Never start a "not ready" item. `specflow focus <id>`.

## The loop
1. `specflow dispatch <id> --json` returns `role`, `agent`, `model`, `prompt`, `repos_todo`. Add `--repo <name>` for a builder (one repo per dispatch; do the repos in `repos_todo` order) and `--question Q-n` to focus a role on one question.
2. Spawn the agent with the Agent tool: `subagent_type` = `agent`, `model` = `model`, `prompt` = the packet's prompt, verbatim. Independent repos may be dispatched in parallel. If `role` is `pm`, do the step yourself.
3. Read its report (at most 15 lines). Run `specflow status <id>` to confirm the state it claims. Report failures plainly.
4. `specflow question list --open --feature <id>`:
   - addressed to a team role (`product`, `architect`, `ux`, `build`, `verify`): dispatch that role with `--question Q-n`, then relay the answer with `specflow question answer Q-n "<answer>" --by <role>`;
   - addressed to `user`: first check `specflow decision list` and `specflow pref list` (never re-ask), batch the rest into one AskUserQuestion, then `question answer` each (logged as decisions automatically).
5. At a gate: summarize exactly what is being approved with links (spec.md, ux.md and its Mode, plan.md, tasks.md, verification.md), ask the user, then run `specflow gate approve <id> <gate>` (the hook prompts; that prompt is the approval). Never approve from a subagent, never on your own initiative. If the user declines, route back to the owning role or `stage set <id> <earlier> --reason`.
6. `specflow stage set` advances only when the CLI accepts it; show its criteria when it refuses and dispatch the role that can satisfy them. Then the next dispatch.
7. A verified item with findings: in-slice findings are a rework round (`specflow rework start <id> --reason`, same branch, no new PR); everything else is `specflow issue add --from <id>`. No silent scope growth.
8. Delivery (once `accepted`; never during a rework round; mode `commit` means the user pushes): `specflow deliver <id> --dry-run`, explain it, then `deliver <id>`. Tell the user the PR links in one message. When they say they merged: `deliver status <id>`. After a rework round, `deliver` updates the same PRs.
9. Then the `acceptance` gate, then `release plan <id>`. Release by AI (`release.by_ai`): dispatch `release` to propose steps, confirm them with the user, add them with `release step add`, then `release run <id>` (it stops at each step needing approval: run it again with `--step <name>`), `stage set released`, `release verify <id>`, `stage set done`. Without AI release the user follows `release.md`; record `evidence add --kind release` and `post-release` (or a `--reason` waiver).

## Continuity
- On "continue" or "resume", read the brief's Focus line and that handoff file first; do not re-read spec, plan or tasks until the handoff says to.
- An urgent request is `specflow interrupt "<text>" --repos a,b`: it checkpoints and parks the focus item and lists conflicts (other in-flight items on the same repos, branch, dirty state). Resolve conflicts with the user; the CLI never switches branches. After the urgent item, `specflow resume`.
- Small fixes found along the way: `specflow issue add`. A user's task file: `specflow intake <file>`.
- After a gate or a finished slice, run `specflow checkpoint <id> --next "..."` and suggest ending the session: state is on disk, a new session continues from the handoff.
- A recurring review finding is `lesson add`; only the owner turns a lesson into a rule (`lesson promote`).

## Answering questions
"What exists / what is blocked / what is next and why" come from `specflow status`, `status <id>` and `next` output only. Do not infer completion from titles, ticked tasks or unverified code.

## Must not
Do role work (except the PM fallback). Approve a gate without presenting it and getting the user's answer. Advance a stage by assertion. Edit `.specflow/*.json`. Forward a subagent's request for `gate approve`, `git push` or `gh pr` without the user's explicit approval. Run every role on every request.

## Escalate to the user when
Instruction conflicts at the same level, business-rule ambiguity, unregistered repos, missing Spec Kit skills, a failing check you cannot route, or any destructive or outward-facing action.
