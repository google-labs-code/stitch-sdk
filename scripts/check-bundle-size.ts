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
 * Bundle-size gate [V1_PLAN §3.8].
 *
 * Bundles the ROOT entry (externals excluded) and fails if it regresses
 * past the budget. Guards specifically against the tool-definitions
 * JSON (~2K lines) leaking back into the root graph — it belongs only
 * behind the /tools, /ai, and /adk subpaths.
 */

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const ROOT_DIR = resolve(import.meta.dir, "..");
const ENTRY = resolve(ROOT_DIR, "packages/sdk/dist/src/index.js");
const TOOLS = resolve(ROOT_DIR, "packages/sdk/dist/src/tools.js");
// Headroom over the real ~31 KB core. The newline-free probe below is the
// primary leak guard; this budget is only a coarse backstop. Raise
// CONSCIOUSLY, in a reviewed diff.
const BUDGET_KB = 80;

const tmpDir = mkdtempSync(join(tmpdir(), "stitch-bundle-check-"));
try {
  const rootConsumer = join(tmpDir, "root-consumer.js");
  writeFileSync(
    rootConsumer,
    `import { stitch } from ${JSON.stringify(ENTRY)}; console.log(stitch);`,
  );

  const result = await Bun.build({
    entrypoints: [rootConsumer],
    target: "node",
    minify: true,
    external: [
      "@modelcontextprotocol/sdk",
      "cheerio",
      "zod",
      "ai",
      "@google/adk",
      "@google/genai",
    ],
  });

  if (!result.success) {
    console.error("❌ Bundle failed:", result.logs.join("\n"));
    process.exit(1);
  }

  const bytes = result.outputs[0]
    ? (await result.outputs[0].arrayBuffer()).byteLength
    : 0;
  const kb = Math.round(bytes / 1024);
  console.log(`📦 Root entry bundle: ${kb} KB (budget ${BUDGET_KB} KB)`);

  const text = await result.outputs[0].text();

  // Catalog-leak probe: a substring of the longest tool description, which
  // exists ONLY in tool-definitions.ts. It MUST be newline-free — minified
  // output stores a description's "\n" as the escaped two-char "\\n", so a
  // probe spanning a newline can never match (the bug this gate previously
  // shipped: it false-passed on every real leak).
  const manifest = JSON.parse(
    await Bun.file(
      resolve(ROOT_DIR, "packages/sdk/generated/tools-manifest.json"),
    ).text(),
  );
  const longestDescription: string = manifest
    .map((t: any) => t.description ?? "")
    .sort((a: string, b: string) => b.length - a.length)[0];
  const probe = longestDescription
    .split("\n")
    .map((l: string) => l.trim())
    .sort((a: string, b: string) => b.length - a.length)[0]
    .slice(0, 50);

  if (probe.length < 30) {
    console.error(
      `❌ Catalog-leak probe too short (${probe.length} chars) to be reliable.`,
    );
    process.exit(1);
  }

  // Self-validation: the probe MUST match a bundle that genuinely contains
  // the catalog (the /tools subpath). If it doesn't, the probe is broken and
  // the root check below is meaningless — fail loudly rather than false-pass.
  const toolsConsumer = join(tmpDir, "tools-consumer.js");
  writeFileSync(
    toolsConsumer,
    `import * as tools from ${JSON.stringify(TOOLS)}; console.log(tools);`,
  );
  const toolsBundle = await Bun.build({
    entrypoints: [toolsConsumer],
    target: "node",
    minify: true,
    external: [
      "@modelcontextprotocol/sdk",
      "cheerio",
      "zod",
      "ai",
      "@google/adk",
      "@google/genai",
    ],
  });
  const toolsText = toolsBundle.success
    ? await toolsBundle.outputs[0].text()
    : "";
  if (!toolsText.includes(probe)) {
    console.error(
      "❌ Catalog-leak probe did not match the /tools bundle (which DOES " +
        "contain the catalog). The probe is broken — fix it before trusting this gate.",
    );
    process.exit(1);
  }

  if (text.includes(probe)) {
    console.error(
      "❌ tool-definitions JSON detected in the ROOT bundle. " +
        "It must stay behind the /tools, /ai, /adk subpaths.",
    );
    process.exit(1);
  }

  if (kb > BUDGET_KB) {
    console.error(`❌ Root bundle ${kb} KB exceeds budget ${BUDGET_KB} KB.`);
    process.exit(1);
  }
  console.log(
    "✅ Bundle within budget; catalog-leak probe validated against /tools and absent from root.",
  );
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
