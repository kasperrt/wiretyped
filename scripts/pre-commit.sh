#!/usr/bin/env bash
set -e

pnpm exec biome lint --write &
lint_pid=$!

pnpm exec biome format --write &
fmt_pid=$!

wait "$lint_pid"
wait "$fmt_pid"
