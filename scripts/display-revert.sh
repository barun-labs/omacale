#!/bin/sh
# display-revert.sh <state-file>: roll back a pending change now (see display-apply.sh).
f=$1
[ -f "$f" ] && hyprctl eval "$(cat "$f")" >/dev/null
rm -f "$f" "$f.token"
