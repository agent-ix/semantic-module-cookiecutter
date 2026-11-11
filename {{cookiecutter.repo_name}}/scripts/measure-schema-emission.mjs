#!/usr/bin/env node
// Measure schema-emission determinism as a paired run (FR-004, MP-001).
//
// Emits the schemas twice, each time in a fresh process with its own scratch
// directory, and writes one measurement collection per emission. The two are
// then compared by the measurement tooling under the plan's `equal` relation;
// this script only gates its own exit status on a byte-for-byte check.
//
//   node scripts/measure-schema-emission.mjs [--out DIR] [--record] [--repo DIR]
//                                            [--emit PROGRAM [ARG...]]
//
//   --out DIR      where the two collection files go (default: a fresh temp dir)
//   --record       store each collection with `quoin measurement record`
//   --repo DIR     the repository whose plans and evidence quoin uses (default: .)
//   --emit ...     the emit command, taking everything after it; it must print a
//                  JSON object {file name: text}. Default: emit-schemas.mjs --print
//
// Node built-ins only, zero dependencies.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

function parseArgs(argv) {
  const options = { out: undefined, record: false, repo: ".", emit: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--record") options.record = true;
    else if (arg === "--out") options.out = argv[++i];
    else if (arg === "--repo") options.repo = argv[++i];
    else if (arg === "--emit") {
      options.emit = argv.slice(i + 1);
      break;
    } else throw new MeasureError(`unknown argument ${JSON.stringify(arg)}`);
  }
  if (options.emit && options.emit.length === 0) {
    throw new MeasureError("--emit needs a program");
  }
  return options;
}

/** One emission in a fresh process: a Map of file name to text. */
function emitOnce(command) {
  const [program, ...args] = command ?? [
    process.execPath,
    join(here, "emit-schemas.mjs"),
    "--print",
  ];
  let stdout;
  try {
    stdout = execFileSync(program, args, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new MeasureError(
      `the emit command failed:\n${[error.stdout, error.stderr].filter(Boolean).join("\n")}`,
    );
  }
  return new Map(Object.entries(JSON.parse(stdout)));
}

/** The first six bytes of the SHA-256 as an integer, exact in a double. */
function digest(text) {
  return Number(
    BigInt(`0x${createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12)}`),
  );
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
    rawEvidence: { run, files },
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
        "quoin is not installed, so --record cannot run. Install the quoin CLI.",
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
    const first = emitOnce(options.emit);
    const second = emitOnce(options.emit);
    const out = options.out
      ? resolve(options.out)
      : mkdtempSync(join(tmpdir(), "schema-emission-"));
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
      return 1;
    }
    console.log(`measure-schema-emission: ${first.size} schema(s) byte-identical across two emissions`);
    for (const path of paths) console.log(path);
    return 0;
  } catch (error) {
    if (error instanceof MeasureError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

process.exitCode = main();
