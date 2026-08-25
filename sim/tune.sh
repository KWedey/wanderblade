#!/bin/bash
# Set economy constants and re-run the pacing bands.
#
#   sim/tune.sh killsPerZone=1200 BOSS_REALM_GAIN=1.22 -- --seeds 3 --days 30
#
# Any numeric `export const <name> = <number>;` in packages/core/src/constants.ts
# can be assigned. Unnamed constants keep their current value, so a run with no
# assignments only measures. Everything after `--` is passed to `npm run sim`.
set -euo pipefail
cd "$(dirname "$0")/.."

assignments=()
while [ $# -gt 0 ]; do
  if [ "$1" = "--" ]; then shift; break; fi
  assignments+=("$1"); shift
done

if [ ${#assignments[@]} -gt 0 ]; then
  python3 - "${assignments[@]}" <<'PY'
import re, sys, pathlib
path = pathlib.Path('packages/core/src/constants.ts')
src = path.read_text()
for arg in sys.argv[1:]:
    name, _, value = arg.partition('=')
    if not value:
        sys.exit(f'tune: expected name=value, got {arg!r}')
    float(value)
    pattern = rf'(export const {re.escape(name)} = )[\d._eE+-]+;'
    if not re.search(pattern, src):
        sys.exit(f'tune: no numeric constant named {name!r}')
    src = re.sub(pattern, rf'\g<1>{value};', src)
path.write_text(src)
PY
fi

grep -E '^export const [A-Za-z_]+ = [0-9]' packages/core/src/constants.ts | sed 's/^export const /  /;s/;$//'
npm run sim --silent -- "$@"
