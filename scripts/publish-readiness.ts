#!/usr/bin/env bun
// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Publish Readiness Check
 *
 * Automated verification that the SDK package is ready for npm publish.
 * Run: bun scripts/publish-readiness.ts
 *
 * Checks:
 *   1. Build succeeds (tsc)
 *   2. Entry points exist (main, types, exports)
 *   3. Package metadata is complete
 *   4. Pack contents are clean (no source, no tests)
 *   5. Pack size is reasonable
 *   6. Consumer import works (pack → install → import)
 *   7. Unit tests pass
 */

import { resolve } from "node:path";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import assert from "node:assert";

const ROOT_DIR = resolve(import.meta.dir, "..");
const SDK_DIR = resolve(ROOT_DIR, "packages/sdk");

let passed = 0;
let failed = 0;

// Artifacts to remove even when a check throws mid-way (stale tarballs
// previously survived failures and poisoned the next run).
const cleanupPaths: string[] = [];
process.on("exit", () => {
  for (const p of cleanupPaths) {
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

// ── 1. Build ────────────────────────────────────────────────────────────────
console.log("\n🔨 Build");
check("tsc compiles without errors", () => {
  execFileSync("npm", ["run", "build"], { cwd: SDK_DIR, stdio: "pipe" });
});

// ── 2. Entry Points ─────────────────────────────────────────────────────────
console.log("\n📦 Entry Points");
const pkg = JSON.parse(readFileSync(resolve(SDK_DIR, "package.json"), "utf8"));

check(`main exists: ${pkg.main}`, () => {
  assert(existsSync(resolve(SDK_DIR, pkg.main)), `${pkg.main} not found`);
});

check(`types exists: ${pkg.types}`, () => {
  assert(existsSync(resolve(SDK_DIR, pkg.types)), `${pkg.types} not found`);
});

if (pkg.exports) {
  for (const [key, value] of Object.entries(pkg.exports)) {
    const exp = value as any;
    if (exp.import) {
      check(`exports["${key}"].import exists: ${exp.import}`, () => {
        assert(
          existsSync(resolve(SDK_DIR, exp.import)),
          `${exp.import} not found`,
        );
      });
    }
    if (exp.types) {
      check(`exports["${key}"].types exists: ${exp.types}`, () => {
        assert(
          existsSync(resolve(SDK_DIR, exp.types)),
          `${exp.types} not found`,
        );
      });
    }
  }
}

// ── 2b. publint (packaging lint) ────────────────────────────────────────────
console.log("\n🔎 publint");
check("publint reports no packaging errors", () => {
  try {
    execFileSync("npx", ["publint"], {
      cwd: SDK_DIR,
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (e: any) {
    assert.fail(`publint failed:\n${e.stdout?.toString() || e.message}`);
  }
});

check("lock validation passes (validate:generated)", () => {
  try {
    execFileSync("bun", ["scripts/validate-generated.ts"], {
      cwd: ROOT_DIR,
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (e: any) {
    assert.fail(
      `validate-generated failed:\n${e.stdout?.toString() || e.message}`,
    );
  }
});

check("root/sdk versions in sync", () => {
  try {
    execFileSync("bun", ["scripts/sync-versions.ts", "--check"], {
      cwd: ROOT_DIR,
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (e: any) {
    assert.fail(
      `version sync check failed:\n${e.stderr?.toString() || e.message}`,
    );
  }
});

check("version is valid semver", () => {
  assert(
    /^\d+\.\d+\.\d+/.test(pkg.version),
    `version ${pkg.version} must be valid semver`,
  );
});

check("dist-tag matches release channel (prerelease→next, GA→latest)", () => {
  const tag = pkg.publishConfig?.tag;
  const isPrerelease = String(pkg.version).includes("-");
  if (isPrerelease) {
    assert(
      tag && tag !== "latest",
      `prerelease ${pkg.version} must NOT publish to 'latest' (tag=${tag}); use 'next'`,
    );
  } else {
    assert.strictEqual(
      tag,
      "latest",
      `GA ${pkg.version} should publish to 'latest' (tag=${tag})`,
    );
  }
});

// ── 3. Package Metadata ─────────────────────────────────────────────────────
console.log("\n📋 Package Metadata");
const requiredFields = [
  "name",
  "version",
  "description",
  "license",
  "main",
  "types",
  "files",
  "exports",
];
for (const field of requiredFields) {
  check(`"${field}" is set`, () => {
    assert(pkg[field] !== undefined, `Missing "${field}" in package.json`);
  });
}

check('"license" is Apache-2.0', () => {
  assert.strictEqual(
    pkg.license,
    "Apache-2.0",
    `Expected Apache-2.0, got ${pkg.license}`,
  );
});

check('"type" is "module"', () => {
  assert.strictEqual(pkg.type, "module", `Expected "module", got ${pkg.type}`);
});

check("README.md exists in package dir", () => {
  assert(
    existsSync(resolve(SDK_DIR, "README.md")),
    "README.md not found in packages/sdk/",
  );
});

// ── 4. Pack Contents ────────────────────────────────────────────────────────
console.log("\n📦 Pack Contents");
const packOutput = execFileSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: SDK_DIR,
  encoding: "utf8",
});
const packData = JSON.parse(packOutput);
const packFiles: { path: string; size: number }[] = packData[0].files;
const packFileNames = packFiles.map((f) => f.path);

check("no .ts source files in pack", () => {
  const tsFiles = packFileNames.filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && f !== "package.json",
  );
  assert.strictEqual(
    tsFiles.length,
    0,
    `Found .ts source files: ${tsFiles.join(", ")}`,
  );
});

check("no test files in pack", () => {
  const testFiles = packFileNames.filter(
    (f) => f.includes("test/") || f.includes(".test."),
  );
  assert.strictEqual(
    testFiles.length,
    0,
    `Found test files: ${testFiles.join(", ")}`,
  );
});

check("no generated source (.ts) in pack", () => {
  const genTs = packFileNames.filter(
    (f) =>
      f.includes("generated/") && f.endsWith(".ts") && !f.endsWith(".d.ts"),
  );
  assert.strictEqual(
    genTs.length,
    0,
    `Found generated .ts: ${genTs.join(", ")}`,
  );
});

check("no tools-manifest.json in pack", () => {
  const manifest = packFileNames.filter((f) => f.includes("tools-manifest"));
  assert.strictEqual(
    manifest.length,
    0,
    `Found manifest: ${manifest.join(", ")}`,
  );
});

check("dist/ files are present", () => {
  const distFiles = packFileNames.filter((f) => f.startsWith("dist/"));
  assert(distFiles.length > 0, "No dist/ files in pack");
});

// ── 5. Pack Size ────────────────────────────────────────────────────────────
console.log("\n📐 Pack Size");
const totalSize = packData[0].unpackedSize;
const totalKB = Math.round(totalSize / 1024);

// ~84 KB of that is the generated tool catalog (tool-definitions.js),
// legitimately shipped behind the /tools subpath; the rest is compiled
// src + .d.ts. 450 KB leaves headroom for codegen growth while still
// catching gross bloat (e.g. a dependency accidentally bundled in).
const PACK_LIMIT_KB = 450;
check(
  `pack size is reasonable (${totalKB} KB, limit: ${PACK_LIMIT_KB} KB)`,
  () => {
    assert(
      totalSize < PACK_LIMIT_KB * 1024,
      `Pack is ${totalKB} KB — too large for a library`,
    );
  },
);

const fileCount = packFiles.length;
check(`file count is reasonable (${fileCount} files, limit: 200)`, () => {
  assert(fileCount < 200, `${fileCount} files in pack — too many`);
});

// ── 6. Consumer Import ──────────────────────────────────────────────────────
console.log("\n🧪 Consumer Import");
let tempDir: string | null = null;

check("npm pack → install → import works", () => {
  // Pack
  // No shell redirections in exec strings (Windows-hostile); take the
  // last stdout line as the tarball name.
  const packOut = execFileSync("npm", ["pack"], {
    cwd: SDK_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  const tarball = packOut.split("\n").at(-1)!.trim();
  const tarballPath = resolve(SDK_DIR, tarball);
  cleanupPaths.push(tarballPath);

  // Create temp project
  tempDir = mkdtempSync(resolve(tmpdir(), "stitch-sdk-test-"));
  cleanupPaths.push(tempDir);
  execFileSync("npm", ["init", "-y"], { cwd: tempDir, stdio: "pipe" });
  execFileSync("npm", ["pkg", "set", "type=module"], {
    cwd: tempDir,
    stdio: "pipe",
  });

  // Install from tarball
  execFileSync("npm", ["install", tarballPath], {
    cwd: tempDir,
    stdio: "pipe",
  });

  // Test import — root barrel AND every subpath entry. The temp project
  // installs ONLY the tarball (no optional peers), so /tools must work
  // peer-free and /ai must throw a clean, actionable error (not a bare
  // ERR_MODULE_NOT_FOUND) when `ai` is absent.
  const testScript = `
    const sdk = await import("@google/stitch-sdk");
    const { Stitch, Project, Screen, StitchError } = sdk;

    if (typeof Stitch !== "function") throw new Error("Stitch class not exported");
    if (typeof Project !== "function") throw new Error("Project class not exported");
    if (typeof Screen !== "function") throw new Error("Screen class not exported");
    if (typeof StitchError !== "function") throw new Error("StitchError class not exported");
    if ("Generation" in sdk && typeof sdk.Generation !== "function") {
      throw new Error("Generation class not exported properly");
    }

    // /tools subpath: catalog must resolve without any optional peer.
    const tools = await import("@google/stitch-sdk/tools");
    if (!Array.isArray(tools.toolDefinitions) || tools.toolDefinitions.length === 0)
      throw new Error("toolDefinitions not exported from /tools");
    if (!(tools.toolMap instanceof Map)) throw new Error("toolMap not exported from /tools");

    // /ai and /adk: verify they either export stitchTools or throw the expected actionable peer error
    try {
      const ai = await import("@google/stitch-sdk/ai");
      if (typeof ai.stitchTools !== "function") throw new Error("stitchTools not exported from /ai");
    } catch (e) {
      const msg = String(e && e.message);
      const isExpectedError = msg.includes("npm install ai") || msg.includes("Cannot find package") || msg.includes("ERR_MODULE_NOT_FOUND");
      if (!isExpectedError) throw new Error("/ai threw unexpected error: " + msg);
    }

    try {
      const adk = await import("@google/stitch-sdk/adk");
      if (typeof adk.stitchTools !== "function") throw new Error("stitchTools not exported from /adk");
    } catch (e) {
      const msg = String(e && e.message);
      const isExpectedError = msg.includes("npm install @google/adk") || msg.includes("Cannot find package") || msg.includes("ERR_MODULE_NOT_FOUND");
      if (!isExpectedError) throw new Error("/adk threw unexpected error: " + msg);
    }

    console.log("All exports + subpaths verified ✓");
  `;

  writeFileSync(resolve(tempDir, "test.mjs"), testScript);

  execFileSync("node", ["test.mjs"], {
    cwd: tempDir,
    stdio: "pipe",
    env: { ...process.env, STITCH_API_KEY: "test-key-for-import-check" },
  });

  // Clean up tarball
  rmSync(tarballPath, { force: true });
});

// Clean up temp dir
if (tempDir) {
  rmSync(tempDir, { recursive: true, force: true });
}

// ── 7. Unit Tests ───────────────────────────────────────────────────────────
console.log("\n🧪 Unit Tests");
check("vitest passes", () => {
  execFileSync("npx", ["vitest", "run"], { cwd: SDK_DIR, stdio: "pipe" });
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
if (failed === 0) {
  console.log(`\n✅ All ${passed} checks passed. Ready to publish.`);
} else {
  console.log(`\n💥 ${failed} check(s) failed, ${passed} passed.`);
  console.log("   Fix the issues above before publishing.");
  process.exit(1);
}
