/**
 * Pick an existing screen and call screen.edit(),
 * then log the updated screen.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/edit-screen.ts
 */
import "./_require-key.js";
import { stitch } from "@google/stitch-sdk";

console.log("🔍 Fetching your projects to find a screen to edit...");

const projects = await stitch.projects();
if (projects.length === 0) {
  console.log("📭 No projects found. Run getting-started.ts first.");
  process.exit(0);
}

// Find the first screen available across all projects
let targetScreen = null;
let targetProject = null;

for (const project of projects) {
  const screens = await project.screens();
  if (screens.length > 0) {
    targetProject = project;
    targetScreen = screens[0];
    break;
  }
}

if (!targetScreen || !targetProject) {
  console.log("📭 No screens found in any project. Run getting-started.ts first.");
  process.exit(0);
}

console.log(`✅ Found screen ${targetScreen.id} in project ${targetProject.id}`);

const editPrompt = "Change the color scheme to dark mode";
console.log(`\n🎨 Editing screen with prompt: "${editPrompt}"...`);
console.log("   (This may take up to a minute)");

try {
  const editedScreen = await targetScreen.edit(editPrompt);
  console.log(`✅ Screen successfully edited: ${editedScreen.id}`);

  const originalHtml = await targetScreen.getHtml();
  const newHtml = await editedScreen.getHtml();

  console.log("\n✨ Output:");
  console.log(`📄 Original HTML: ${originalHtml}`);
  console.log(`📄 Edited HTML:   ${newHtml}`);
} catch (e: any) {
  console.error("❌ Failed to edit screen:");
  console.error(e.message);
}
