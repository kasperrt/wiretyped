#!/usr/bin/env bash
set -eu

# Collect export entrypoints from jsr.json (newline separated).
entrypoints="$(jq -r '.exports | .. | strings' jsr.json | sort -u)"

if [ -z "$entrypoints" ]; then
  echo "No entrypoints found in jsr.json"
  exit 1
fi

entrypoints_display="$(printf '%s\n' "$entrypoints" | tr '\n' ' ')"
echo "Checking doc coverage for: ${entrypoints_display}"

# deno doc outputs an object for a single entrypoint and an array for multiple.
doc_json="$(deno doc --json $entrypoints)"

coverage_json="$(printf '%s' "$doc_json" \
  | jq '[
        (if type=="array" then map(.nodes // []) | add else (.nodes // []) end)
        | .[]
        | select(.declarationKind=="export")
      ]
      | {total:length, documented:(map(select(.jsDoc!=null))|length)}')"

documented="$(printf '%s' "$coverage_json" | jq -r '.documented')"
total="$(printf '%s' "$coverage_json" | jq -r '.total')"

if [ "$documented" != "$total" ]; then
  echo "Doc coverage incomplete: documented $documented / $total exports"
  exit 1
fi

echo "Doc coverage ok: $documented / $total exports documented"
