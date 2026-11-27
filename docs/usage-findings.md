# Token usage findings (2026-11-27)

Measured from Claude Code's own transcripts of the three workspaces that use specflow. This is the baseline for 0.9.0: compare later runs with `specflow usage --since 2026-11-27` in each workspace.

| Workspace | Transcript folder | Transcripts | Total tokens | Finished items | Avg per finished item |
|---|---|---|---|---|---|
| Wali App (`D:\Work\Wali_app`) | `~/.claude/projects/d--Work-Wali-app` | 55 | 779.3M | 17 | 34.3M |
| madfit (`D:\Work\madfit`) | `~/.claude/projects/d--Work-madfit` | 21 | 1,065.8M | 48 | 19.0M |
| HJI (`D:\Work\HJI\source`) | `~/.claude/projects/d--Work-HJI-source` | 24 | 344.9M | 12 | 23.1M |

"Tokens" = input + cache write + cache read + output for every model turn. Cache reads dominate (for F-162 only 4.6M of 157M were fresh input), so totals overstate cost compared with fresh tokens. Finished = accepted, released or done. All workspaces were on 0.8.0 at the time.

## How it was measured
- `specflow usage [id]` (0.9.0): tokens per item and role. Subagents are attributed by their `specflow dispatch: role <r>. <id>` prompt (227 of 260 Wali subagents carry it) and `meta.json` agent type; PM turns count toward the item named in the PM's last `specflow` command (an estimate). Usage lines repeated for one message id are counted once.
- One-off scripts in [usage-analysis/](usage-analysis/) (absolute paths to the three workspaces; run with `node docs/usage-analysis/<name>.mjs`):
  - `agg.mjs`: tokens by role, and by complexity and lane;
  - `builder.mjs`: what drives builder cost;
  - `bash.mjs`: the Bash commands builders ran, and the costliest builder runs;
  - `split.mjs`: simulation of shorter builder runs;
  - `pm.mjs`: what fills PM context;
  - `pmsim.mjs`: PM session budgets;
  - `pmctx.mjs`: PM context before and after 0.8.0;
  - `first.mjs`: first-turn context.

## 1. Where the tokens go (share of each workspace's total)

| Role | Wali App | madfit | HJI |
|---|---|---|---|
| PM (main session) | **52%** (403.8M) | **41%** (434.3M) | **49%** (167.3M) |
| builder | 29% (223.8M, 80 agents) | 35% (375.4M, 93) | 13% (44.4M, 27) |
| architect | 6% | 7% | 27% (93.2M) |
| product | 5% | 1% | 5% |
| verifier | 1% | 7% | 2% |
| reviewer (dispatched `--role reviewer`) | 3% | 0% | 1% |
| independent-reviewer | 0% | 1% | 0% |
| ux | 1% | 1% | 0% |
| general-purpose / fork (not via dispatch) | 2% | 6% (67.9M) | 3% |

**Conclusion:** cost is the PM session plus builders. Product, UX, verifier and reviewers are each 7% or less. Routing "fewer specialists per task" saves almost nothing.

By complexity (as `models.mjs` rates the item now): low/lite items average 1.1M to 2.2M tokens. Reviewer share per complexity bucket is 0-7%.

Unattributed bucket:
- Wali App: 156.0M, of which 144.8M are PM turns before any item was named (discussion, setup).
- madfit: 103.7M, of which 67.7M are general-purpose agents spawned outside dispatch.
- HJI: 16.2M.

## 2. PM session

Context per main-session turn, before and after 0.8.0 (session budget, released 2026-11-15):

| Workspace | Period | Turns | Median context | p90 | Turns over 150k |
|---|---|---|---|---|---|
| Wali App | before | 1,706 | 119k | 305k | 35% |
| Wali App | after | 1,344 | 101k | 162k | 16% |
| madfit | before | 2,027 | 176k | 374k | 57% |
| madfit | after | 322 | 92k | 142k | 5% |
| HJI | before | 686 | 102k | 309k | 34% |
| HJI | after | 639 | 108k | 144k | 5% |

