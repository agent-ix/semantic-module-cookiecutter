#!/usr/bin/env bash
# Render the template for every module_kind and check each rendered repository:
# the emit pipeline produces schemas, check mode is green, and the spec
# validates. Also checks the pre-generation hook refuses bad input.
#
#   tests/render.sh            render + emit + validate
#   SKIP_NPM=1 tests/render.sh render and hook checks only (no registry access)
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
out="${RENDER_DIR:-$here/.render}"
rm -rf "$out"
mkdir -p "$out"

# npm deps come from npmjs only.
export npm_config_userconfig=/dev/null
export npm_config_registry=https://registry.npmjs.org

render() { # kind extra-args...
  local kind="$1"; shift
  cookiecutter --no-input -o "$out/$kind" "$here" module_kind="$kind" "$@" >/dev/null
}

check_kind() { # kind "extra cookiecutter args" expected-schemas...
  local kind="$1" extra="$2"; shift 2
  # shellcheck disable=SC2086
  render "$kind" $extra
  local repo="$out/$kind/spec-objects-example"
  [ -f "$repo/spec_objects_example/manifest.yaml" ] \
    || { echo "FAIL $kind: no manifest" >&2; exit 1; }
  if grep -rIl -e '{{ *cookiecutter' -e '{% *if' -e '{% *for' "$repo" \
      --exclude-dir=node_modules --exclude-dir=.github --exclude=LICENSE; then
    echo "FAIL $kind: unrendered template syntax" >&2; exit 1
  fi
  if [ "${SKIP_NPM:-}" != 1 ]; then
    (cd "$repo" && npm install --no-audit --no-fund >/dev/null \
      && node scripts/emit-schemas.mjs \
      && node scripts/emit-schemas.mjs --check)
    for schema in "$@"; do
      [ -f "$repo/spec_objects_example/schemas/$schema.json" ] \
        || { echo "FAIL $kind: $schema.json not emitted" >&2; exit 1; }
    done
    if command -v quire >/dev/null; then
      (cd "$repo" && quire validate --scope . "spec/**/*.md")
    fi
  fi
  echo "ok $kind"
}

check_kind object "" Element
check_kind artifact "" Note
check_kind mixed "imported_modules=agent-ix/spec-objects-business@0.1.0" Element Note

# a bad value is refused before anything is written
if cookiecutter --no-input -o "$out/bad" "$here" license=MIT >/dev/null 2>&1; then
  echo "FAIL: non-AGPL license was accepted" >&2; exit 1
fi
[ -z "$(find "$out/bad" -type f 2>/dev/null)" ] || { echo "FAIL: refused render wrote files" >&2; exit 1; }
echo "ok refusal"
