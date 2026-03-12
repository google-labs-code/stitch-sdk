/**
 * Demonstrate direct screen retrieval using project.getScreen(screenId)
 * instead of listing all screens.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/retrieve-screen.ts
 */
import "./_require-key.js";
import { stitch } from "@google/stitch-sdk";

const projects = await stitch.projects();
if (projects.length === 0) {
  console.log("❌ No projects found.");
  process.exit(1);
}
const project = projects[0];

console.log(`🎨 Generating a screen in project ${project.id}...`);
const generatedScreen = await project.generate("A simple primary button");
console.log(`✅ Screen generated. ID: ${generatedScreen.id}`);
console.log(`   Initial data name: ${generatedScreen.data?.name}`);

console.log(`\n🔍 Fetching screen directly via project.getScreen("${generatedScreen.id}")...`);
const retrievedScreen = await project.getScreen(generatedScreen.id);
console.log(`✅ Retrieved screen. ID: ${retrievedScreen.id}`);
console.log(`   Retrieved data name: ${retrievedScreen.data?.name}`);

if (generatedScreen.id === retrievedScreen.id) {
  console.log("\n✅ Success! Directly retrieved screen ID matches the generated screen.");
} else {
  console.log("\n❌ Mismatch in screen IDs.");
}
