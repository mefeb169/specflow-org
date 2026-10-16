#!/usr/bin/env bash
. "$(dirname "$0")/../_shared/lib.sh"
export WITH_TAILWIND=1
make_repos
write_config
write_spec
write_backlog specified specs/001-password-reset
