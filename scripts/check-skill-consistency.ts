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
 * Skill ↔ IR consistency check [V1_PLAN §1.6].
 *
 * Stage 2 of the pipeline is executed by an agent whose ONLY spec is
 * the stitch-sdk-domain-design skill. A stale skill is a broken
 * compiler spec: the agent will confidently author IR that the strict
 * schema rejects (or worse, that means something else).
 *
 * This check enforces, in CI:
 *   1. every live IR field is mentioned in the skill
 *   2. removed/never-implemented fields are NOT mentioned
 *   3. the token lists below stay true to ir-schema.ts (behaviorally
 *      verified with safeParse probes, so the lists cannot drift)
 */

import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import {
  ProjectionStep,
  ArgSpec,
  DomainClassConfig,
  CacheSpec,
} from "./ir-schema.js";

const SKILL_PATH = resolve(
  import.meta.dir,
  "../.agents/skills/stitch-sdk-domain-design/SKILL.md",
);

const skill = readFileSync(SKILL_PATH, "utf-8");

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ ${message}`);
    failures++;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

// ── 1. Live IR fields must be documented ────────────────────────────
const REQUIRED_TOKENS = [
  // ProjectionStep
  "prop",
  "index",
  "each",
  "find",
  "acknowledgeSingle",
  // ArgSpec variants + fields
  "self",
  "selfArray",
  "param",
  "computed",
  "optional",
  "rename",
  "default",
  "template",
  // Class config
  "constructorParams",
  "reference",
  "parentField",
  "factories",
  "sideEffects",
  "extensionPath",
  "isRoot",
  // Binding / returns / cache
  "projection",
  "cache",
  "options",
];

console.log("📖 Skill documents every live IR field:");
for (const token of REQUIRED_TOKENS) {
  check(skill.includes(token), `mentions "${token}"`);
}

// ── 2. Dead features must NOT be documented ─────────────────────────
const BANNED_TOKENS = ["fieldMapping", "idField", "stripPrefix", "splitOn"];

console.log("\n🚫 Skill omits removed/never-implemented features:");
for (const token of BANNED_TOKENS) {
  check(!skill.includes(token), `does not mention "${token}"`);
}

// ── 3. Token lists are behaviorally true to ir-schema.ts ────────────
// If the schema changes and these probes flip, this script fails and
// forces both the lists above and the skill to be revisited.
console.log("\n🧪 Token lists match schema behavior:");
check(
  ProjectionStep.safeParse({ prop: "x", acknowledgeSingle: true }).success,
  "acknowledgeSingle is a live ProjectionStep field",
);
check(
  !ProjectionStep.safeParse({ prop: "x", fallback: "y" }).success,
  "fallback is rejected by ProjectionStep",
);
check(
  ArgSpec.safeParse({ from: "param", optional: true, default: "D" }).success,
  "param default is live",
);
check(
  !DomainClassConfig.safeParse({
    description: "d",
    constructorParams: [],
    fieldMapping: {},
  }).success,
  "fieldMapping is rejected by DomainClassConfig",
);
check(
  !DomainClassConfig.safeParse({
    description: "d",
    constructorParams: [],
    idField: "id",
  }).success,
  "idField is rejected by DomainClassConfig",
);
check(
  !CacheSpec.safeParse({
    projection: [{ prop: "x", each: true }],
    description: "d",
  }).success,
  "cache projections reject 'each'",
);

// ── 4. ALL doc-bearing skills must omit removed/renamed 1.0 API ─────
// The review found the consistency gate only checked ONE skill; this
// scans every skill + the README for stale-API tokens that the 1.0
// surface removed or renamed, so a doc regression of those fails CI.
// (Compile coverage of the actual API lives in check:examples and
// check:consumer-types; this catches prose/signature drift.)
const DOC_FILES = [
  "../.agents/skills/stitch-sdk-domain-design/SKILL.md",
  "../.agents/skills/stitch-sdk-usage/SKILL.md",
  "../.agents/skills/stitch-sdk-development/SKILL.md",
  "../packages/sdk/README.md",
].map((p) => resolve(import.meta.dir, p));

// token → why it's banned on the 1.0 surface
const STALE_API_TOKENS: Record<string, string> = {
  uploadImage: "renamed to upload()",
  "stitch.toolMap": "toolMap moved to the @google/stitch-sdk/tools subpath",
  "result.project?.projectId": "CreateProjectResponse is flat (use name)",
  // The POSITIONAL form `(prompt, deviceType?, modelId?)` ends in `modelId?)`;
  // the correct options form ends `modelId? }`, so this discriminates.
  "modelId?)": "optional params moved into a trailing options object",
};

console.log("\n🚫 All skills + README omit removed/renamed 1.0 API:");
for (const file of DOC_FILES) {
  const text = readFileSync(file, "utf-8");
  const name = file.split("/").slice(-2).join("/");
  for (const [token, why] of Object.entries(STALE_API_TOKENS)) {
    check(!text.includes(token), `${name} omits "${token}" (${why})`);
  }
}

console.log("");
if (failures > 0) {
  console.error(
    `💥 ${failures} consistency check(s) failed. ` +
      `Update the skill/README docs to match ir-schema.ts and the 1.0 API.`,
  );
  process.exit(1);
}
console.log("✅ Skills + README consistent with IR schema and the 1.0 API.");
