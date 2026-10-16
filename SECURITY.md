# Security policy

## Reporting a vulnerability
Please report security issues privately by email to **mefeb169@gmail.com** (subject "specflow security"), or through GitHub's private vulnerability reporting on https://github.com/mefeb169/specflow if it is enabled. Do not open a public issue for an undisclosed vulnerability. You can expect an acknowledgement within a week.

## What the plugin does on your machine
- Runs `node` scripts from the plugin directory in three Claude Code hooks (SessionStart, PreToolUse, Stop). They only read the workspace's `.specflow/` state and the hook input, and write nothing except the explicit `specflow` CLI commands.
- The `specflow` CLI writes inside the workspace root only (`.specflow/`, `specs/`, a marked block in `CLAUDE.md`, `.gitignore`, `.specify/feature.json`) and creates local git branches in registered repos. It never pushes.
- `specflow verify run` executes the test/build/lint command you confirmed for a repo, in that repo, with a 30-minute timeout.
- It makes no network requests.

## What the guards do and do not guarantee
The hooks are guardrails, not a security boundary. They deny direct edits of `.specflow/backlog.json` and `config.json`, force a human prompt for gate approvals and destructive commands, and refuse those actions in modes that cannot prompt. They do **not**: stop a shell command that writes files in a way the patterns do not recognize, work when Node.js is missing (they fail open), or protect against a user who approves a prompt. Skills are advisory instructions to the model. See `docs/runtime.md` for what was verified.
