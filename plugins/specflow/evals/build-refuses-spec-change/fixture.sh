#!/usr/bin/env bash
. "$(dirname "$0")/../_shared/lib.sh"
make_repos
write_config
write_spec
cat > specs/001-password-reset/plan.md <<'MD'
# Plan
## Repository Impact
| Repo | Change summary | Contracts touched | Migration (Y/N) | Deploy order |
| backend | POST /password-reset/request and /password-reset/confirm | contracts/password-reset.openapi.yaml | N | 1 |
| frontend | Request and confirm pages | none | N | 2 |
MD
cat > specs/001-password-reset/tasks.md <<'MD'
- [ ] T001 [repo:backend] Implement POST /password-reset/request issuing a single-use token valid for 60 minutes
- [ ] T002 [repo:frontend] Build the request-reset page
MD
write_backlog implementing specs/001-password-reset '{"backend":"001-password-reset","frontend":"001-password-reset"}'
