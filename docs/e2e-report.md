# End-to-end run report (2026-10-15)

One feature, taken from `proposed` to `accepted` through the installed plugin and real Spec Kit 1.2.0.

## Setup
- Sample product in a temp directory: `api/` (framework-free Node HTTP handler, node:test) and `web/` (ES modules, node:test, `react` listed as a dependency but not installed), each its own git repo, root not a git repo. Repo-level instruction files in both.
- Spec Kit: `specify init --here --integration claude --script sh` (Windows PowerShell policy blocks the default `.ps1` scripts).
- Plugin: installed from the local marketplace at **project scope** (`claude plugin marketplace add D:/Work/skill-framework --scope project`, then `install specflow-org@specflow-org-marketplace`). `sdlc init` was run directly.
- Each stage was one non-interactive `claude -p` session with `--permission-mode acceptEdits`, driven by a plain-language prompt.
- **The human steps were played by the test harness, not a person:** I ran `gate approve` (spec, design, implement, acceptance), `branches create` and the final manual `ux-review` evidence myself in a throwaway workspace, because `-p` sessions cannot answer the hook's approval prompts (by design). I also answered the product questions. This validates the flow, not the human experience of approving.

## What happened

| Step | Result |
|---|---|
| Define + specify | Orchestrator routed to product; `feature add`, `speckit-specify`, linked the spec dir. It listed 7 open questions instead of guessing; the CLI refused `specified` while markers remained |
| Clarify | Answers folded into the spec by `speckit-clarify`; markers gone; CLI accepted `specified` |
| UX | `sdlc-ux` wrote a complete `ux.md` (mode conform, all states, copy, accessibility) |
| Design | `speckit-plan` produced plan, research, data model, OpenAPI contract and the Repository Impact table; CLI accepted `designed` after the spec gate |
| Tasks | `speckit-tasks`: 12 tasks, all tagged `[repo:api]`/`[repo:web]` (`check tasks` clean); `speckit-analyze` run, findings fixed, recorded as evidence; `planned` after the design gate |
| Build | Both repos implemented in deploy order, local commits on `001-greeting-endpoint`, 8/8 (api) and 9/9 (web) tests, `verifying` accepted. I re-ran both suites myself afterward: same counts |
| Verify | Tests re-run at HEAD, one independent review per repo (UI review on for web), review and security evidence recorded. The CLI refused `accepted` because no `ux-review` existed, and the verifier **declined to fabricate one** for a UI nobody had rendered |
| Accept | I recorded a manual `ux-review` with an accurate note (code-level only, no page to render, no screenshots) and the CLI accepted `accepted`; acceptance gate approved |

The feature history in `.sdlc/backlog.json` records every transition, gate and evidence entry.

## Friction found and fixed
1. **Guard false positive:** the model wrote `spec.md` with a `cat > ... <<EOF` heredoc whose text mentioned `sdlc branches create`; the guard matched the prose and blocked the write (the model recovered with the Write tool). Fixed: bodies of `cat` heredocs are ignored, heredocs fed to other programs are still inspected (test GRD-4).
2. **Design-system-less UI:** `sdlc-ux` chose conform for a one-line UI change with no design system. Reasonable, but undocumented; the skill now says so explicitly and when to use direction mode instead.
3. **Missing UI context:** the first UX run (in an earlier fixture) ignored a Tailwind config because the scan's evidence was not surfaced; fixed earlier by showing it in `sdlc status`.

## Observed but not changed
- The fixture's `web` repo had no app shell; the architect flagged it and asked for a decision, the verifier flagged that the greeting is only met "at string level". The system surfaced a real product gap rather than hiding it.
- Spec Kit's constitution stayed the unfilled template, so constitution checks passed vacuously (the plan and the build both said so).
- Each stage takes minutes of model time; the build session took the longest.

## Not exercised
- `sdlc-discover` (the baseline map stayed empty; the architect noted it), the constitution step, `speckit-converge`, release/post-release, the "Let's work on the next feature" routing (that is covered by the routing eval instead, 3/3).
- Direction-mode UX, a real React app, screenshot-based UI review, interactive approval prompts, Linux/macOS, Node 18, Spec Kit command-style installs, a real Node-less machine.
