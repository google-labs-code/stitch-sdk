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
 * Stage 1: Capture Tools
 *
 * Connects to the Stitch MCP server, calls tools/list, and writes
 * the raw tool schemas to core/generated/tools-manifest.json.
 *
 * Updates the manifest section of core/generated/stitch-sdk.lock.
 *
 * Usage: bun scripts/capture-tools.ts
 * Requires: STITCH_API_KEY environment variable
 */

import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { writeFileSync, renameSync, existsSync } from "node:fs";
import { StitchToolClient } from "../packages/sdk/src/client.js";

const ROOT_DIR = resolve(import.meta.dir, "..");
const MANIFEST_PATH = resolve(
  ROOT_DIR,
  "packages/sdk/generated/tools-manifest.json",
);
const LOCK_PATH = resolve(ROOT_DIR, "packages/sdk/generated/stitch-sdk.lock");

async function main() {
  const apiKey = process.env.STITCH_API_KEY;
  if (!apiKey) {
    console.error("❌ STITCH_API_KEY environment variable is required.");
    process.exit(1);
  }

  const baseUrl =
    process.env.STITCH_BASE_URL ||
    process.env.STITCH_MCP_URL ||
    "https://stitch.googleapis.com/mcp";

  console.log(`🔌 Connecting to ${baseUrl}...`);

  // One MCP stack (D9): capture runs through the real StitchToolClient.
  // listToolsRaw() stores schemas exactly as served — the tools-manifest
  // is the pipeline's source of truth and must not be coupled to the
  // schema-repair heuristics (repair happens at load/serving time).
  const client = new StitchToolClient({ apiKey, baseUrl });
  await client.connect();
  const { tools } = await client.listToolsRaw();
  await client.close();
  console.log(`📋 Discovered ${tools.length} tools:`);
  for (const tool of tools) {
    console.log(`   - ${tool.name}: ${tool.description?.slice(0, 60)}...`);
  }

  const manifestContent = JSON.stringify(tools, null, 2) + "\n";
  const manifestHash = createHash("sha256")
    .update(manifestContent)
    .digest("hex");

  // Read the lock BEFORE writing anything. A corrupt lock is a pipeline
  // integrity failure — never silently reset it (that would discard the
  // generated/domainMap sections without warning).
  let lock: any = {};
  if (existsSync(LOCK_PATH)) {
    try {
      lock = JSON.parse(await Bun.file(LOCK_PATH).text());
    } catch (err) {
      console.error(
        `❌ stitch-sdk.lock exists but is not valid JSON: ${err}\n` +
          `   Inspect or delete ${LOCK_PATH} manually, then re-run.`,
      );
      process.exit(1);
    }
  } else {
    lock = { schemaVersion: 1 };
  }

  lock.schemaVersion = lock.schemaVersion || 1;
  lock.manifest = {
    capturedAt: new Date().toISOString(),
    sourceHash: `sha256:${manifestHash}`,
    toolCount: tools.length,
    serverUrl: baseUrl,
  };

  // Stage both files to .tmp, then rename. Each rename is individually
  // atomic; this is NOT a cross-file transaction, so an interrupt between
  // the two renames can leave manifest and lock momentarily out of sync —
  // validate-generated detects that (hash mismatch) and re-running capture
  // fixes it.
  const lockContent = JSON.stringify(lock, null, 2) + "\n";
  writeFileSync(`${MANIFEST_PATH}.tmp`, manifestContent);
  writeFileSync(`${LOCK_PATH}.tmp`, lockContent);
  renameSync(`${MANIFEST_PATH}.tmp`, MANIFEST_PATH);
  renameSync(`${LOCK_PATH}.tmp`, LOCK_PATH);
  console.log(`\n📦 Wrote ${MANIFEST_PATH}`);
  console.log(`🔒 Updated ${LOCK_PATH} (manifest section)`);
  console.log(
    `\n✅ Stage 1 complete. Run Stage 2 (agent) to produce domain-map.json.`,
  );
}

main().catch((err) => {
  console.error("❌ Capture failed:", err);
  process.exit(1);
});
