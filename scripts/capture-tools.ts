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
import { initializeStitchConnection } from "../packages/sdk/src/proxy/client.js";
import type { ProxyContext } from "../packages/sdk/src/proxy/client.js";

const ROOT_DIR = resolve(import.meta.dir, "..");
const MANIFEST_PATH = resolve(ROOT_DIR, "packages/sdk/generated/tools-manifest.json");
const LOCK_PATH = resolve(ROOT_DIR, "packages/sdk/generated/stitch-sdk.lock");

async function main() {
  const apiKey = process.env.STITCH_API_KEY;
  if (!apiKey) {
    console.error("❌ STITCH_API_KEY environment variable is required.");
    process.exit(1);
  }

  const baseUrl = process.env.STITCH_MCP_URL || "https://stitch.googleapis.com/mcp";

  console.log(`🔌 Connecting to ${baseUrl}...`);

  const ctx: ProxyContext = {
    config: {
      apiKey,
      url: baseUrl,
      name: "stitch-sdk-capture",
      version: "1.0.0",
    },
    remoteTools: [],
  };

  await initializeStitchConnection(ctx);

  const tools = ctx.remoteTools;
  console.log(`📋 Discovered ${tools.length} tools:`);
  for (const tool of tools) {
    console.log(`   - ${tool.name}: ${tool.description?.slice(0, 60)}...`);
  }

  // Write tools-manifest.json
  const manifestContent = JSON.stringify(tools, null, 2) + "\n";
  await Bun.write(MANIFEST_PATH, manifestContent);
  console.log(`\n📦 Wrote ${MANIFEST_PATH}`);

  // Update stitch-sdk.lock
  const manifestHash = createHash("sha256").update(manifestContent).digest("hex");
  let lock: any = {};
  try {
    lock = JSON.parse(await Bun.file(LOCK_PATH).text());
  } catch {
    lock = { schemaVersion: 1 };
  }

  lock.schemaVersion = lock.schemaVersion || 1;
  lock.manifest = {
    capturedAt: new Date().toISOString(),
    sourceHash: `sha256:${manifestHash}`,
    toolCount: tools.length,
    serverUrl: baseUrl,
  };

  await Bun.write(LOCK_PATH, JSON.stringify(lock, null, 2) + "\n");
  console.log(`🔒 Updated ${LOCK_PATH} (manifest section)`);
  console.log(`\n✅ Stage 1 complete. Run Stage 2 (agent) to produce domain-map.json.`);
}

main().catch((err) => {
  console.error("❌ Capture failed:", err);
  process.exit(1);
});
