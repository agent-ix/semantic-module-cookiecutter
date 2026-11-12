#!/usr/bin/env node
// Emit this module's JSON Schemas from typespec/main.tsp.
//
// Runs the official @typespec/json-schema emitter through `tsp compile`, keeps
// only this module's namespace, rewrites any $id or $ref the emitter left
// relative to an absolute URL under a DECLARED base, and renders the result
// deterministically. A wrong schema is fixed in typespec/main.tsp and
// regenerated, never hand-edited.
//
//   node scripts/emit-schemas.mjs           write the package's schemas/
//   node scripts/emit-schemas.mjs --check   write nothing; exit 1 on any drift
//   node scripts/emit-schemas.mjs --print   write nothing; print {file: text} as JSON
//
// Node built-ins only, zero dependencies.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_HOST = "https://schemas.agent-ix.org";
const MIN_NODE_MAJOR = 20;
const PACKAGE_DIR = "{{ cookiecutter.package_name }}";

class EmitError extends Error {}

function fail(message) {
  throw new EmitError(message);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(repoRoot, PACKAGE_DIR, "schemas");

function requireNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    fail(
      `Node ${MIN_NODE_MAJOR} or later is required by @typespec/compiler; this is Node ${process.versions.node}.`,
    );
  }
}

/** The package identity (org/repo): the package.json name without its leading @. */
function identity() {
  const { name } = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf8"),
  );
  if (typeof name !== "string" || !/^@[^/]+\/[^/]+$/.test(name)) {
    fail(`package.json name ${JSON.stringify(name)} is not @org/repo`);
  }
  return name.slice(1);
}

/** The semantic-core base: the installed @agent-ix/semantic-core version. */
function semanticCoreBase() {
  const pkg = join(
    repoRoot,
    "node_modules/@agent-ix/semantic-core/package.json",
  );
  if (!existsSync(pkg)) {
    fail("@agent-ix/semantic-core is not installed; run `make install`.");
  }
  const { version } = JSON.parse(readFileSync(pkg, "utf8"));
  return `${SCHEMA_HOST}/semantic-core/${version}/`;
}

