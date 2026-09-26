#!/bin/sh
# reindex-codebase-memory.sh: refresh the local codebase-memory graph at the
# start of every Claude Code session. Closes the two triggers a git-hook-only
# setup misses: a plain `git commit` and in-session file edits — both picked up
# here at the next session start.
#
# Best-effort and backgrounded. Re-indexes the LOCAL cache (incremental, no
# persistence, so it never touches your working tree or a shared snapshot).
# Incremental re-index is a ~0.07s no-op on an unchanged tree. No-ops silently
# if mise/the tool is absent, and exits immediately so it never blocks session
# start.

command -v mise >/dev/null 2>&1 || exit 0

repo="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0

# Background the re-index as a SIMPLE command so `&` applies to `mise` alone and
# its stdout is redirected to /dev/null. Do NOT write this as
# `[ -n "$repo" ] && mise ... >/dev/null 2>&1 &` — there `&` backgrounds the whole
# AND-list in a subshell whose fd 1 is NOT redirected (only mise's is). A hook
# runner that captures our stdout and reads to EOF (Claude Code's SessionStart
# does) then blocks for the entire re-index, because that subshell holds the pipe
# open until mise exits. This form returns immediately.
if [ -n "$repo" ]; then
  mise exec -- codebase-memory-mcp cli index_repository \
    "{\"repo_path\":\"$repo\",\"mode\":\"full\"}" >/dev/null 2>&1 &
fi

exit 0
