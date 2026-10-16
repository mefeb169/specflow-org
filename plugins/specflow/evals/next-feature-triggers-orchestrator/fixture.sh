#!/usr/bin/env bash
. "$(dirname "$0")/../_shared/lib.sh"
make_repos
write_config
write_backlog proposed null
