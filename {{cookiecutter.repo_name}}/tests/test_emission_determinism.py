"""Emission determinism is measured as a paired run, not asserted by one run."""

from __future__ import annotations

import json
import shutil
import subprocess

import pytest
import yaml

PLAN_PATH = "spec/assurance/MP-001-schema-emission-determinism.md"

# A stable emission, and one whose second run differs in a single file.
STABLE = (
    "const out = {'A.json': '{\"a\":1}\\n', 'B.json': '{\"b\":2}\\n'};"
    "process.stdout.write(JSON.stringify(out));"
)
FLAKY = (
    "const out = {'A.json': '{\"a\":1}\\n', 'B.json': '{\"b\":' + Math.random() + '}\\n'};"
    "process.stdout.write(JSON.stringify(out));"
)


def measure(repo_root, out, *args: str, emit: str | None = None):
    command = ["node", "scripts/measure-schema-emission.mjs", "--out", str(out), *args]
    if emit is not None:
        command += ["--emit", "node", "-e", emit]
    return subprocess.run(
        command, cwd=repo_root, capture_output=True, text=True, check=False
    )


def collections(out):
    return [json.loads(p.read_text()) for p in sorted(out.glob("*.json"))]


def values(document):
    return {o["dimensions"]["schema"]: o["value"] for o in document["observations"]}


@pytest.mark.trace("FR-004-AC-1")
def test_an_unchanged_emission_writes_two_collections_with_equal_values(
    repo_root, tmp_path
):
    result = measure(repo_root, tmp_path, emit=STABLE)
    assert result.returncode == 0, result.stdout + result.stderr
    first, second = collections(tmp_path)
    assert values(first) == values(second)
    assert set(values(first)) == {"A.json", "B.json"}


@pytest.mark.trace("FR-004-AC-2")
def test_a_nondeterministic_emission_fails_naming_the_file_and_keeps_both_collections(
    repo_root, tmp_path
):
    result = measure(repo_root, tmp_path, emit=FLAKY)
    assert result.returncode != 0
    assert "B.json" in result.stderr
    assert "A.json" not in result.stderr
    first, second = collections(tmp_path)
    assert values(first)["A.json"] == values(second)["A.json"]
    assert values(first)["B.json"] != values(second)["B.json"]


@pytest.mark.trace("FR-004-AC-3")
def test_both_collections_are_accepted_by_quoin_against_the_plan(repo_root, tmp_path):
    if shutil.which("quoin") is None:
        pytest.fail(
            "quoin is not installed, so intake cannot be exercised. Install the "
            "quoin CLI. This is a failure and not a skip."
        )
    target = tmp_path / "repo"
    (target / "spec" / "assurance").mkdir(parents=True)
    shutil.copy(repo_root / PLAN_PATH, target / PLAN_PATH)
    result = measure(
        repo_root, tmp_path / "out", "--record", "--repo", str(target), emit=STABLE
    )
    assert result.returncode == 0, result.stdout + result.stderr
    stored = sorted((target / "spec" / "evidence" / "measurements").glob("*.json"))
    assert len(stored) == 2


@pytest.mark.trace("FR-004-AC-4")
def test_the_plan_declares_an_equal_paired_run(repo_root):
    text = (repo_root / PLAN_PATH).read_text()
    frontmatter = yaml.safe_load(text.split("---", 2)[1])
    assert frontmatter["type"] == "MeasurementPlan"
    assert frontmatter["paired_run"]["relation"] == "equal"
    assert frontmatter["metric"] == "schema_emission_digest"
