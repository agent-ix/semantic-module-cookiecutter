"""Emission determinism is measured as a paired run, not asserted by one run."""

from __future__ import annotations

import json
import os
import shutil
import subprocess

import pytest
import yaml

PLAN_PATH = "spec/assurance/MP-001-schema-emission-determinism.md"


def emitter(body: str) -> str:
    """A node program printing {file: text}; `body` may use `out` and node's process."""
    return (
        "const out = Object.fromEntries([['A.json', '1\\n']]); "
        + body
        + "; process.stdout.write(JSON.stringify(out));"
    )


STABLE = emitter("out['B.json'] = '2\\n'")
FLAKY = emitter("out['B.json'] = String(Math.random())")
CWD_KEYED = emitter("out['B.json'] = JSON.stringify(process.cwd())")
CLOCK_KEYED = emitter("out['B.json'] = String(Math.floor(Date.now() / 1000))")
EMPTY = "process.stdout.write('{}');"
# The first run creates the marker and emits one file; the second emits two.
ONE_SIDED = (
    "const fs = require('fs'); const out = Object.fromEntries([['A.json', 'x']]);"
    "if (fs.existsSync(process.env.MARK)) out['B.json'] = 'y';"
    "else fs.writeFileSync(process.env.MARK, '');"
    "process.stdout.write(JSON.stringify(out));"
)


def measure(repo_root, *args: str, emit: str | None = None, env=None):
    command = ["node", "scripts/measure-schema-emission.mjs", *args]
    if emit is not None:
        command += ["--emit", "node", "-e", emit]
    return subprocess.run(
        command,
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )


def collections(out):
    return [json.loads(p.read_text()) for p in sorted(out.glob("*.json"))]


def values(document):
    return {o["dimensions"]["schema"]: o["value"] for o in document["observations"]}


@pytest.mark.trace("FR-004-AC-1")
def test_an_unchanged_emission_writes_two_collections_with_equal_values(
    repo_root, tmp_path
):
    result = measure(repo_root, "--out", str(tmp_path), emit=STABLE)
    assert result.returncode == 0, result.stdout + result.stderr
    first, second = collections(tmp_path)
    assert values(first) == values(second)
    assert set(values(first)) == {"A.json", "B.json"}
    # The full digest rides along in the evidence.
    assert len(first["rawEvidence"]["sha256"]["A.json"]) == 64


@pytest.mark.trace("FR-004-AC-2")
def test_a_nondeterministic_emission_fails_naming_the_file_and_keeps_both_collections(
    repo_root, tmp_path
):
    result = measure(repo_root, "--out", str(tmp_path), emit=FLAKY)
    assert result.returncode != 0
    assert "B.json" in result.stderr
    assert "A.json" not in result.stderr
    first, second = collections(tmp_path)
    assert values(first)["A.json"] == values(second)["A.json"]
    assert values(first)["B.json"] != values(second)["B.json"]


@pytest.mark.trace("FR-004-AC-2")
def test_a_differing_pair_is_recorded_before_the_producer_fails(repo_root, tmp_path):
    if shutil.which("quoin") is None:
        pytest.fail(_QUOIN_MISSING)
    target = _plan_repo(repo_root, tmp_path)
    result = measure(
        repo_root,
        "--out",
        str(tmp_path / "out"),
        "--record",
        "--repo",
        str(target),
        emit=FLAKY,
    )
    assert result.returncode != 0
    stored = (target / "spec" / "evidence" / "measurements").glob("*.json")
    assert len(list(stored)) == 2


_QUOIN_MISSING = (
    "quoin is not installed, so intake cannot be exercised. Install it with "
    "`npm i -g @agent-ix/quoin`. This is a failure and not a skip."
)


def _plan_repo(repo_root, tmp_path):
    target = tmp_path / "repo"
    (target / "spec" / "assurance").mkdir(parents=True)
    shutil.copy(repo_root / PLAN_PATH, target / PLAN_PATH)
    return target


