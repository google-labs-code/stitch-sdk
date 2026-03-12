/**
 * Fetch a specific screen by ID using project.getScreen(id)
 * and log its properties.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/get-screen.ts
 */
import "./_require-key.js";
import { stitch } from "@google/stitch-sdk";

const projects = await stitch.projects();
if (projects.length === 0) {
  console.log("❌ No projects found.");
  process.exit(1);
}

const project = projects[0];
console.log(`📂 Using project: ${project.id}`);

console.log("🔍 Fetching screens in project...");
const screens = await project.screens();
if (screens.length === 0) {
  console.log("❌ No screens found in project. Please generate one first.");
  process.exit(1);
}

const firstScreenId = screens[0].id;
console.log(`✅ Found screens. Retrieving screen ${firstScreenId} directly...`);

const retrievedScreen = await project.getScreen(firstScreenId);

console.log("\n📱 Screen Details:");
console.log(`   Screen ID:  ${retrievedScreen.id}`);
console.log(`   Project ID: ${retrievedScreen.projectId}`);
console.log(`   Data Name:  ${retrievedScreen.data?.name}`);
console.log(`   HTML URL:   ${retrievedScreen.data?.htmlCode?.downloadUrl || "N/A"}`);
console.log(`   Image URL:  ${retrievedScreen.data?.screenshot?.downloadUrl || "N/A"}`);