- **The 0.8.0 budget works on the tail; the median stays near 100k.** A fresh session already starts at 51-56k tokens, almost all Claude Code's own system prompt and tools. Workspace CLAUDE.md files are 12.9 KB (Wali App), 6.6 KB (madfit) and 10.2 KB (HJI); the specflow block is 2 KB of that.
- **Lower budget (simulated, since 0.8.0).** A fresh session is costed at 62k plus 3 extra turns, and you are assumed to restart when asked:

  | Budget | Wali App | madfit | HJI |
  |---|---|---|---|
  | 120k | -21% | -16% | -18% |
  | 100k | -26% | -19% | -23% |
  | 90k | -27% | -21% | -24% |

  The gain flattens below 100k, so 0.9.0 uses 100k.
- **What the PM reads (tool output, since 0.8.0):**
  - Wali App: Read 33% (128 calls, about 6k characters each), WebSearch 7%, Artifact 6%, `sed`/`cat`/`grep`/`ls` together about 16%.
  - HJI: Artifact 19%, git 16%, Read 11%.
  - madfit: mostly specflow CLI output.
  - In every workspace, the PM reads and researches in the main session.
- **The dispatch loop itself is cheap.** Median 0-1 PM turns per finished subagent, and 2-3 PM turns per user message, so merging CLI calls would not help.
- **The PM runs on Opus** in most sessions. Running routine dispatch sessions on Sonnet (`/model`) is the largest lever left, and the framework cannot set it.

## 3. Builders

| | Wali App | madfit | HJI |
|---|---|---|---|
| builder runs | 80 | 93 | 27 |
| turns per run, median / p90 | 23 / 55 | 31 / 84 | 20 / 55 |
| context at start (median) | 22k | 17k | 18k |
| peak context, median / p90 | 58k / 168k | 70k / 208k | 51k / 117k |
| share used by the costliest 10% of runs | **57%** | **47%** | **38%** |
| rework-round runs (share of builder tokens) | 40 (18%) | 22 (20%) | 13 (17%) |
| runs that read images | 0 | 33 | 0 |

What fills builder context (share of characters returned by tools):

| Source | Wali App | madfit | HJI |
|---|---|---|---|
| Bash, other (mostly `sed`, `cat`, `grep` reading files) | 43% | 44% | 22% |
| Read | 25% | 10% | 48% |
| Read, images | 0 | 25% | 0 |
| test and build output | 14% | 11% | 14% |
| git | 10% | 7% | 12% |
| specflow CLI | 3% | 2% | 2% |
| graphify | 2% | (unused) | 1% |

- **File reading is 60-70% of builder input.**
  - Wali App: `sed` 36%, `cat` 28% (about 4k characters per call), `grep` 19%.
  - madfit: `cat` 43% (about 6k characters per call), `sed` 22%, `grep` 10%.
- **Costliest runs:**
  - madfit F-128 builder: 50.3M tokens, 236 turns;
  - Wali App F-162: 34.5M, 161 turns;
  - F-163: 23.1M, 131 turns;
  - F-161: 21.4M, 120 turns.
- **Shorter runs (simulated).** The real per-turn context curves were cut into shorter runs, each fresh builder costed at +15k context and +5 turns:

  | Cut every | Wali App | madfit | HJI |
  |---|---|---|---|
  | 60 turns | -21% | -24% | -2% |
  | 40 turns | -29% | -36% | -11% |
  | 25 turns | -37% | -44% | -18% |

## 4. Other observations
- **Main session:** it loaded only `specflow:flow` (23, 15 and 17 times) and, in HJI, `discover` twice. It never loaded a role skill. Making role skills dispatch-only would save only their listing lines.
- **Subagents:**
  - None read `.specflow/workspace-map.md` (0 of 260, 311 and 128).
  - Wali App subagents use graphify (254 of 260), because the PM context asks them to. HJI used it in 32 of 128; madfit not at all.
  - Each subagent reads its skill file plus `role-contract.md` on every run (role-contract 143 times in Wali App), about 1.5-2k tokens each. Acceptable.
