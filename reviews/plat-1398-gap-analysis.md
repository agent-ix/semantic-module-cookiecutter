---
id: SR-002
title: gap analysis of the PLAT-1398 paired-run emission measurement
type: SpecReview
analysis: gap-analysis
scope: "agent-ix/semantic-module-cookiecutter; {{cookiecutter.repo_name}}/spec/functional/FR-004-measure-emission-determinism.md; {{cookiecutter.repo_name}}/tests/test_emission_determinism.py; {{cookiecutter.repo_name}}/scripts/measure-schema-emission.mjs"
review_set: subset
date: '2026-11-11'
---

# gap analysis of the PLAT-1398 paired-run emission measurement

## Summary

Ticket: PLAT-1398 (agent-ix/semantic-module-cookiecutter PR #1, head 3dc4fbb). Plan completion: not assessed.

The 4 tests in the rendered object module pass, including AC-3 against quoin 0.30.0. `quoin measurement verify --plan MP-001` returns `inconclusive` (`no_decision_rule`) with exit 1. `quoin report` lists the two hash prefixes as "Current" values. `compare_paired_runs` appears in quoin origin/main only in `quoin-measurement` (lib and tests). No CLI command calls it.

## Scope

- `FR-004-AC-1` (examined): "Two emissions of an unchanged source exit 0 and write two collections whose observations carry equal values for every schema."
- `FR-004-AC-2` (examined): "An emission that differs between the two runs exits non-zero, names the differing file, and still writes both collections with unequal values for that file."
- `FR-004-AC-3` (examined): "Both collections are accepted by `quoin measurement record` against `MP-001`."
- `FR-004-AC-4` (examined): "`MP-001` declares `paired_run` with relation `equal` and validates as a `MeasurementPlan`."
- `FR-004` (examined): the Description and Behavior bullets.

## Findings

| ID | Severity | Summary | Refs |
| --- | --- | --- | --- |
| FND-001 | medium | FR-004-AC-4 says MP-001 "validates as a MeasurementPlan", but its test only reads three frontmatter keys. The real validation fails on the installed toolchain (see SR-001 FND-001). The test should run the plan through quire validate, and it will stay red until the engineering-assurance release lands. | {{cookiecutter.repo_name}}/tests/test_emission_determinism.py:83-90 |
| FND-002 | low | Three FR-004 Behavior bullets have no AC and no test: no write into `schemas/`, failing with the install command when quoin is absent, and an empty or one-sided file set. | {{cookiecutter.repo_name}}/spec/functional/FR-004-measure-emission-determinism.md:33-38 |
| FND-003 | low | Every test injects `--emit node -e ...`, and `tests/render.sh` never runs the producer, so the default path through the TypeSpec emitter is exercised by nothing. The reviewer ran it by hand and it worked. Add a producer run to the npm leg of `tests/render.sh`. | {{cookiecutter.repo_name}}/tests/test_emission_determinism.py:25-31 |
| FND-004 | medium | The ticket's outcome, "the metric is computed and not asserted", is not reachable yet. Quoin has no CLI surface for `compare_paired_runs`: `measurement verify` is inconclusive, and `report` shows the hash prefixes as metric values. The only verdict today is the producer's own exit status, from a single run. Needs a quoin ticket: `measurement verify` (or `report`) should evaluate `paired_run` plans over the two latest collections and emit the FR-132 count or status. | {{cookiecutter.repo_name}}/spec/functional/FR-004-measure-emission-determinism.md:14-19 |

## Verdict

AC-1, AC-2 and AC-3 are backed by tests that can fail. The AC-2 injected fault was proven red: exit 1, the file named, both collections kept with unequal values. With `--record` the reviewer confirmed both collections are stored on a failing run. AC-4's test is weaker than its criterion. FND-004 does not block the cookiecutter half: it is a missing quoin capability. PLAT-1398 should not close until that capability exists.
