# Task 2 Plan: UI/UX skills

Source request: [task-2.md](task-2.md). It asks for UI/UX skills that use Anthropic's `frontend-design` skill (the text pasted in task-2.md).
Builds on: Phase 1 ([task-1-plan.md](task-1-plan.md), commit `d51572f`). This plan delivers the `sdlc-ux` part of Phase 2 from task-1-plan Part C. The Spec Kit extension/preset and `sdlc-release` stay out of scope.
Audience: the implementing agent (Sonnet). Part A records the decisions, which are fixed. Part B is the build spec. If a decision turns out to be impossible, stop and report.

---

# Part A: Design (decided)

## A1. The problem this solves

`frontend-design` is a strong aesthetic-direction skill, but it is written for a one-off brief: "be distinctive, take aesthetic risk, confirm with the client". The framework, on the other hand, works on **existing products with established conventions** (task-1 principles: context before action, respect existing instructions). Dropping `frontend-design` in unchanged would push every UI feature toward a new visual identity, including features in an app that already has a design system.

So the work is to **vendor `frontend-design` unchanged** and wrap it in a role skill, `sdlc-ux`. The role skill decides *when* the aesthetic-direction guidance applies and *what the brief is*, and it turns the UX work into persistent, checkable artifacts inside the feature lifecycle.

## A2. Components

| Component | Kind | Purpose |
|---|---|---|
| `skills/frontend-design/` | Vendored skill: `SKILL.md` **verbatim** from task-2.md, plus `LICENSE.txt` and `UPSTREAM.md` | Aesthetic direction, typography, layout, motion, UI writing. Never edited locally, so it can be refreshed from upstream. |
| `skills/sdlc-ux/` | New role skill (UX/UI Designer), using the A5 role contract from task-1 | Owns the design system and each feature's `ux.md`; decides the mode (A3); invokes `frontend-design` |
| `.sdlc/design-system.md` | Workspace artifact (template) | Product-level design authority: either a pointer to the design system that already exists in code, or the approved new direction (tokens, type, layout, principles), plus an exploration log |
| `specs/NNN/ux.md` | Per-feature artifact | Flows, screens and states, copy, accessibility, wireframes, token usage |
| CLI changes | `sdlc.mjs` + libs | A `ui` trait on repos and features, the `ux.md` entry check, a UI-aware design gate, `ux-review` evidence, routing to `sdlc-ux` |
| Changes to existing skills/agents | discover, architect, build, verify, orchestrator, repo-profiler, independent-reviewer | Discover the design system, consume `ux.md`, apply the UI quality floor, review UI |

There is **no new lifecycle stage** and **no new subagent**. UX work happens inside `specified → designed`. UI review is a conditional section of the existing `independent-reviewer`.

## A3. Two modes (the key decision)

`sdlc-ux` always chooses a mode first, records it in `ux.md` (`Mode: conform | direction`), and tells the user which one it chose.

| Mode | When | What `frontend-design` contributes |
|---|---|---|
| **conform** (default for existing products) | A design system exists in code: tokens or a theme, a Tailwind config, a component library, Storybook, or a consistent established UI. Or `.sdlc/design-system.md` already holds an approved direction. | Only the **writing**, **restraint/quality floor** and **structure-is-information** guidance. No new palette, typefaces or visual identity. New components extend the existing system. |
| **direction** | A new product or a new UI surface with no design system, **or** the user explicitly asks for a redesign or a new visual direction | The full two-pass process: token plan (4–6 hex colors, typefaces and their roles, ASCII layout options, principles) → review the plan against the brief and the "generic tells" list → revise → only then build. The result becomes `.sdlc/design-system.md`. |

Design authority precedence (it extends the task-1 instruction precedence and goes in `_shared/evidence-tags.md`):
1. The user's explicit design direction in this session.
2. The existing design system in code and the repo's own UI instructions.
3. `.sdlc/design-system.md`.
4. `frontend-design` defaults.

What `frontend-design` calls "the brief" is, in this framework, `spec.md` + `.sdlc/product.md` + `.sdlc/design-system.md`. `frontend-design` says "the brief's own words always win", and that is consistent with this order.

"Confirm with the client" maps to human approval. In direction mode, the token plan and layout concept are shown to the user before any build. The binding approval is the feature's **design gate**, which becomes required for UI features (A4).

## A4. Lifecycle and CLI changes

