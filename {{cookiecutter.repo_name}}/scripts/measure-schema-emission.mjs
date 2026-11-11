#!/usr/bin/env node
// Measure schema-emission determinism as a paired run (FR-004, MP-001).
//
// Emits the schemas twice, each time in a fresh process with its own scratch
// directory, and writes one measurement collection per emission. The two are
// then compared by the measurement tooling under the plan's `equal` relation;
// this script computes no paired verdict. It only gates its own exit status on
// a byte-for-byte check.
//
// The two emissions are made as unlike as a deterministic emitter allows: each
// runs from its own empty working directory with TMPDIR pointing there, and the
// second starts only after the wall-clock second has changed. An emitter that
// leaks its directory or the clock into its output therefore differs.
//
//   node scripts/measure-schema-emission.mjs [--out DIR] [--record] [--repo DIR]
//                                            [--emit PROGRAM [ARG...]]
//
//   --out DIR      where the two collection files go (default: a fresh temp dir,
//                  removed after a passing run and kept, with its path printed, on failure)
//   --record       store each collection with `quoin measurement record`
//   --repo DIR     the repository whose plans and evidence quoin uses (default: .)
//   --emit ...     the emit command, taking everything after it; it must print a
//                  JSON object {file name: text}. Default: emit-schemas.mjs --print
//
// Node built-ins only, zero dependencies.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLAN = {
  id: "MP-001",
  metric: "schema_emission_digest",
  definitionVersion: "schema.emission-digest-v1",
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

class MeasureError extends Error {}
class UsageError extends Error {}

function parseArgs(argv) {
  const options = { out: undefined, record: false, repo: ".", emit: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--record") options.record = true;
    else if (arg === "--out" || arg === "--repo") {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`${arg} needs a directory`);
      }
      options[arg.slice(2)] = value;
    } else if (arg === "--emit") {
      options.emit = argv.slice(i + 1);
      break;
    } else throw new UsageError(`unknown argument ${JSON.stringify(arg)}`);
  }
  if (options.emit && options.emit.length === 0) {
    throw new UsageError("--emit needs a program");
  }
  return options;
}

/** One emission in a fresh process and its own scratch directory: a Map of file name to text. */
function emitOnce(command) {
  const scratch = mkdtempSync(join(tmpdir(), "emission-cwd-"));
  const [program, ...args] = command ?? [
    process.execPath,
    join(here, "emit-schemas.mjs"),
    "--print",
  ];
  let stdout;
  try {
    stdout = execFileSync(program, args, {
      cwd: scratch,
      env: { ...process.env, TMPDIR: scratch },
      encoding: "utf8",
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new MeasureError(
      `the emit command failed:\n${[error.stdout, error.stderr].filter(Boolean).join("\n")}`,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return new Map(Object.entries(JSON.parse(stdout)));
}

/** Block until the wall-clock second differs from `since` (ms), so the runs straddle a second. */
function waitPastSecond(since) {
  const second = Math.floor(since / 1000);
  while (Math.floor(Date.now() / 1000) === second) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * The first six bytes of the SHA-256 as an integer, exact in a double. A 48-bit
 * prefix can collide, so it is the slice value only; the full digest is kept in
 * rawEvidence and the byte comparison below decides this script's exit status.
 */
function digest(text) {
  return Number(BigInt(`0x${sha256(text).slice(0, 12)}`));
}

function collection(emission, run, stamp) {
  const files = [...emission.keys()].sort();
  return {
    schemaVersion: 2,
    collectionId: `schema-emission-${stamp}-run${run}`,
    subject: "schema emission",
    scope: { files },
    toolIdentity: "measure-schema-emission",
    toolVersion: "1",
    timestamp: new Date().toISOString(),
    environment: { runner: "local", node: process.versions.node },
    verificationStack: {
      schemaVersion: "verification-stack-attestation-v1",
      buildProfile: "release",
      toolchains: { node: process.versions.node },
      sources: {},
      capabilities: ["schema.emission"],
      artifacts: ["typespec/main.tsp"],
    },
    observations: files.map((file) => ({
      metric: PLAN.metric,
      planId: PLAN.id,
      definitionVersion: PLAN.definitionVersion,
      state: "measured",
      value: digest(emission.get(file)),
      unit: "sha256-48",
      shape: "scalar",
      dimensions: { schema: file },
      population: { examined: 1, complete: true },
    })),
    rawEvidence: {
      run,
      sha256: Object.fromEntries(files.map((file) => [file, sha256(emission.get(file))])),
    },
  };
}

/** Every file that differs between the two emissions, by name. */
function differences(first, second) {
  const names = new Set([...first.keys(), ...second.keys()]);
  return [...names].sort().filter((name) => first.get(name) !== second.get(name));
}

function record(path, repo) {
  try {
    execFileSync("quoin", ["measurement", "record", "--input", path, "--repo", repo], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new MeasureError(
        "quoin is not installed, so --record cannot run. Install it with `npm i -g @agent-ix/quoin`.",
      );
    }
    throw new MeasureError(
      `quoin refused ${path}:\n${[error.stdout, error.stderr].filter(Boolean).join("\n")}`,
    );
  }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const started = Date.now();
    const first = emitOnce(options.emit);
    waitPastSecond(started);
    const second = emitOnce(options.emit);
    // A pair that compared no schema is inconclusive, never agreement, and a
    // file only one emission produced is a disagreement before any digest.
    if (first.size === 0 || second.size === 0) {
      throw new MeasureError(
        `an emission produced no schema (${first.size} then ${second.size}); nothing was recorded`,
      );
    }
    const oneSided = differences(first, second).filter(
      (name) => !first.has(name) || !second.has(name),
    );
    if (oneSided.length > 0) {
      throw new MeasureError(
        `the two emissions produced different file sets; nothing was recorded:\n  ${oneSided.join("\n  ")}`,
      );
    }
    const scratchOut = options.out === undefined;
    const out = scratchOut
      ? mkdtempSync(join(tmpdir(), "schema-emission-"))
      : resolve(options.out);
    mkdirSync(out, { recursive: true });
    const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 17);
    const paths = [first, second].map((emission, index) => {
      const document = collection(emission, index + 1, stamp);
      const path = join(out, `${document.collectionId}.json`);
      writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
      return path;
    });
    if (options.record) for (const path of paths) record(path, resolve(options.repo));
    const differing = differences(first, second);
    if (differing.length > 0) {
      console.error(
        `the two emissions differ in ${differing.length} file(s):\n  ${differing.join("\n  ")}`,
      );
      console.error(`collections kept in ${out}`);
      return 1;
    }
    console.log(`measure-schema-emission: ${first.size} schema(s) byte-identical across two emissions`);
    if (scratchOut) rmSync(out, { recursive: true, force: true });
    else for (const path of paths) console.log(path);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\nusage: measure-schema-emission.mjs [--out DIR] [--record] [--repo DIR] [--emit PROGRAM [ARG...]]`);
      return 2;
    }
    if (error instanceof MeasureError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

process.exitCode = main();