/** One base per imported module, read from the manifest's semantic.imports block. */
function importedBases() {
  const text = readFileSync(join(repoRoot, PACKAGE_DIR, "manifest.yaml"), "utf8");
  const block = text.match(/^ {2}imports:\s*(\{\s*\}|\n(?: {4}\S.*\n?)*)/m);
  const bases = new Map();
  if (!block || block[1].trim() === "{}") return bases;
  for (const line of block[1].split("\n")) {
    const entry = line.match(/^ {4}([^:]+):\s*(\S+)\s*$/);
    if (!entry) continue;
    const id = entry[1].trim().replace(/^["']|["']$/g, "");
    bases.set(id, `${SCHEMA_HOST}/${id}/`);
  }
  return bases;
}

/** The @jsonSchema base declared by the source, checked against the identity. */
function moduleBase(id) {
  const source = readFileSync(join(repoRoot, "typespec/main.tsp"), "utf8");
  const declared = source.match(/@jsonSchema\("([^"]+)"\)/)?.[1];
  if (!declared) fail("typespec/main.tsp declares no @jsonSchema base");
  const expected = `${SCHEMA_HOST}/${id}/`;
  if (declared !== expected) {
    fail(
      "@jsonSchema base does not match the package identity:\n" +
        `  typespec/main.tsp: ${declared}\n  expected base: ${expected}`,
    );
  }
  return declared;
}

function compile(scratch) {
  const cli = join(
    repoRoot,
    "node_modules/@typespec/compiler/entrypoints/cli.js",
  );
  if (!existsSync(cli)) {
    fail("@typespec/compiler is not installed; run `make install`.");
  }
  try {
    execFileSync(
      process.execPath,
      [cli, "compile", join(repoRoot, "typespec"), "--output-dir", scratch],
      { cwd: repoRoot, stdio: "pipe", encoding: "utf8" },
    );
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join("\n");
    fail(`tsp compile failed; the committed output was not touched.\n${detail}`);
  }
}

/**
 * Rewrite a relative $id/$ref to an absolute one under a declared base: a file
 * this module emits resolves under the module base, a semantic-core model under
 * the semantic-core base, and an imported module's model under that module's
 * base. Anything else fails. `schemas` is a list of [name, schema], mutated.
 */
function absolutize(schemas, base, moduleFiles, imports, coreBase) {
  const problems = [];
  const fix = (name, value) => {
    if (typeof value !== "string" || /^https?:\/\//.test(value)) return value;
    if (moduleFiles.has(value)) return `${base}${value}`;
    const qualified = value.match(/^([^/]+\/[^/]+)\/(.+)$/);
    if (qualified && imports.has(qualified[1])) {
      return `${imports.get(qualified[1])}${qualified[2]}`;
    }
    if (/^[A-Za-z][A-Za-z0-9]*\.json$/.test(value)) return `${coreBase}${value}`;
    problems.push(
      `${name}: reference ${JSON.stringify(value)} matches no declared base ` +
        `(this module, ${coreBase}, or an entry of semantic.imports)`,
    );
    return value;
  };
  const walk = (name, node) => {
    if (Array.isArray(node)) return node.forEach((item) => walk(name, item));
    if (!node || typeof node !== "object") return;
    for (const key of ["$id", "$ref"]) {
      if (key in node) node[key] = fix(name, node[key]);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== "$id" && key !== "$ref") walk(name, value);
    }
  };
  for (const [name, schema] of schemas) walk(name, schema);
  if (problems.length > 0) fail(problems.join("\n"));
}

/** Compile and normalize. Returns a Map of file name to rendered text. */
function emit() {
  requireNode();
  const base = moduleBase(identity());
  const imports = importedBases();
  const scratch = mkdtempSync(join(tmpdir(), "emit-schemas-"));
  try {
    compile(scratch);
    const all = readdirSync(scratch)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => [name, JSON.parse(readFileSync(join(scratch, name), "utf8"))]);
    // The emitter re-emits every imported library's models beside this
    // module's; those ship in their own packages.
    const mine = all.filter(
      ([, schema]) => typeof schema.$id === "string" && schema.$id.startsWith(base),
    );
    if (mine.length === 0) {
      fail(`tsp compile emitted no schema under ${base}; the committed output was not touched.`);
    }
    absolutize(mine, base, new Set(mine.map(([n]) => n)), imports, semanticCoreBase());
    return new Map(
      mine.map(([name, schema]) => [name, `${JSON.stringify(schema, null, 2)}\n`]),
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function readIfPresent(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function drift(rendered) {
  const problems = [];
  for (const [name, text] of rendered) {
    const path = join(outputDir, name);
    if (readIfPresent(path) !== text) problems.push(relative(repoRoot, path));
  }
  let committed = [];
  try {
    committed = readdirSync(outputDir).filter((n) => n.endsWith(".json"));
  } catch {
    problems.push(`${relative(repoRoot, outputDir)} (missing; run \`make schemas\`)`);
  }
  for (const name of committed) {
    if (!rendered.has(name)) problems.push(`${relative(repoRoot, join(outputDir, name))} (stale)`);
  }
  return problems;
}

function main() {
  const check = process.argv.includes("--check");
  try {
    const rendered = emit();
    if (process.argv.includes("--print")) {
      process.stdout.write(JSON.stringify(Object.fromEntries(rendered)));
      return 0;
    }
    if (check) {
      const problems = drift(rendered);
      if (problems.length > 0) {
        console.error(
          `emitted schemas differ from the committed output:\n  ${problems.join("\n  ")}\n` +
            "Run `make schemas` and commit the result.",
        );
        return 1;
      }
      console.log(`schemas-check: ${rendered.size} schema(s) match the committed output`);
      return 0;
    }
    mkdirSync(outputDir, { recursive: true });
    for (const name of readdirSync(outputDir)) {
      if (name.endsWith(".json") && !rendered.has(name)) rmSync(join(outputDir, name));
    }
    for (const [name, text] of rendered) writeFileSync(join(outputDir, name), text);
    console.log(`schemas: wrote ${rendered.size} schema(s) to ${relative(repoRoot, outputDir)}`);
    return 0;
  } catch (error) {
    if (error instanceof EmitError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

process.exitCode = main();