- **`ui` trait:**
  - **Repo:** `config.repos[].ui` (boolean). `scan` sets it when the stack contains a UI framework (react, next, vue, nuxt, @angular/core, svelte, react-native, expo, dart/flutter, swift) or design-system evidence is found (B3). It can be edited with `repo set <name> --ui true|false`.
  - **Feature:** `features[].ui` (boolean). `feature add` derives it as "any affected repo has `ui: true`", and `--ui true|false` overrides that. `feature set <id> ui true|false` works too, and a history entry records it. Old backlogs that lack the field are treated as derived; there is no schema bump.
- **Entry into `designed`** (added to the existing criteria): when `ui` is true, `spec_dir/ux.md` must exist, have a `Mode:` line (`conform` or `direction`), and contain the headings `## Flows`, `## Screens and states`, `## Copy` and `## Accessibility`. If any are missing, the CLI names the missing items.
- **Gates:** in `standard` autonomy, the `design` gate is also required when `ui && config.ux.design_gate_for_ui` (default `true`). `guided` already requires every gate. `autonomous` is unchanged.
- **Entry into `accepted`:** when `ui && config.ux.require_ux_review` (default `true`), a passing `ux-review` evidence entry is required.
- **Evidence kind:** add `ux-review`.
- **Routing:** at stage `specified`, `nextAction` returns `sdlc-ux` when `ui` is true and `ux.md` doesn't exist or fails the heading check. Otherwise it returns `sdlc-architect` as before. This applies UX before architecture (the task-1 lifecycle order), while the architect still reads `ux.md`.
- **Config:** add `"ux": { "design_gate_for_ui": true, "require_ux_review": true }`. When it is missing from an existing config, the code uses these defaults (an old config has no `ux` key).

## A5. Source-of-truth additions

| Information | Lives in (only here) | Written by |
|---|---|---|
| Existing design system (tokens, components) | the repo's code (theme/tokens/Tailwind/component library) | (untouched) |
| Product design authority: a pointer to the above **or** the approved new direction, plus the exploration log | `.sdlc/design-system.md` | sdlc-ux |
| A feature's flows, screens, states, copy, a11y, wireframes | `specs/NNN/ux.md` | sdlc-ux |
| Optional throwaway prototype | `specs/NNN/ux/prototype.html` (only if the user asks or direction mode benefits from it) | sdlc-ux |
| UI review results | `verification.md` (`ux-review` kind) | sdlc-verify |

`design-system.md` never copies token values that already live in code. It cites the file (`[code] web/tailwind.config.ts`) and summarizes it.

## A6. Visual verification

`frontend-design` asks for screenshot self-critique. The framework **does not install** browsers or tooling.
- If a repo already has Playwright, Cypress or Storybook (from the scan), `sdlc-ux`/`sdlc-verify` may use them to render and screenshot. Running these commands follows the normal guard rules.
- Otherwise, the UI review is code-based plus a **manual** check by the user, recorded as `evidence add --kind ux-review --note "manual: ..."`. The report states that no screenshot was taken.

## A7. Risks

- **Aesthetic drift in existing products:** mitigated by conform as the default, the precedence order, and the design gate.
- **Gate fatigue for small UI tweaks:** `config.ux.design_gate_for_ui` can be set to false, and `feature set ui false` (logged) applies per feature.
- **Upstream skill changes:** the vendored copy is pinned. `UPSTREAM.md` records its source and date, and refreshing means a deliberate replacement.
- **License:** the pasted frontmatter says "Complete terms in LICENSE.txt". The real license text must be shipped (B1). Never write license text from memory.
- **Duplicate skill:** a user who also installs Anthropic's own `frontend-design` will see two copies. Namespacing (`sdlc:frontend-design`) keeps them apart. Mention this in the README.

---

# Part B: Build spec

## B0. Before writing code
1. `git status` should be clean apart from `tasks/`. Commit at the end of each B-step (conventional message plus the attribution line).
2. Run `npm test` and confirm the 13 tests pass before changing anything.
3. Edit files with the Edit/Write tools, not with shell heredocs or `node -e` replacements. Phase 1 lost regex backslashes that way.

