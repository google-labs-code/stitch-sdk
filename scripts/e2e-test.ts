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
 * E2E Package Test
 *
 * Tests the built package against the real Stitch API,
 * exactly as a consumer would use it (importing from dist/).
 *
 * Gated by STITCH_API_KEY — skips if not set.
 *
 * Usage: bun scripts/e2e-test.ts
 *   or:  STITCH_API_KEY=xxx bun scripts/e2e-test.ts
 */

// Gate on API key
if (!process.env.STITCH_API_KEY) {
  console.log("⏭️  STITCH_API_KEY not set. Skipping e2e tests.");
  process.exit(0);
}

// Import from built package — same as a consumer would
const { stitch, StitchError } = await import("../packages/sdk/dist/src/index.js");

let failures = 0;
let passed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ ${message}`);
    failures++;
  } else {
    console.log(`  ✓ ${message}`);
    passed++;
  }
}

console.log("🔑 STITCH_API_KEY found. Running e2e tests...\n");

try {
  // ── 1. List projects ────────────────────────────────────────
  console.log("📋 Listing projects...");
  const projects = await stitch.projects();
  assert(Array.isArray(projects), `Listed ${projects.length} projects`);

  // ── 2. Create project via callTool ────────────────────────────
  console.log("\n📦 Creating project via callTool...");
  const projectName = `E2E Test ${new Date().toISOString().slice(0, 16)}`;
  const createResult = await stitch.callTool("create_project", { title: projectName });
  const createdId = (createResult as any).name?.replace("projects/", "") ?? (createResult as any).projectId;
  assert(typeof createdId === "string" && createdId.length > 0, `Created project: ${createdId}`);

  // ── 3. Retrieve project by identity map ─────────────────────
  console.log("\n🔍 Retrieving project by identity map...");
  const project = stitch.project(createdId);
  assert(project.id === createdId, `Identity map handle matches: ${project.id}`);

  // Prove the handle works by listing screens (should be 0 on new project)
  const emptyScreens = await project.screens();
  assert(Array.isArray(emptyScreens) && emptyScreens.length === 0, "New project has 0 screens");

  // ── 4. Generate screen ──────────────────────────────────────
  console.log("\n🎨 Generating screen...");
  const screen = await project.generate(`
    A simple hello world page with centered text
  `);
  assert(screen !== null && screen !== undefined, "Generate returned a screen");
  assert(typeof screen.id === "string" && screen.id.length > 0, `Screen has ID: ${screen.id}`);

  // ── 5. Get HTML (cached path — data from generate) ──────────
  console.log("\n📄 Getting HTML (cached)...");
  const html = await screen.getHtml();
  assert(
    typeof html === "string" && html.length > 0,
    `Got HTML (${html.length} chars)`
  );

  // ── 6. Get Image (cached path — data from generate) ─────────
  console.log("\n🖼️  Getting image (cached)...");
  const imageUrl = await screen.getImage();
  assert(
    typeof imageUrl === "string" && imageUrl.length > 0,
    `Got image URL (${imageUrl.slice(0, 60)}...)`
  );

  // ── 7. Edit screen ─────────────────────────────────────────
  console.log("\n✏️  Editing screen...");
  const edited = await screen.edit("Make the background dark and add a subtitle");
  assert(edited !== null && edited !== undefined, "Edit returned a screen");
  assert(typeof edited.id === "string" && edited.id.length > 0, `Edited screen has ID: ${edited.id}`);

  const editedHtml = await edited.getHtml();
  assert(
    typeof editedHtml === "string" && editedHtml.length > 0,
    `Edited screen has HTML (${editedHtml.length} chars)`
  );

  // ── 8. Generate variants ────────────────────────────────────
  console.log("\n🎭 Generating variants...");
  const variants = await screen.variants("Try different color schemes", { variantCount: 2 });
  assert(Array.isArray(variants), `Got ${variants.length} variant(s)`);
  assert(variants.length > 0, "At least 1 variant returned");

  if (variants.length > 0) {
    const variant = variants[0];
    assert(typeof variant.id === "string" && variant.id.length > 0, `Variant has ID: ${variant.id}`);

    const variantHtml = await variant.getHtml();
    assert(
      typeof variantHtml === "string" && variantHtml.length > 0,
      `Variant has HTML (${variantHtml.length} chars)`
    );
  }

  // ── 7. Non-cached path — list existing project's screens ────
  console.log("\n🔄 Testing non-cached screen data (get_screen API fallback)...");
  if (projects.length > 0) {
    // Pick the first project that already has screens
    let foundExistingScreen = false;
    for (const existingProject of projects.slice(0, 3)) {
      const existingScreens = await existingProject.screens();
      if (existingScreens.length > 0) {
        const existingScreen = existingScreens[0];
        assert(typeof existingScreen.id === "string", `Existing screen has ID: ${existingScreen.id}`);

        // This screen came from list_screens — no cached htmlCode/screenshot
        // getHtml/getImage MUST call get_screen API
        const existingHtml = await existingScreen.getHtml();
        assert(
          typeof existingHtml === "string" && existingHtml.length > 0,
          `Got HTML from existing screen via API (${existingHtml.length} chars)`
        );

        const existingImage = await existingScreen.getImage();
        assert(
          typeof existingImage === "string" && existingImage.length > 0,
          `Got image from existing screen via API (${existingImage.slice(0, 60)}...)`
        );

        foundExistingScreen = true;
        break;
      }
    }
    if (!foundExistingScreen) {
      console.log("    ⚠ No existing project with screens found — skipping non-cached path test");
    }
  }

  // ── 8. Error handling ───────────────────────────────────────
  console.log("\n💥 Testing error handling...");
  try {
    const badProject = stitch.project("nonexistent-project-id");
    await badProject.screens();
    assert(false, "StitchError thrown for bad project ID");
  } catch (e) {
    assert(e instanceof StitchError, `StitchError thrown for bad project ID (code: ${(e as any).code})`);
  }
} catch (err) {
  console.error(`\n💥 Unexpected error: ${err}`);
  if (err instanceof Error) console.error(err.stack);
  process.exit(1);
}

// ── Summary ─────────────────────────────────────────────────
console.log("");
if (failures > 0) {
  console.error(`💥 ${failures} e2e check(s) failed, ${passed} passed.`);
  process.exit(1);
} else {
  console.log(`✅ All ${passed} e2e checks passed.\n`);
}
