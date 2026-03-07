/**
 * Smoke test for @google/stitch-sdk packaging.
 * 
 * Verifies:
 * 1. dist/ output exists after build
 * 2. Generated pipeline artifacts are co-located in core/generated/
 * 3. Entry point (dist/src/index.js) is importable
 * 4. All public exports are present
 * 5. Internal exports are NOT leaked
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const CORE_DIR = resolve(process.cwd(), "core");
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
  assert(existsSync(resolve(DIST_DIR, "src/proxy")), "dist/src/proxy/ directory exists");

  // ── 2. Verify generated pipeline artifacts ────────────────────
  console.log("\n📂 Checking generated pipeline artifacts...");
  assert(existsSync(resolve(GENERATED_DIR, "stitch-sdk.lock")), "core/generated/stitch-sdk.lock exists");
  assert(existsSync(resolve(GENERATED_DIR, "tools-manifest.json")), "core/generated/tools-manifest.json exists");
  assert(existsSync(resolve(GENERATED_DIR, "domain-map.json")), "core/generated/domain-map.json exists");
  assert(existsSync(resolve(GENERATED_DIR, "src/stitch.ts")), "core/generated/src/stitch.ts exists");
  assert(existsSync(resolve(GENERATED_DIR, "src/project.ts")), "core/generated/src/project.ts exists");
  assert(existsSync(resolve(GENERATED_DIR, "src/screen.ts")), "core/generated/src/screen.ts exists");
  assert(existsSync(resolve(GENERATED_DIR, "src/index.ts")), "core/generated/src/index.ts exists");

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
