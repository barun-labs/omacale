#!/bin/sh
# display-apply.sh <state-file> <seconds> <token> <lua> [restore-lua]
#
# Applies a display change and rolls it back unless it is kept in time, so a
# mode the screen can't show ("out of range", black) undoes itself. Launched
# detached from the shell, so a shell or plugin reload can't cancel the undo.
#
# <state-file> holds the Lua that restores the last confirmed layout; the
# first change in a chain writes it (restore-lua), later changes keep it.
# <state-file>.token names the newest change; only its timer may roll back.
# Keep = delete both files. Revert now = run display-revert.sh.
f=$1 seconds=$2 token=$3 lua=$4 restore=$5

[ -n "$restore" ] && printf '%s' "$restore" > "$f"
printf '%s' "$token" > "$f.token"

if [ "$(hyprctl eval "$lua" 2>&1)" != "ok" ]; then
  # Hyprland rejected it: undo right away rather than wait.
  [ -f "$f" ] && hyprctl eval "$(cat "$f")" >/dev/null
  rm -f "$f" "$f.token"
  exit 1
fi

sleep "$seconds"
if [ "$(cat "$f.token" 2>/dev/null)" = "$token" ]; then
  [ -f "$f" ] && hyprctl eval "$(cat "$f")" >/dev/null
  rm -f "$f" "$f.token"
fi
