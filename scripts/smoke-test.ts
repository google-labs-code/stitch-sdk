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
 * Smoke test for @google/stitch-sdk packaging.
 * 
 * Verifies:
 * 1. dist/ output exists after build
 * 2. Generated pipeline artifacts are co-located in packages/sdk/generated/
 * 3. Entry point (dist/src/index.js) is importable
 * 4. All public exports are present
 * 5. Internal exports are NOT leaked
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const CORE_DIR = resolve(process.cwd(), "packages/sdk");
const DIST_DIR = resolve(CORE_DIR, "dist");
const GENERATED_DIR = resolve(CORE_DIR, "generated");

let failures = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ ${message}`);
    failures++;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function main() {
  // ── 1. Verify dist output exists ──────────────────────────────
  console.log("\n📦 Checking build output...");
  assert(existsSync(resolve(DIST_DIR, "src/index.js")), "dist/src/index.js exists");
  assert(existsSync(resolve(DIST_DIR, "src/index.d.ts")), "dist/src/index.d.ts exists");
  assert(existsSync(resolve(DIST_DIR, "src/client.js")), "dist/src/client.js exists");
  assert(existsSync(resolve(DIST_DIR, "src/singleton.js")), "dist/src/singleton.js exists");
  assert(existsSync(resolve(DIST_DIR, "src/version.js")), "dist/src/version.js exists (build-time generated)");
  assert(existsSync(resolve(DIST_DIR, "src/proxy")), "dist/src/proxy/ directory exists");

  // Verify version.ts was generated and matches package.json
  const srcVersion = resolve(CORE_DIR, "src/version.ts");
  assert(existsSync(srcVersion), "src/version.ts exists (build-time generated)");
  const pkg = JSON.parse(readFileSync(resolve(CORE_DIR, "package.json"), "utf8"));
  const versionContent = readFileSync(srcVersion, "utf8");
  assert(
    versionContent.includes(`'${pkg.version}'`),
    `src/version.ts contains version '${pkg.version}' matching package.json`,
  );

  // ── 2. Verify generated pipeline artifacts ────────────────────
  console.log("\n📂 Checking generated pipeline artifacts...");
  assert(existsSync(resolve(GENERATED_DIR, "stitch-sdk.lock")), "packages/sdk/generated/stitch-sdk.lock exists");
  assert(existsSync(resolve(GENERATED_DIR, "tools-manifest.json")), "packages/sdk/generated/tools-manifest.json exists");
  assert(existsSync(resolve(GENERATED_DIR, "domain-map.json")), "packages/sdk/generated/domain-map.json exists");
  assert(existsSync(resolve(GENERATED_DIR, "src/stitch.ts")), "packages/sdk/generated/src/stitch.ts exists");
  assert(existsSync(resolve(GENERATED_DIR, "src/project.ts")), "packages/sdk/generated/src/project.ts exists");
  assert(existsSync(resolve(GENERATED_DIR, "src/screen.ts")), "packages/sdk/generated/src/screen.ts exists");
  assert(existsSync(resolve(GENERATED_DIR, "src/index.ts")), "packages/sdk/generated/src/index.ts exists");

  // ── 3. Verify compiled generated output ───────────────────────
  console.log("\n🔧 Checking compiled generated output...");
  assert(existsSync(resolve(DIST_DIR, "generated/src/index.js")), "dist/generated/src/index.js exists");
  assert(existsSync(resolve(DIST_DIR, "generated/src/stitch.js")), "dist/generated/src/stitch.js exists");
  assert(existsSync(resolve(DIST_DIR, "generated/src/project.js")), "dist/generated/src/project.js exists");
  assert(existsSync(resolve(DIST_DIR, "generated/src/screen.js")), "dist/generated/src/screen.js exists");

  // ── 4. Dynamic import ─────────────────────────────────────────
  console.log("\n🔌 Importing package...");
  const sdk = await import(resolve(DIST_DIR, "src/index.js"));

  // ── 5. Verify public exports ──────────────────────────────────
  console.log("\n🔍 Checking public exports...");
  assert(typeof sdk.Stitch === "function", "Stitch class exported");
  assert(typeof sdk.StitchToolClient === "function", "StitchToolClient class exported");
  assert(typeof sdk.Screen === "function", "Screen class exported");
  assert(typeof sdk.Project === "function", "Project class exported");
  assert(typeof sdk.StitchProxy === "function", "StitchProxy class exported");
  assert(typeof sdk.stitch === "object", "stitch singleton exported");
  assert(typeof sdk.StitchErrorCode === "object", "StitchErrorCode exported");
  assert(typeof sdk.StitchError === "function", "StitchError class exported");

  // ── 6. Verify internal exports are NOT leaked ─────────────────
  console.log("\n🔒 Checking internal exports are hidden...");
  assert(sdk.ok === undefined, "ok() NOT exported (internal)");
  assert(sdk.fail === undefined, "fail() NOT exported (internal)");
  assert(sdk.failFromError === undefined, "failFromError() NOT exported (internal)");
  assert(sdk.StitchConfigSchema === undefined, "StitchConfigSchema NOT exported (internal)");
  assert(sdk.forwardToStitch === undefined, "forwardToStitch() NOT exported (internal)");
  assert(sdk.initializeStitchConnection === undefined, "initializeStitchConnection() NOT exported (internal)");
  assert(sdk.refreshTools === undefined, "refreshTools() NOT exported (internal)");

  // ── Summary ───────────────────────────────────────────────────
  console.log("");
  if (failures > 0) {
    console.error(`💥 ${failures} check(s) failed.`);
    process.exit(1);
  } else {
    console.log("✅ All smoke checks passed.\n");
  }
}

main();
