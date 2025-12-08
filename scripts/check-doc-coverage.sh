#!/usr/bin/env bash
set -euo pipefail

# Collect export entrypoints from jsr.json (newline separated).
# Supports .exports as string, object map, or array.
entrypoints="$(
  jq -r '
    .exports
    | if type == "string" then [.]
      elif type == "object" then [ .[] ]
      elif type == "array" then .
      else [] end
    | map(select(type=="string"))
    | unique
    | .[]
  ' jsr.json
)"

if [ -z "${entrypoints:-}" ]; then
  echo "No entrypoints found in jsr.json"
  exit 1
fi

eps=()
while IFS= read -r ep; do
  eps+=("$ep")
done <<<"$entrypoints"

entrypoints_display="$(printf '%s ' "${eps[@]}")"
echo "Checking doc coverage for: ${entrypoints_display}"

# Resolve docs with deno; enable sloppy imports so extensionless Node-style paths
# (e.g. "./core") work on Deno 1.x in CI.
deno_doc_args=(--json)
if deno doc --help 2>/dev/null | grep -q -- '--unstable-sloppy-imports'; then
  deno_doc_args=(--unstable-sloppy-imports --json)
fi

# deno doc outputs either:
# - an array of DocNodes
# - or an array of module objects containing .nodes
# depending on version/args.
doc_json="$(deno doc "${deno_doc_args[@]}" "${eps[@]}")"

coverage_json="$(
  printf '%s' "$doc_json" | jq '
    # Normalize deno doc JSON into a flat array of DocNodes.
    def allnodes:
      if type == "array" then
        # If the array elements have .nodes, unwrap them.
        if (length > 0 and (.[0] | type=="object") and (.[0] | has("nodes"))) then
          (map(.nodes? // []) | add) // []
        else
          .
        end
      elif type == "object" then
        if has("nodes") then (.nodes? // []) else [.] end
      else
        []
      end;

    # Public surface:
    # named nodes excluding imports and module docs/wrappers.
    [ allnodes[]
      | select(.name? != null)
      | select((.kind? // "") != "import")
      | select((.kind? // "") != "moduleDoc")
      | select((.kind? // "") != "module")
    ] as $pub
    | {
        total: ($pub | length),
        # "Documented" as presence of jsDoc (matches your remembered CLI check).
        documented: ($pub | map(select(.jsDoc? != null)) | length),
        # Sum node references if present in this Deno version.
        references: (
          (($pub | map(.references? // []) | add) // [])
          | length
        )
      }
  '
)"

total="$(printf '%s' "$coverage_json" | jq -r '.total')"
documented="$(printf '%s' "$coverage_json" | jq -r '.documented')"
references="$(printf '%s' "$coverage_json" | jq -r '.references')"

echo "Found: documented $documented / $total exports, references $references"

if [ "$total" -eq 0 ]; then
  echo "ERROR: 0 public exports found by deno doc for entrypoints: ${entrypoints_display}"
  exit 1
fi

if [ "$references" -ne 0 ]; then
  echo "ERROR: Found $references references in doc output (expected 0)"
  exit 1
fi

if [ "$documented" -ne "$total" ]; then
  echo "ERROR: Doc coverage incomplete: documented $documented / $total exports"
  exit 1
fi

echo "Doc coverage ok: $documented / $total exports documented, references $references"
