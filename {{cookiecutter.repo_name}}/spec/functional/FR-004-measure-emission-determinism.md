---
id: FR-004
title: "Measure emission determinism as a paired run"
type: FR
relationships:
  - target: "ix://{{ cookiecutter.org }}/{{ cookiecutter.repo_name }}/FR-002"
    type: "extends"
---

# FR-004: Measure emission determinism as a paired run

## Description

The module SHALL carry a producer that emits the declaration schemas twice,
each from a fresh process, in its own working directory and at a different
wall-clock second, compares the two emissions
byte for byte, and records each emission as one measurement collection under a
`MeasurementPlan` that states a `paired_run` relation of `equal`. Whether the
two emissions agree is therefore a count that the measurement tooling computes
from the two collections (`quoin measurement verify --plan MP-001`, quoin
>= 0.30.1); the producer asserts no paired verdict of its own, and its exit
status on the byte check is its direct local signal.

## Inputs

- `scripts/emit-schemas.mjs --print`, or an alternative emit command named by `--emit`
- `spec/assurance/MP-001-schema-emission-determinism.md`

## Outputs

- Two collection JSON files, one per emission, written to the directory named by `--out`
- With `--record`, the same two collections stored by `quoin measurement record`
- Exit status 0 when every schema is byte-identical across the two emissions, 1 otherwise

## Behavior

- Each collection SHALL carry one observation per emitted schema file, with dimension `schema` set to the file name and a value derived from the SHA-256 of the file's bytes.
- Each emission SHALL run from its own empty working directory with `TMPDIR` set there.
- The second emission SHALL start only after the wall-clock second of the first's start has passed.
- If the two emissions differ in the bytes of any file, then the producer SHALL exit non-zero naming each differing file, after writing and recording both collections.
- If either emission produces no schema, or the two produce different sets of files, then the producer SHALL exit non-zero naming the problem, writing and recording no collection.
- The producer SHALL NOT write into `{{ cookiecutter.package_name }}/schemas/`.
- If `--record` is given and `quoin` is not installed, then the producer SHALL fail naming the install command `npm i -g @agent-ix/quoin`.
- If an argument is unknown or `--out` or `--repo` lacks its value, then the producer SHALL print a usage message and exit 2.
- Where `--out` is not given, the producer SHALL remove its scratch output after a passing run and keep it, printing its path, after a failing one.
- The slice value is a 48-bit prefix of the file's SHA-256; each collection SHALL keep the full digests in `rawEvidence`.
- The producer SHALL contain no comparison logic beyond the byte check that gates its exit status.

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| FR-004-AC-1 | Two emissions of an unchanged source exit 0 and write two collections whose observations carry equal values for every schema. | Test |
| FR-004-AC-2 | An emission that differs between the two runs exits non-zero, names the differing file, and still writes and records both collections with unequal values for that file. | Test |
| FR-004-AC-3 | Both collections are accepted by `quoin measurement record` against `MP-001`. | Test |
| FR-004-AC-4 | `MP-001` declares `paired_run` with relation `equal` for the metric the producer emits. Its structural validity as a `MeasurementPlan` is checked by `make validate`. | Test |
| FR-004-AC-5 | An emission that produces no schema, or two emissions producing different file sets, exit non-zero naming the problem and leave no collection written. | Test |
| FR-004-AC-6 | An emission whose output depends on its working directory, and one whose output depends on the clock, each exit non-zero naming the differing file. | Test |
| FR-004-AC-7 | The producer leaves `{{ cookiecutter.package_name }}/schemas/` unchanged. | Test |
| FR-004-AC-8 | With `--record` and no `quoin` on `PATH`, the producer fails naming `npm i -g @agent-ix/quoin`. | Test |
| FR-004-AC-9 | A missing `--out` or `--repo` value exits 2 with a usage message. | Test |
| FR-004-AC-10 | The scratch output of a passing run without `--out` is removed; that of a failing run is kept and its path printed. | Test |

## Dependencies

- **Upstream**: [FR-002](./FR-002-emit-schemas-deterministically.md)
