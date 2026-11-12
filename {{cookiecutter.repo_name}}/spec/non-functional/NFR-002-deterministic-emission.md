---
id: NFR-002
title: "Schema emission is deterministic"
type: NFR
quality_attribute: reliability
relationships:
  - target: "ix://{{ cookiecutter.org }}/{{ cookiecutter.repo_name }}/FR-002"
    type: "constrains"
---

# NFR-002: Schema emission is deterministic

## Statement

Two emissions of an unchanged TypeSpec source SHALL produce byte-identical
schema files, regardless of working directory or wall-clock time.

## Scope

- Applies to: every file `scripts/emit-schemas.mjs` emits.
- Operational context: any two emissions of the same source on one toolchain.

## Rationale

The drift gate compares the committed bytes to one fresh emission. If the
emitter is nondeterministic, the gate fails or passes at random.

## Measurement and Evaluation

| Metric | Target | Threshold | Method |
|--------|--------|-----------|--------|
| NFR-002-M-1: schema files whose bytes differ between two emissions | 0 | 0 | Measurement ([MP-001](../assurance/MP-001-schema-emission-determinism.md), paired run) |

## Verification

`make measure-emission` records the two emissions as a pair under MP-001 and
fails when any file differs. The producer's failure paths are asserted by
FR-004's tests; no test asserts this requirement directly, so it carries no
trace tag.

## Acceptance Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| NFR-002-AC-1 | Two emissions of an unchanged source differ in 0 files. | Inspection |

## Dependencies

- **Upstream**: [FR-002](../functional/FR-002-emit-schemas-deterministically.md)
