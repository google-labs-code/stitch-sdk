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
 * Sync the root workspace version to match packages/sdk.
 *
 * packages/sdk/package.json is the source of truth for the version
 * (it is the published artifact). The private root package mirrors it
 * so tags and tooling agree.
 *
 * Usage: bun scripts/sync-versions.ts [--check]
 *   --check  exit 1 if out of sync instead of writing
 */

import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

const ROOT_DIR = resolve(import.meta.dir, "..");
const ROOT_PKG = resolve(ROOT_DIR, "package.json");
const SDK_PKG = resolve(ROOT_DIR, "packages/sdk/package.json");

const checkOnly = process.argv.includes("--check");

const sdkVersion = JSON.parse(readFileSync(SDK_PKG, "utf-8")).version;
const rootRaw = readFileSync(ROOT_PKG, "utf-8");
const rootPkg = JSON.parse(rootRaw);

if (rootPkg.version === sdkVersion) {
  console.log(`✅ Versions in sync: ${sdkVersion}`);
  process.exit(0);
}

if (checkOnly) {
  console.error(
    `✗ Version mismatch: root ${rootPkg.version} != sdk ${sdkVersion}. ` +
      `Run: bun scripts/sync-versions.ts`,
  );
  process.exit(1);
}

rootPkg.version = sdkVersion;
writeFileSync(ROOT_PKG, JSON.stringify(rootPkg, null, 2) + "\n");
console.log(`🔄 Root version ${rootPkg.version} → ${sdkVersion} (synced)`);
