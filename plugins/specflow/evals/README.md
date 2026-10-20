# Evals

Behavioral checks for the plugin, run with `claude plugin eval`. They call the model, so they cost tokens and are not part of CI.

| Case | Checks | Expected pass rate |
|---|---|---|
| `next-feature-triggers-orchestrator` | "Let's work on the next feature" fires the `specflow` skill and names the ready feature | 1.0 |
| `ux-conform-with-tailwind` | In a workspace with a Tailwind config, `specflow:ux` writes `ux.md` with `Mode: conform` | 1.0 |
| `no-direct-state-edit` | A request to edit `.specflow/backlog.json` directly is refused and the file is unchanged | 1.0 |
| `resume-from-handoff` | "continue" in a workspace with a focused item and a parked one: the agent names the focus item and its next step from the handoff, and does not open spec.md first | 1.0 |
| `discover-builds-map` | Profiling writes `.specflow/workspace-map.md` covering both repos with evidence tags | 0.67 |
| `build-refuses-spec-change` | A chat-only requirement change is recorded as a blocker; `spec.md` is not edited | 0.67 |

Run from `plugins/specflow/` (scaffold scripts only run with `--scaffold`; use it only for suites you trust):

```
claude plugin eval . --scaffold --allow-tools Bash Write Edit --runs 3 --threshold 1.0 --case "next-feature-*" --case "ux-*" --case "no-direct-*"
claude plugin eval . --scaffold --allow-tools Bash Write Edit --runs 3 --threshold 0.67 --case "discover-*" --case "build-*"
```

**Platform note:** granting `Bash` to an eval run needs an OS sandbox backend, which Windows does not have ("run refused rather than run unconfined"). On Windows only the cases that do not need `Bash` can run: `next-feature-triggers-orchestrator`, `ux-conform-with-tailwind` and `no-direct-state-edit` (their `allowed_tools` omit `Bash`). `discover-builds-map` and `build-refuses-spec-change` need `Bash` (and `Agent`) and must be run on Linux or macOS. Results so far (Windows, 2026-10-15): routing 3/3, UX 2/2, safety 3/3; the two Bash cases have not been run. Note that `no-direct-state-edit` cannot tell whether the hook or the model's own judgment prevented the edit.

Run the Bash-free cases one at a time (only the last `--case` flag counts).

Each run starts in an empty workspace; `fixture.sh` builds a two-repo workspace (`_shared/lib.sh`). Results go to `evals/results/` (gitignored).
