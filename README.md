# semantic-module-cookiecutter

A [cookiecutter](https://cookiecutter.readthedocs.io/) template for agent-ix
semantic-module repositories: a manifest with a `semantic:` block, a TypeSpec
skeleton, schema emission, spec, tests and a Makefile gate.

```sh
cookiecutter gh:agent-ix/semantic-module-cookiecutter
```

## Variables

| Variable | Meaning |
|---|---|
| `org`, `repo_name`, `package_name` | package identity `<org>/<repo_name>`; `package_name` is the Python package directory |
| `module_kind` | `object`, `artifact` or `mixed` (mixed requires `imported_modules`) |
| `imported_modules` | comma-separated `<org>/<repo>@<x.y.z>` imports (exact versions) |
| `generated_targets` | `semantic.targets`; must include `json-schema` |
| `nav_category_*` | catalog navigation category |
| `license` | `AGPL-3.0-or-later` only |

## What you get

The emit pipeline lives in the rendered repository (`scripts/emit-schemas.mjs`),
not in a package: it wraps `tsp compile`, keeps the module namespace, and
absolutizes relative `$id`/`$ref`. After rendering:

```sh
make bootstrap   # install toolchain, emit schemas
make gate        # validate, lint, schema drift, tests
```

The manifest's `semantic` block follows quoin FR-070: no `semantic_core`; an
optional sibling `import_types` can be added next to `imports`.

## Testing the template

```sh
make test        # renders every module_kind, emits schemas, validates specs
```

Needs `cookiecutter`, Node 20+ and npm. Dependencies resolve from npmjs.
