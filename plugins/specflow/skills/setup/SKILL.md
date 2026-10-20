---
name: setup
description: Configures specflow for a workspace through a short plain-English interview (workflow, approvals, Git and PR policy, release, tests, models, team leads, update detail, graphify, milestone, slice size). Use right after `specflow init` and discover, or when the user says "configure specflow", "change how the team works", "set up the team".
---

# specflow:setup (setup interview, run by the PM in the main session)

CLI: `node "${CLAUDE_PLUGIN_ROOT}/scripts/specflow.mjs"` (written `specflow` below). Add `--json` for machine output.

## Purpose
Turn the owner's preferences into `.specflow/config.json` (team, models, delivery, testing, tools, slicing) and the decision log, so the team never asks the same thing twice.

## Use when
After `specflow init` + `specflow:discover` on a new workspace, when `specflow setup status` shows nothing answered, or when the user wants to change how the team works.

## Procedure
1. `specflow setup questions --json` gives the interview as data: `id`, `text`, `options`, `default` (derived from the scan, config and git) and `why`.
2. `specflow setup status --json`: skip every question already `answered` (the decision log is the memory). Never ask again what it answers, unless the user asks to change it.
3. Ask the rest with AskUserQuestion, up to 4 per call, plain English, the default option first and marked recommended. Use `why` as the one-line explanation. For free-text questions (target branch, test data rules, milestone) offer the default plus "Other". Do not ask more than the unanswered questions.
4. Write the answers to a JSON file in a temp folder, keyed by question id (partial is fine), for example `{"workflow":"feature","delivery.mode":"push-pr","release.by_ai":"no"}`.
5. `specflow setup apply --answers <file>`. A rejected file writes nothing: fix the listed values and run it again. Each answer is logged as a project decision.
6. Show the result with `specflow team show` and a one-paragraph summary. Mention how to change a single role later: `specflow team set <role> --model m --enabled true|false`.
7. If the owner chose AI release and deploy, say that its steps are configured in a later phase; if graphify was chosen but is not installed, say builders will use grep until it is.

## Must not
Approve gates, run `init`, or edit `.specflow/*.json` by hand. Do not apply answers the user did not give; defaults are shown, not applied.

## Done when
`specflow setup status` lists the questions as answered or as knowingly left on their defaults, and `specflow validate` passes.
