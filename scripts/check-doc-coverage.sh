#!/usr/bin
set -e

entrypoints=()
while IFS= read -r line; do
  entrypoints+=("$line")
done < <(jq -r '.exports | .. | strings' jsr.json | sort -u)

if [ ${#entrypoints[@]} -eq 0 ]; then
  echo "No entrypoints found in jsr.json"
  exit 1
fi

echo "Checking doc coverage for: ${entrypoints[*]}"

deno doc --json "${entrypoints[@]}" \
  | jq -e '[.nodes[] | select(.declarationKind=="export")] | {total:length, documented:(map(select(.jsDoc!=null))|length)} | select(.total == .documented)' \
  > /dev/null
