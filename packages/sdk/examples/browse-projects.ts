/**
 * List all projects using stitch.projects() and log their IDs and screen counts.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/browse-projects.ts
 */
import "./_require-key.js";
import { stitch } from "@google/stitch-sdk";

console.log("🔍 Fetching your Stitch projects...\n");

try {
  const projects = await stitch.projects();

  if (projects.length === 0) {
    console.log("📭 No projects found.");
    process.exit(0);
  }

  console.log(`✅ Found ${projects.length} project(s):`);

  for (const project of projects) {
    const screens = await project.screens();

    console.log(`\n📁 Project: ${project.id}`);
    console.log(`   📱 Screens: ${screens.length}`);
  }

} catch (e: any) {
  console.error("\n❌ Failed to fetch projects:");
  console.error(e.message);
}
