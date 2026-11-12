---
id: SR-001
title: code review of the PLAT-1398 paired-run emission producer
type: SpecReview
analysis: code-review
scope: "agent-ix/semantic-module-cookiecutter; {{cookiecutter.repo_name}}/scripts/measure-schema-emission.mjs; {{cookiecutter.repo_name}}/scripts/emit-schemas.mjs; {{cookiecutter.repo_name}}/Makefile; {{cookiecutter.repo_name}}/pyproject.toml; {{cookiecutter.repo_name}}/AGENTS.md; {{cookiecutter.repo_name}}/spec/assurance/MP-001-schema-emission-determinism.md"
review_set: subset
date: '2026-11-11'
---

# code review of the PLAT-1398 paired-run emission producer

## Summary

Ticket: PLAT-1398 (agent-ix/semantic-module-cookiecutter PR #1, head 3dc4fbb). JS and Python idiom pass included; there is no Rust.

Evidence run by the reviewer in its own worktree. `SKIP_NPM=1 tests/render.sh` passed. `npm install` against registry.npmjs.org worked in a rendered object module. The real emit path ran: `emit-schemas.mjs`, `--check` and `measure-schema-emission.mjs` reported 2 schemas byte-identical, and `--record` stored 2 collections. The full `tests/render.sh` exits 3 on the PR head and 0 on base 3fb6e75. An injected fault run with `--record` exits 1, names the file and stores both collections. An empty emission exits 0.

## Scope

- `scripts/measure-schema-emission.mjs` (examined): the producer, its argument parsing, emit, digest, collection, record and exit paths.
- `scripts/emit-schemas.mjs#--print` (examined): "write nothing; print {file: text} as JSON".
- `Makefile#measure-emission`, `pyproject.toml#measure-emission`, `AGENTS.md` (examined): wiring.
- `MP-001` frontmatter (examined): `paired_run: {relation: equal, minimum_pairs: 1}`.

## Findings

| ID | Severity | Summary | Refs |
| --- | --- | --- | --- |
| FND-001 | high | The PR turns the template's full self-test and every rendered module's `make gate` red. `quire validate` (quire 0.40.0, engineering-assurance 0.8.1) rejects MP-001 with "Additional properties are not allowed ('paired_run' was unexpected)". The full `tests/render.sh` exits 3 on the head and 0 on base. The plan needs an engineering-assurance release that carries #205 to be installed first. | {{cookiecutter.repo_name}}/spec/assurance/MP-001-schema-emission-determinism.md:10-12 |
| FND-002 | medium | An empty emission (both runs print `{}`) exits 0 with "0 schema(s) byte-identical across two emissions". That contradicts MP-001's Interpretation, "A pair that compared no schema is inconclusive, never zero". The producer's exit gate should fail when either emission is empty. | {{cookiecutter.repo_name}}/scripts/measure-schema-emission.mjs:155-168 |
| FND-003 | medium | Both emissions run back to back with the same cwd (`repoRoot`), absolute repo path, environment and clock second. Nondeterminism keyed on the working directory or the clock cannot show up, so it passes falsely. Those are exactly the variations NFR-019's operational context named. Run the second emission from a copy of the repository at a different path, with a shifted TZ or clock. | {{cookiecutter.repo_name}}/scripts/measure-schema-emission.mjs:55-75 |
| FND-004 | low | The message when quoin is absent, "Install the quoin CLI.", names no install command. FR-004 Behavior requires one. | {{cookiecutter.repo_name}}/scripts/measure-schema-emission.mjs:131-134 |
| FND-005 | low | `--repo` given with no value reaches `resolve(undefined)` and dies with a TypeError stack trace instead of a MeasureError. `--out` with no value silently falls back to a temp dir. | {{cookiecutter.repo_name}}/scripts/measure-schema-emission.mjs:38-52 |
| FND-006 | low | With no `--out`, the default temp dir is never removed. `make measure-emission` (`--record`) leaves one `/tmp/schema-emission-*` directory per run after quoin has stored copies. | {{cookiecutter.repo_name}}/scripts/measure-schema-emission.mjs:148-150 |

## Verdict

The producer is sound on its main path. Each emission is a fresh `execFileSync` child with emit-schemas' own `mkdtemp` scratch dir, which is removed in `finally`. Both collections are written and recorded before the exit gate, so a failing run still records; this was verified with `--record`. A file-set difference is named. `--print` writes nothing. No quoin code or schema is copied. The diff carries no build artifacts and no research text. FND-001 blocks merge until an engineering-assurance release with `paired_run` is installed. FND-002 and FND-003 are real false-pass paths and should be fixed in this PR.
