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
  - target: "ix://{{ cookiecutter.org }}/{{ cookiecutter.repo_name }}/FR-004"
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
Equal digests across the pair mean the bytes agreed; a differing digest means
they did not.

## Collection Procedure

`node scripts/measure-schema-emission.mjs --record` emits twice, each in a
fresh process, and records one collection per emission.

## Interpretation

The two collections are compared by the measurement tooling under the plan's
`equal` relation. A pair that compared no schema is inconclusive, never zero.