@pytest.mark.trace("FR-004-AC-3")
def test_both_collections_are_accepted_by_quoin_against_the_plan(repo_root, tmp_path):
    if shutil.which("quoin") is None:
        pytest.fail(_QUOIN_MISSING)
    target = _plan_repo(repo_root, tmp_path)
    result = measure(
        repo_root,
        "--out",
        str(tmp_path / "out"),
        "--record",
        "--repo",
        str(target),
        emit=STABLE,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    stored = sorted((target / "spec" / "evidence" / "measurements").glob("*.json"))
    assert len(stored) == 2


@pytest.mark.trace("FR-004-AC-4")
def test_the_plan_declares_an_equal_paired_run_for_the_emitted_metric(
    repo_root, tmp_path
):
    text = (repo_root / PLAN_PATH).read_text()
    plan = yaml.safe_load(text.split("---", 2)[1])
    assert plan["type"] == "MeasurementPlan"
    assert plan["paired_run"]["relation"] == "equal"
    result = measure(repo_root, "--out", str(tmp_path), emit=STABLE)
    assert result.returncode == 0, result.stdout + result.stderr
    for document in collections(tmp_path):
        for observation in document["observations"]:
            assert observation["planId"] == plan["id"]
            assert observation["metric"] == plan["metric"]
            assert observation["definitionVersion"] == plan["definition_version"]


@pytest.mark.trace("FR-004-AC-5")
@pytest.mark.parametrize("emit", [EMPTY, ONE_SIDED], ids=["empty", "one-sided"])
def test_an_empty_or_one_sided_emission_fails_and_writes_nothing(
    repo_root, tmp_path, emit
):
    env = {**os.environ, "MARK": str(tmp_path / "marker")}
    result = measure(repo_root, "--out", str(tmp_path / "out"), emit=emit, env=env)
    assert result.returncode == 1
    assert "nothing was recorded" in result.stderr
    assert list((tmp_path / "out").glob("*.json")) == []


@pytest.mark.trace("FR-004-AC-6")
@pytest.mark.parametrize("emit", [CWD_KEYED, CLOCK_KEYED], ids=["cwd", "clock"])
def test_an_emission_keyed_on_the_directory_or_clock_is_caught(
    repo_root, tmp_path, emit
):
    result = measure(repo_root, "--out", str(tmp_path), emit=emit)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "B.json" in result.stderr


@pytest.mark.trace("FR-004-AC-7")
def test_the_producer_leaves_the_committed_schemas_unchanged(repo_root, tmp_path):
    schemas = next(repo_root.glob("*/schemas"), None)

    def snapshot():
        if schemas is None:
            return {}
        return {p.name: p.read_bytes() for p in schemas.iterdir()}

    before = snapshot()
    result = measure(repo_root, "--out", str(tmp_path), emit=STABLE)
    assert result.returncode == 0, result.stdout + result.stderr
    assert snapshot() == before


@pytest.mark.trace("FR-004-AC-8")
def test_record_without_quoin_names_the_install_command(repo_root, tmp_path):
    env = {**os.environ, "PATH": os.path.dirname(shutil.which("node"))}
    result = measure(repo_root, "--out", str(tmp_path), "--record", emit=STABLE, env=env)
    assert result.returncode == 1
    assert "npm i -g @agent-ix/quoin" in result.stderr


@pytest.mark.trace("FR-004-AC-9")
@pytest.mark.parametrize("flag", ["--out", "--repo"])
def test_a_flag_without_its_value_exits_two_with_usage(repo_root, flag):
    result = measure(repo_root, flag)
    assert result.returncode == 2
    assert "usage:" in result.stderr
    assert "TypeError" not in result.stderr


@pytest.mark.trace("FR-004-AC-10")
def test_the_scratch_output_is_removed_on_pass_and_kept_on_failure(repo_root):
    passed = measure(repo_root, emit=STABLE)
    assert passed.returncode == 0, passed.stderr
    assert "schema-emission-" not in passed.stdout

    failed = measure(repo_root, emit=FLAKY)
    assert failed.returncode == 1
    kept = failed.stderr.rsplit("collections kept in ", 1)[1].strip()
    try:
        assert len(list(__import__("pathlib").Path(kept).glob("*.json"))) == 2
    finally:
        shutil.rmtree(kept, ignore_errors=True)
