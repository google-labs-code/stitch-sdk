#!/usr/bin/env bun
/**
 * Validate Generated SDK
 * 
 * Reads stitch-sdk.lock and verifies that all generated artifacts
 * are consistent with their source inputs. Run in CI to prevent
 * publishing stale code.
 * 
 * Usage: bun scripts/validate-generated.ts
 */

import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const ROOT_DIR = resolve(import.meta.dir, "..");
const GENERATED_DIR_BASE = resolve(ROOT_DIR, "packages/sdk/generated");
const MANIFEST_PATH = resolve(GENERATED_DIR_BASE, "tools-manifest.json");
const DOMAIN_MAP_PATH = resolve(GENERATED_DIR_BASE, "domain-map.json");
const GENERATED_DIR = resolve(GENERATED_DIR_BASE, "src");
const LOCK_PATH = resolve(GENERATED_DIR_BASE, "stitch-sdk.lock");

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function hashDirectory(dir: string): string {
  if (!existsSync(dir)) return sha256("");
  const hash = createHash("sha256");
  const files = getAllFiles(dir).sort();
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(file));
  }
  return hash.digest("hex");
}

function getAllFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

let failures = 0;

function check(condition: boolean, message: string, hint?: string) {
  if (!condition) {
    console.error(`  ✗ ${message}`);
    if (hint) console.error(`    → ${hint}`);
    failures++;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function main() {
  console.log("\n🔍 Validating generated SDK...\n");

  // Check required files exist
  check(existsSync(LOCK_PATH), "stitch-sdk.lock exists", "Run: bun scripts/capture-tools.ts");
  check(existsSync(MANIFEST_PATH), "tools-manifest.json exists", "Run: bun scripts/capture-tools.ts");
  check(existsSync(DOMAIN_MAP_PATH), "domain-map.json exists", "Create domain-map.json manually or via agent");
  check(existsSync(GENERATED_DIR), "generated/ directory exists", "Run: bun scripts/generate-sdk.ts");

  if (failures > 0) {
    console.error(`\n💥 ${failures} check(s) failed. Cannot continue validation.`);
    process.exit(1);
  }

  // Read lockfile
  const lock = JSON.parse(readFileSync(LOCK_PATH, "utf-8"));

  check(lock.schemaVersion === 1, `Lock schema version is 1 (got ${lock.schemaVersion})`);
  check(!!lock.manifest, "Lock has manifest section", "Run: bun scripts/capture-tools.ts");
  check(!!lock.generated, "Lock has generated section", "Run: bun scripts/generate-sdk.ts");

  if (!lock.manifest || !lock.generated) {
    console.error(`\n💥 Missing lock sections. Cannot continue.`);
    process.exit(1);
  }

  // Verify manifest hash
  const manifestContent = readFileSync(MANIFEST_PATH, "utf-8");
  const currentManifestHash = `sha256:${sha256(manifestContent)}`;
  check(
    lock.manifest.sourceHash === currentManifestHash,
    "Manifest hash matches lock",
    `Lock: ${lock.manifest.sourceHash}\n      Disk: ${currentManifestHash}\n      Fix: bun scripts/capture-tools.ts`
  );

  // Verify domain-map hash
  const domainMapContent = readFileSync(DOMAIN_MAP_PATH, "utf-8");
  const currentDomainMapHash = `sha256:${sha256(domainMapContent)}`;
  if (lock.domainMap) {
    check(
      lock.domainMap.sourceHash === currentDomainMapHash,
      "Domain map hash matches lock",
      `Lock: ${lock.domainMap.sourceHash}\n      Disk: ${currentDomainMapHash}\n      Fix: bun scripts/generate-sdk.ts`
    );
  }

  // Verify generated code used current inputs
  check(
    lock.generated.manifestHash === currentManifestHash,
    "Generated code used current manifest",
    `Generated from: ${lock.generated.manifestHash}\n      Current:        ${currentManifestHash}\n      Fix: bun scripts/generate-sdk.ts`
  );

  check(
    lock.generated.domainMapHash === currentDomainMapHash,
    "Generated code used current domain map",
    `Generated from: ${lock.generated.domainMapHash}\n      Current:        ${currentDomainMapHash}\n      Fix: bun scripts/generate-sdk.ts`
  );

  // Verify generated directory hash
  const currentGeneratedHash = `sha256:${hashDirectory(GENERATED_DIR)}`;
  check(
    lock.generated.sourceHash === currentGeneratedHash,
    "Generated files haven't been manually modified",
    `Lock: ${lock.generated.sourceHash}\n      Disk: ${currentGeneratedHash}\n      Fix: bun scripts/generate-sdk.ts`
  );

  // Summary
  console.log("");
  if (failures > 0) {
    console.error(`💥 ${failures} validation check(s) failed.`);
    console.error(`   The generated SDK is out of sync with its inputs.`);
    console.error(`   Re-run the pipeline: bun scripts/generate-sdk.ts`);
    process.exit(1);
  } else {
    console.log(`✅ All validation checks passed.`);
    console.log(`   Manifest: ${lock.manifest.toolCount} tools (captured ${lock.manifest.capturedAt})`);
    console.log(`   Generated: ${lock.generated.fileCount} files (${lock.generated.generatedAt})\n`);
  }
}

main().catch((err) => {
  console.error("❌ Validation error:", err);
  process.exit(1);
});
