#!/usr/bin/env bash
. "$(dirname "$0")/../_shared/lib.sh"
make_repos
write_config
# One feature at "defined": the PM should dispatch the product role (specflow:product) for it.
write_backlog defined null
