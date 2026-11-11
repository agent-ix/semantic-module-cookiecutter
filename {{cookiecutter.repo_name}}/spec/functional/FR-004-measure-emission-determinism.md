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
each from a fresh process and scratch directory, compares the two emissions
byte for byte, and records each emission as one measurement collection under a
`MeasurementPlan` that states a `paired_run` relation of `equal`. Whether the
two emissions agree is therefore a count computed by the measurement tooling
from the two collections, never an assertion made by one run.

## Inputs

- `scripts/emit-schemas.mjs --print`, or an alternative emit command named by `--emit`
- `spec/assurance/MP-001-schema-emission-determinism.md`

## Outputs

- Two collection JSON files, one per emission, written to the directory named by `--out`
- With `--record`, the same two collections stored by `quoin measurement record`
- Exit status 0 when every schema is byte-identical across the two emissions, 1 otherwise

## Behavior

- Each collection SHALL carry one observation per emitted schema file, with dimension `schema` set to the file name and a value derived from the SHA-256 of the file's bytes.
- Where the two emissions differ in any file, in the file set, or in bytes, the producer SHALL exit non-zero naming each differing file, after writing and recording both collections.
- The producer SHALL NOT write into `{{ cookiecutter.package_name }}/schemas/`.
- If `--record` is given and `quoin` is not installed, then the producer SHALL fail naming the install command.
- The producer SHALL contain no comparison logic beyond the byte check that gates its exit status; the paired count is quoin's.

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| FR-004-AC-1 | Two emissions of an unchanged source exit 0 and write two collections whose observations carry equal values for every schema. | Test |
| FR-004-AC-2 | An emission that differs between the two runs exits non-zero, names the differing file, and still writes both collections with unequal values for that file. | Test |
| FR-004-AC-3 | Both collections are accepted by `quoin measurement record` against `MP-001`. | Test |
| FR-004-AC-4 | `MP-001` declares `paired_run` with relation `equal` and validates as a `MeasurementPlan`. | Test |

## Dependencies

- **Upstream**: [FR-002](./FR-002-emit-schemas-deterministically.md)
