---
id: SR-003
title: spec review of FR-004 and MP-001 for PLAT-1398
type: SpecReview
analysis: base
scope: "agent-ix/semantic-module-cookiecutter; {{cookiecutter.repo_name}}/spec/functional/FR-004-measure-emission-determinism.md; {{cookiecutter.repo_name}}/spec/assurance/MP-001-schema-emission-determinism.md; {{cookiecutter.repo_name}}/spec/functional/FR-002-emit-schemas-deterministically.md"
review_set: subset
date: '2026-11-11'
---

# spec review of FR-004 and MP-001 for PLAT-1398

## Summary

Ticket: PLAT-1398 (agent-ix/semantic-module-cookiecutter PR #1, head 3dc4fbb). The integrity and EARS sub-checks were applied inline.

The comparison point is NFR-019 as it stood before quoin removed it in PLAT-1385 (#798). Its M-2 row reads "Differing bytes between two schema emissions from an unchanged source", with target 0. Its scope names "two renders on machines whose only difference is the working directory and the clock". On quoin origin/main nothing outside reviews references NFR-019, so there is no quoin-side obligation to update.

The EA origin/main `measurement-plan-frontmatter.schema.json` (v0.8.1-4-g20cdc0b) validates MP-001's frontmatter with no errors under python jsonschema. v0.8.1 has no `paired_run`.

## Scope

- `FR-004` (examined): "The module SHALL carry a producer that emits the declaration schemas twice ... Whether the two emissions agree is therefore a count computed by the measurement tooling from the two collections, never an assertion made by one run."
- `FR-004-AC-1`..`FR-004-AC-4` (examined): as written in the FR table.
- `MP-001` (examined): the frontmatter (`metric: schema_emission_digest`, `paired_run: {relation: equal, minimum_pairs: 1}`, `measures FR-004`) and the Measure Definition.
- `FR-002` (context_only): "...reproducibly, and SHALL fail on any drift..." and its AC table, which has no AC-4.

## Findings

| ID | Severity | Summary | Refs |
| --- | --- | --- | --- |
| FND-001 | medium | MP-001 `measures` FR-004, the requirement to have this producer, so the plan measures itself. The quality claim it carries (NFR-019-M-2: differing bytes between two emissions, target 0) has no owning requirement in this repo. There is only NFR-001, and FR-002's "reproducibly" has no AC. Add an NFR carrying the metric and target 0, and point MP-001 `measures` at it. | {{cookiecutter.repo_name}}/spec/assurance/MP-001-schema-emission-determinism.md:13-15 |
| FND-002 | low | MP-001's Measure Definition says "Equal digests across the pair mean the bytes agreed", but the value is a 48-bit SHA-256 prefix. The prefix is forced, because a quoin observation value is f64 and `equal` compares numbers, and the collision risk is negligible. Still, state the bound and keep the full SHA-256 per file in `rawEvidence` so the stored record can show bytes-equal. | {{cookiecutter.repo_name}}/spec/assurance/MP-001-schema-emission-determinism.md:32-37 |
| FND-003 | low | "Where the two emissions differ ... the producer SHALL exit non-zero" uses EARS `Where`, the feature-presence form, for an unwanted condition. It should read "If ..., then the producer SHALL ...". | {{cookiecutter.repo_name}}/spec/functional/FR-004-measure-emission-determinism.md:34 |
| FND-004 | low | FR-004-AC-2 says the failing run "still writes both collections". The Behavior bullet requires "after writing and recording both". The AC drops recording, so the failure-path record is unbacked. | {{cookiecutter.repo_name}}/spec/functional/FR-004-measure-emission-determinism.md:45 |

## Verdict

FR-004 and MP-001 are numbered consistently with the repo: FR-001..003 exist and there was no prior MP. The index, spec.md and FR-002 downstream links are updated. The `paired_run` block matches quoin FR-132-AC-7 and EA main's schema.

On the hash: a per-file 48-bit prefix under `equal` is a legitimate paired value given quoin's numeric observation shape. A slice per schema file, with a one-sided slice counted as a violation, maps M-2 ("differing bytes", target 0) onto "differing files", target 0 without loss at that target.

The FR-004 Description states the target design: "a count computed by the measurement tooling". Today no quoin CLI computes it (SR-002 FND-004). FND-001 should be fixed in this PR so the metric has an owner.