## B1. Vendor `frontend-design`
- Create `skills/frontend-design/SKILL.md` containing the **exact** text between the fences in task-2.md, lines 7–77: frontmatter plus body, byte-for-byte apart from line endings. Afterwards, check it with a diff against the extracted block.
- `LICENSE.txt`: fetch the upstream license with WebFetch from `https://github.com/anthropics/skills/blob/main/skills/frontend-design/LICENSE.txt` (or the raw URL), and put its text in the file verbatim. **If it can't be fetched, or the frontend-design skill isn't found there, stop and ask the user. Do not write a license from memory or ship without one.**
- `UPSTREAM.md`: the source (Anthropic, anthropics/skills, `skills/frontend-design`), the fact that the SKILL.md text was supplied by the user in task-2.md, the vendoring date, a "do not edit locally; customize through sdlc-ux" note, and the refresh steps.

## B2. CLI changes (`scripts/`)
- `lib/lifecycle.mjs`: add `'ux-review'` to `EVIDENCE_KINDS`; add `UI_STACK = ['react','next','vue','nuxt','@angular/core','svelte','react-native','expo','dart/flutter','swift']`; add `UX_DEFAULTS = { design_gate_for_ui: true, require_ux_review: true }`; add `UX_SECTIONS = ['## Flows','## Screens and states','## Copy','## Accessibility']`. `STAGE_ROLE.specified` keeps the architect as its default. The UI routing goes in `render.nextAction`.
- `lib/state.mjs`: add a helper `isUi(ctx, f)` that returns `f.ui` when it is a boolean, and otherwise derives it from the repos' `ui` flags. Add `uxConfig(ctx)` = `{...UX_DEFAULTS, ...ctx.config.ux}`.
- `lib/scan.mjs`: per repo, add a `ui` block with `{ is_ui, design_system: [paths], visual_test_tools: [names] }`.
  - **Design-system evidence:** `tailwind.config.*`, `components.json` (shadcn), `theme.*`/`tokens.*`/`*.tokens.json`, `.storybook/`, `src/**/theme/**`, CSS/SCSS files named `variables`/`tokens`/`theme`, and dependencies `@mui/material`, `@chakra-ui/react`, `antd`, `bootstrap`, `@radix-ui/*`, `styled-components`, `@emotion/react`, `vuetify`, `@angular/material`.
  - **Visual tools:** `playwright`, `@playwright/test`, `cypress`, `storybook`/`@storybook/*` (from dependencies or config files).
  - `is_ui` = the stack intersects `UI_STACK`, or design-system evidence exists.
  - `applyScan` sets `ui` on newly added repos. For existing repos, set it only if the field is missing (don't overwrite a user choice).
- `sdlc.mjs`:
  - `repo set`: add `--ui true|false`.
  - `feature add`: add `--ui true|false` (otherwise derive it and store the derived value).
  - `feature set`: accept `ui true|false`.
  - `doctor`: report UI repos and whether `.sdlc/design-system.md` exists when there are any UI repos (a warning, not an error).
  - `init`: copy `design-system.md` only when at least one repo is UI. The template lives in `templates/workspace/` but is skipped otherwise. It must never overwrite an existing file (same rule as the other templates).
- `lib/gates.mjs`:
  - `requiredGates`: in standard mode, design is required when `t.multiRepo || t.migration || (isUi && uxConfig.design_gate_for_ui)`. `traits()` also returns `ui`.
  - `checkEntry('designed')`: when UI, check that `ux.md` exists, has a `/^Mode:\s*(conform|direction)\b/im` line and contains each `UX_SECTIONS` heading (matched at the start of a line). Each missing item is its own failure message.
  - `checkEntry('accepted')`: when UI and `require_ux_review`, require `ev.some(e => e.kind==='ux-review' && e.result==='pass')`.
- `lib/render.mjs`:
  - `nextAction`: at stage `specified`, for UI features whose `ux.md` is missing or incomplete, return `write ux.md (flows, states, copy, a11y) [sdlc-ux]`. Reuse the gates.mjs check through an exported `uxCheck(ctx, f)` that returns its list of failures.
  - `featureDetail` adds `ui` and `ux: {exists, failures}`.
- `lib/validate.mjs`: `ui`, when present, must be a boolean on repos and on features. `config.ux` keys, when present, must be booleans.

## B3. Templates
- `templates/workspace/design-system.md` with these sections:
  - **Status** (`source: existing-code | approved-direction | none-yet`, `approved: <date or pending>`)
  - **Sources of truth in code** (paths with evidence tags)
  - **Color**, **Type**, **Layout and alignment**, **Components**, **Principles** (for existing code: summaries plus file references, not copied values)
  - **Accessibility floor** (contrast, focus, reduced motion, responsive down to mobile)
  - **Voice and UI writing** (link to `frontend-design` § writing, plus product-specific vocabulary)
  - **Exploration log** (directions tried or rejected and why: the "jot down notes" advice from frontend-design)
- `templates/workspace/ux.md` (sdlc-ux copies it into `specs/NNN/ux.md`):
  - a `Mode:` line
  - `## Context` (users, primary job, links to spec acceptance criteria)
  - `## Flows`
  - `## Screens and states` (per screen: default/empty/loading/error/success, plus ASCII wireframe)
  - `## Copy` (every label, CTA, error and empty-state string; consistent action names)
  - `## Accessibility` (keyboard paths, focus order, contrast, reduced motion, screen-reader names)
  - `## Design tokens used / new` (conform: existing tokens; direction: the token plan and its review against generic defaults)
  - `## Open questions`

## B4. New skill `skills/sdlc-ux/SKILL.md`
Frontmatter `name: sdlc-ux`. The description triggers on "UX", "UI design", "wireframe", "user flow", "design system", "screens", "redesign", "visual direction" and "copy for the UI". Use the A5 role-contract headings exactly (Purpose · Use when · Inputs · Outputs · Stages · May do autonomously · Requires approval · Must not · Handoff · Done when · Escalate when), and keep it under about 200 lines.

Required content:
- **Inputs:** `sdlc status <id>`, `spec.md`, `.sdlc/product.md`, `.sdlc/design-system.md`, the UI section of `.sdlc/workspace-map.md`, the affected UI repos' instruction files and design-system files (from the scan), and screens that already exist near the feature.
- **Procedure:**
  1. **Pick the mode** (A3) and say why, citing evidence.
  2. **Direction mode only:** if no `design-system.md` exists, or it is `none-yet`, establish the direction first. Invoke `sdlc:frontend-design` (Skill tool), follow its two-pass plan → review → revise process, present the token plan and ASCII layout options to the user, and write `.sdlc/design-system.md` with `approved: pending` until the user agrees. Then add the rejected alternatives to the Exploration log.
  3. **Conform mode:** read the design-system sources in code. Apply only `frontend-design`'s writing, restraint/quality-floor and structure-as-information guidance. Do not introduce new colors, typefaces or radii. A new component must say which existing primitives it builds on.
  4. Copy the `ux.md` template into the spec dir and fill every section. Every screen lists all of its states. Copy follows the `frontend-design` writing rules (active voice, actions named consistently through the flow, errors that say what happened and how to fix it, empty states that invite action).
  5. Optional prototype (`specs/NNN/ux/prototype.html`), only when the user asks for one or direction mode needs a visual check. If the repo has Playwright, Storybook or similar, screenshot it and critique it. Never install tooling.
  6. If UX work reveals a requirement gap, record `blocker add --kind requirement` and hand back. Never edit `spec.md`.
  7. Hand off to `sdlc-architect` (which must read `ux.md`). The design gate covers both `ux.md` and `plan.md`.
- **Requires approval:** establishing or changing the design direction, any change to `design-system.md` status, deviating from an existing design system, and the design gate.
- **Must not:** restyle an existing product in conform mode; edit `spec.md` or the acceptance criteria; write production code (that belongs to `sdlc-build`); install packages; edit `skills/frontend-design/*`.

## B5. Updates to existing skills, agents and docs
- `skills/_shared/lifecycle.md`: the `designed` row gets "(+ `ux.md` complete when ui)". The `accepted` row gets "(+ passing `ux-review` when ui)". Routing: `specified` → `sdlc-ux` for UI features without a complete `ux.md`, then `sdlc-architect`. Add the gate note for UI.
- `skills/_shared/evidence-tags.md`: add the design-authority precedence (A3).
- `skills/sdlc/SKILL.md`: add `sdlc:sdlc-ux` to the routing list. A new-project flow with a UI goes product → ux (direction) → architect. At the design gate, the summary includes `ux.md` and the mode.
- `skills/sdlc-discover/SKILL.md`: add a "UI and design system" subsection to the workspace-map procedure. Set `repo set --ui` where the scan guessed wrong. If UI repos exist but `design-system.md` doesn't, write it in `existing-code` mode (pointers only) as part of the baseline.
- `skills/sdlc-architect/SKILL.md`: inputs include `ux.md`. UI tasks reference `ux.md` screens and states. Tasks exist for empty, loading and error states, and for the a11y items.
- `skills/sdlc-build/SKILL.md`: for UI repos, follow the conform rules from `design-system.md` and `ux.md`, use the exact copy strings from `ux.md`, and meet the quality floor (responsive to mobile, visible keyboard focus, `prefers-reduced-motion` respected, contrast). Load `sdlc:frontend-design` only for direction-mode features. Watch CSS specificity, as frontend-design says.
- `skills/sdlc-verify/SKILL.md`: for UI features, run the UI review (through `independent-reviewer` with the UI section enabled) and record `evidence add --kind ux-review --repo <ui repo> --result pass|fail`. Screenshot only with tooling that already exists; otherwise ask the user for a manual check and record it as `manual: ...` in the note.
- `agents/repo-profiler.md`: add a `### UI and design system` section to the output template (framework, component library, token/theme files, Storybook, visual test tools, consistency of the existing UI, all with evidence tags).
- `agents/independent-reviewer.md`: add a conditional "UI review (when the caller marks the feature as UI)" section. It checks:
  - every `ux.md` screen state is implemented;
  - copy strings match `ux.md`;
  - keyboard and focus, contrast, reduced motion and responsiveness;
  - conform mode: no stray new colors, fonts or radii outside the design system;
  - direction mode: implementation matches the approved tokens;
  - generic-default tells from frontend-design's calibration list, *only* where the brief left that axis free.

  Output a separate `### UI findings` list.
- `README.md`: add the UX role, the modes, the `ui` trait, the config keys, the vendored skill and license note, and the duplicate-skill note.

## B6. Tests (extend `tests/`; keep all existing tests passing, updating fixtures where UI now applies)
The fixture's `frontend` (react) becomes a UI repo and `backend` doesn't. Existing tests 4 and 11 use `frontend`, so update their fixtures: `writeSpec` writes a complete `ux.md`, test 4 adds `ux-review` evidence before `accepted`, and test 11's expectation for a single-repo frontend feature now includes `design`.

New cases:
1. `scan` marks `frontend` as `ui: true` and `backend` as `ui: false`. A `tailwind.config.js` in the fixture appears in `ui.design_system`.
2. `feature add --repos frontend` gives `ui: true`; `--repos backend` gives `ui: false`; `--ui false` overrides the derived value. `feature set ui` is logged in history.
3. `designed` is refused for a UI feature with no `ux.md`, then with `ux.md` lacking a `Mode:` line, then lacking `## Accessibility`. It succeeds once complete (with the spec gate approved).
4. A backend-only feature reaches `designed` without `ux.md`, and its required gates are unchanged.
5. Standard autonomy: the design gate is required for a UI single-repo feature, and isn't once `config.ux.design_gate_for_ui=false` (written through a temporary config edit inside the test).
6. `accepted` is refused for a UI feature without `ux-review`, then accepted after it is added.
7. `next`/`status` show the `sdlc-ux` action for a UI feature at `specified` with no `ux.md`.
8. `validate` flags a non-boolean `ui`.
9. A backlog with no `ui` field (the old format) still works (`isUi` derives it).
10. `init` creates `.sdlc/design-system.md` only when a UI repo exists, and never overwrites it.

`npm test` must pass, and `claude plugin validate .` must pass.

## B7. Manual acceptance (run it and report honestly)
1. `claude --plugin-dir D:/Work/skill-framework -p` in a fresh fixture: confirm that `sdlc:sdlc-ux` and `sdlc:frontend-design` are listed alongside the existing skills.
2. In the fixture (with `init` done), ask "write the UX for F-00x" for a UI feature that has a spec. Check that `sdlc-ux` picks a mode with evidence and produces a `ux.md` that passes `stage set designed` once the spec gate is approved (approve it through the CLI directly in the test workspace).
3. Report what ran and what didn't, plus any deviations. Do not claim screenshot verification unless one was taken.

## B8. Out of scope
New lifecycle stages; a separate UI-review agent; installing browsers or visual-testing tools; Figma or Canva integration (connectors need user authorization); Spec Kit template changes; editing the vendored `frontend-design` text.
