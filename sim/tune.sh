#!/bin/bash
# Try economy constants and re-run the pacing bands, leaving the tree as found.
#
#   sim/tune.sh killsPerZone=1200 BOSS_REALM_GAIN=1.22 -- --seeds 3 --days 30
#
# Any numeric `export const <name> = <number>;` in packages/core/src/constants.ts
# can be assigned. Unnamed constants keep their current value, so a run with no
# assignments only measures. Everything after `--` is passed to `npm run sim`.
# The edit is temporary: the file is restored from a backup when the script
# exits, however it exits. A constants.ts with uncommitted changes is refused,
# because restoring it would also discard work the script did not make.
set -euo pipefail
cd "$(dirname "$0")/.."

constants=packages/core/src/constants.ts
backup=sim/out/constants.ts.tune-backup

assignments=()
while [ $# -gt 0 ]; do
  if [ "$1" = "--" ]; then shift; break; fi
  assignments+=("$1"); shift
done

if [ ${#assignments[@]} -gt 0 ]; then
  if ! git diff --quiet -- "$constants"; then
    echo "tune: $constants has uncommitted changes; commit or stash them first" >&2
    exit 1
  fi
  mkdir -p sim/out
  cp "$constants" "$backup"
  trap 'cp "$backup" "$constants"; rm -f "$backup"; echo "tune: restored $constants"' EXIT

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
  echo "tune: trying these changes (restored on exit)"
  diff "$backup" "$constants" | grep '^[<>]' || true
fi

grep -E '^export const [A-Za-z_]+ = [0-9]' "$constants" | sed 's/^export const /  /;s/;$//'
npm run sim --silent -- "$@"
