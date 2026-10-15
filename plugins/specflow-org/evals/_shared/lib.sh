# Shared scaffold helpers for specflow-org evals. Sourced by each case's fixture.sh.
# Builds a two-repo workspace (backend + frontend) with a ready .sdlc/ state, without needing the plugin.
set -euo pipefail
export GIT_AUTHOR_NAME=eval GIT_AUTHOR_EMAIL=eval@example.com GIT_COMMITTER_NAME=eval GIT_COMMITTER_EMAIL=eval@example.com

mk_repo() { mkdir -p "$1"; (cd "$1" && git init -q && git config commit.gpgsign false); }
commit_repo() { (cd "$1" && git add -A && git commit -q -m init); }

make_repos() {
  mk_repo backend
  cat > backend/package.json <<'JSON'
{ "name": "be", "scripts": { "test": "node -e \"process.exit(0)\"" }, "dependencies": { "express": "4" } }
JSON
  mkdir -p backend/src && echo "console.log('api')" > backend/src/index.js
  commit_repo backend

  mk_repo frontend
  cat > frontend/package.json <<'JSON'
{ "name": "fe", "scripts": { "test": "node -e \"process.exit(0)\"" }, "dependencies": { "react": "18" } }
JSON
  mkdir -p frontend/src/components && echo "export const App = () => null" > frontend/src/App.jsx
  if [ "${WITH_TAILWIND:-0}" = "1" ]; then
    echo "module.exports = { theme: { extend: { colors: { brand: '#0F4C5C', paper: '#FBFBF8' } } } }" > frontend/tailwind.config.js
    echo "export const Button = ({ children }) => <button className=\"bg-brand text-white rounded px-4 py-2\">{children}</button>" > frontend/src/components/Button.jsx
  fi
  commit_repo frontend
}

write_config() {
  mkdir -p .sdlc
  cat > .sdlc/config.json <<'JSON'
{
  "schema_version": 1,
  "framework_version": "0.3.0",
  "workspace": { "name": "eval-workspace", "root_is_repo": false },
  "autonomy": "standard",
  "branch_pattern": "{spec_slug}",
  "repos": [
    { "name": "backend", "path": "backend", "kind": "git", "purpose": "REST API", "stack": ["node", "express"],
      "commands": { "test": "node -e \"process.exit(0)\"", "build": null, "lint": null }, "commands_confirmed": true, "ui": false, "speckit": "root", "deploy_order": 1 },
    { "name": "frontend", "path": "frontend", "kind": "git", "purpose": "Web app", "stack": ["node", "react"],
      "commands": { "test": "node -e \"process.exit(0)\"", "build": null, "lint": null }, "commands_confirmed": true, "ui": true, "speckit": "root", "deploy_order": 2 }
  ],
  "speckit": { "version": null, "integration": null, "location": ".", "style": "none", "skills": [] },
  "ux": { "design_gate_for_ui": true, "require_ux_review": true },
  "guards": { "source_edit_outside_implementing": "ask", "deny_in_unattended_modes": true, "destructive_bash_patterns": [], "extra_bash_patterns": [] }
}
JSON
}

# write_backlog <stage> <spec_dir-or-null> <branches-json>
write_backlog() {
  local stage="$1" spec="$2" branches="${3:-}"
  [ -z "$branches" ] && branches="{}"
  local spec_json="null"; [ "$spec" != "null" ] && spec_json="\"$spec\""
  cat > .sdlc/backlog.json <<JSON
{
  "schema_version": 1,
  "next_id": 2,
  "features": [
    {
      "id": "F-001", "title": "Password reset", "summary": "A user who forgot their password can request a reset email and choose a new one.",
      "priority": "P1", "mvp": true, "value": "Fewer support tickets", "risk": "med", "ui": true,
      "stage": "$stage", "spec_dir": $spec_json, "repos": ["backend", "frontend"], "branches": $branches,
      "deps": [], "gates": { "spec": null, "design": null, "implement": null, "acceptance": null, "release": null },
      "blockers": [], "revisit": null, "history": [ { "at": "2026-01-01T00:00:00.000Z", "event": "stage", "detail": "created" } ]
    }
  ]
}
JSON
}

write_spec() {
  mkdir -p specs/001-password-reset
  cat > specs/001-password-reset/spec.md <<'MD'
# Password reset

## User story
As a user who forgot my password I can request a reset email and choose a new password.

## Requirements
- The reset link is valid for 60 minutes and can be used once.
- The request form always shows the same confirmation, whether or not the email exists.

## Acceptance criteria
- Request form accepts an email and always shows the same confirmation.
- Reset link opens a form with new password + confirm.
- Expired or used links show an error with a way to request a new one.
MD
}