- **Images in madfit:** 1,921 image reads, of which 109 were in the main session. By role: builder 978, verifier 498, general-purpose 248, ux 42, independent-reviewer 16, product 16, architect 14. 1,308 were screenshots in temp scratchpads. In Wali App, one scratchpad screenshot (`s.png`) was read 86 times.
- **Example item, F-162 (Wali App):** builder 62.9M (20 agents, sonnet), PM 55.0M, reviewer 11.3M (12 agents, opus, since the item is rated high complexity), general-purpose 10.5M, product 7.7M, architect 7.3M, verifier 1.4M, ux 1.2M.

## 5. Decisions taken from this (0.9.0)

| Finding | Action |
|---|---|
| Long builder runs dominate | Task batches: `team.builder_batch` (default 5) per dispatch; soft limit of about 40 tool calls |
| Builders read whole files | Build skill: search first, read slices, no whole-file `cat`, no re-reads; the architect names files per task |
| Image loops (madfit) | Build: at most 3 cropped screenshots, no loops; verify/ux: one cropped screenshot per key screen |
| Test output 11-14% | Build: targeted tests, quiet reporter, keep failures only |
| Rework 17-20% | Rework dispatch line: fix only the findings for that repo |
| PM median context near 100k | Budget 100k / repeat 50k (migration lowers only the untouched 0.8.0 defaults) |
| PM reads and researches itself | Flow skill: CLI output and handoff only; questions go to a role or a read-only Explore agent; no general-purpose agents for role work |

**Rejected, with reasons:**
- **Complexity-based role routing:** reviewers and specialists cost 0-7%.
- **Dispatch-only role skills:** the PM never loaded one.
- **Repo-profile pointer in dispatch:** no agent reads the map, and graphify covers it.
- **Max-concurrency of 1 for subagents:** it saves no tokens.
- **Prices in `usage`:** they go out of date.

## 6. Caveats
- PM attribution is an estimate: turns count toward the last item named in a `specflow` command.
- The simulations assume context grows as it did in the real runs, and that the user restarts when the budget hook asks.
- The savings figures are upper-bound estimates until measured. Re-measure after a few features on 0.9.0 with `specflow usage --since 2026-11-27`, and the same scripts with the date changed.

## 7. Clear points (0.10.0)

`docs/usage-analysis/clearsim.mjs`: restart the PM session at a workflow boundary (gate approved, stage to verifying/accepted/released/done, rework start) once context passes a soft threshold; hard budget 100k always applies. Restart costs 62k + 3 turns, main sessions since 2026-11-16.

| Option | Wali App | madfit | HJI | Average |
|---|---|---|---|---|
| a. hard 100k only (0.9.0) | 26% | 19% | 23% | 22.7% |
| b. boundary, soft 60k | 26% | 17% | 22% | 21.7% |
| b. boundary, soft 70k | 26% | 20% | 24% | 23.3% |
| b. boundary, soft 80k | 27% | 21% | 24% | **24.0%** |
| b. boundary, soft 90k | 26% | 19% | 24% | 23.0% |
| c. every dispatch return | 26% | 18% | 22% | 22.0% |

(Tokens saved versus the actual PM context tokens.) Clearing after every dispatch return is no better than the plain budget, as predicted: a restart costs more than a builder batch adds to the PM context.

**Decision:** the best boundary option (soft 80k) beats the hard budget by 1.3 points, under the 3-point rule, so `session.clear_at` defaults to `budget` (0.9.0 behaviour) and boundary clearing is opt-in (`clear_at: boundary`, `soft_budget` 80000). The bigger lever is the builder side (task cards, section 3).
