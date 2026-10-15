# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versions follow the plugin version in `plugins/specflow-org/.claude-plugin/plugin.json`.

## [0.3.0] - 2026-10-15
First public release candidate.
### Added
- Packaged as plugin `specflow-org` in marketplace `specflow-org-marketplace` (plugin files under `plugins/specflow-org/`), MIT licensed, with `NOTICE` for the bundled Apache-2.0 `frontend-design` skill.
- `sdlc upgrade` (dry run by default, `--apply` is additive and never overwrites user files) and workspace/plugin version tracking.
- Spec Kit install-style (`skills`/`commands`) and version-range detection in `sdlc doctor`.
- Gate approvals, `init`, `branches create`, `upgrade --apply`, `specify init` and destructive commands are denied (not asked) in `bypassPermissions`/`dontAsk` modes.
- Plugin evals (5 cases) and a GitHub Actions workflow (3 OS x Node 18/22).
### Changed
- Hooks use exec form (`node` + args). The CLI is split into command modules. Tests run in about 40 s (`SDLC_SKIP_TOOL_PROBE`).
### Fixed
- Guard no longer treats prose inside `cat <<EOF` heredocs (for example a spec mentioning `sdlc branches create`) as a command.

## [0.2.0]
### Added
- UI/UX support: `sdlc-ux` role, `ui` trait, `ux.md` checks, `ux-review` evidence, design-system template, vendored `frontend-design` skill.
### Fixed
- The scan's design-system evidence now reaches `sdlc-ux` through `sdlc status`.

## [0.1.0]
### Added
- Phase 1: `sdlc` CLI (state, lifecycle, gates, evidence, scan, branches), hooks (session brief, guards, validation), role skills (orchestrator, discover, product, architect, build, verify) and two subagents.
