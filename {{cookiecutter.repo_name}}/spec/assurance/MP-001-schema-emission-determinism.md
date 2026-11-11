---
id: MP-001
title: Schema emission determinism
type: MeasurementPlan
status: active
owner: {{ cookiecutter.repo_name }}-maintainers
stage: branch-comparison
metric: schema_emission_digest
definition_version: schema.emission-digest-v1
paired_run:
  relation: equal
  minimum_pairs: 1
relationships:
  - target: "ix://{{ cookiecutter.org }}/{{ cookiecutter.repo_name }}/NFR-002-M-1"
    type: "measures"
---

# Schema emission determinism

## Decision Use

Establish that two emissions of the same TypeSpec source produce the same
bytes for every schema file. The paired comparison counts the schema files
whose two digests differ; the target is 0.

## Population

Every JSON Schema file `scripts/emit-schemas.mjs` emits, one slice per file,
keyed by the `schema` dimension.

## Measure Definition

The first six bytes of the SHA-256 of the emitted file, read as an unsigned
big-endian integer (exact in a double), definition `schema.emission-digest-v1`.
A differing digest proves the bytes differ. Equal 48-bit prefixes are strong
but not conclusive evidence that the bytes agreed (a collision is possible), so
the full SHA-256 is kept in `rawEvidence` and the producer's own byte check
decides its exit status.

## Collection Procedure

`node scripts/measure-schema-emission.mjs --record` emits twice, each in a
fresh process and its own working directory, the second after the wall-clock
second has changed, and records one collection per emission.

## Interpretation

The two collections are to be compared by the measurement tooling under the
plan's `equal` relation; until it exposes that comparison the pair is recorded
but no verdict is computed. A pair that compared no schema is inconclusive, never zero.
