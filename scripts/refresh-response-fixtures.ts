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
 * Refresh READ-ONLY response fixtures from the live Stitch API
 * [V1_PLAN §1.7 — server-drift early warning].
 *
 * Re-records list/get tool responses into test/fixtures/responses/ and
 * prints a diff summary. A non-empty diff after a server deploy is the
 * early-warning signal that response shapes moved.
 *
 * Generative fixtures (generate/edit/variants/apply) are EXPENSIVE and
 * are NOT refreshed here — curate those manually from e2e transcripts.
 *
 * Usage: STITCH_API_KEY=... bun scripts/refresh-response-fixtures.ts <projectId> [screenId]
 */

import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { StitchToolClient } from "../packages/sdk/src/client.js";

const FIXTURES = resolve(
  import.meta.dir,
  "../packages/sdk/test/fixtures/responses",
);

const projectId = process.argv[2];
if (!process.env.STITCH_API_KEY || !projectId) {
  console.error(
    "Usage: STITCH_API_KEY=... bun scripts/refresh-response-fixtures.ts <projectId> [screenId]",
  );
  process.exit(1);
}
const screenId = process.argv[3];

/** Replace volatile values so fixtures diff cleanly across runs. */
function sanitize(value: any): any {
  const json = JSON.stringify(value)
    .replaceAll(projectId!, "p-fix")
    .replace(
      /"downloadUrl":"[^"]+"/g,
      '"downloadUrl":"https://files.example/sanitized"',
    )
    .replace(/"sessionId":"[^"]+"/g, '"sessionId":"sess-1"');
  return JSON.parse(json);
}

async function record(tool: string, args: Record<string, any>) {
  const result = await client.callTool(tool, args);
  const path = resolve(FIXTURES, `${tool}.json`);
  const next = JSON.stringify(sanitize(result), null, 2) + "\n";
  let prev = "";
  try {
    prev = readFileSync(path, "utf-8");
  } catch {
    /* file does not exist yet */
  }
  writeFileSync(path, next);
  console.log(
    prev === next
      ? `  = ${tool} (unchanged)`
      : `  ✱ ${tool} (UPDATED — review the diff: response shape may have moved)`,
  );
}

const client = new StitchToolClient();

console.log(`🔄 Refreshing read-only fixtures from project ${projectId}...`);
await record("list_projects", {});
await record("list_screens", { projectId });
await record("list_design_systems", { projectId });
if (screenId) {
  await record("get_screen", {
    projectId,
    screenId,
    name: `projects/${projectId}/screens/${screenId}`,
  });
} else {
  console.log("  - get_screen skipped (pass a screenId to record it)");
}
await client.close();
console.log(
  "✅ Done. Inspect `git diff packages/sdk/test/fixtures/responses`.",
);
