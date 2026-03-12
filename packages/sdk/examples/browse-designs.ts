/**
 * List all projects the user has, then for each project list its screens
 * and log their HTML and Image URLs.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/browse-designs.ts
 */
import "./_require-key.js";
import { stitch } from "@google/stitch-sdk";

console.log("🔍 Fetching projects...");

const projects = await stitch.projects();

if (projects.length === 0) {
  console.log("📭 No projects found.");
  process.exit(0);
}

console.log(`✅ Found ${projects.length} project(s).\n`);

for (const project of projects) {
  console.log(`📁 Project: ${project.id}`);

  const screens = await project.screens();
  if (screens.length === 0) {
    console.log("  📭 No screens in this project.");
    continue;
  }

  for (const screen of screens) {
    console.log(`  📱 Screen: ${screen.id}`);

    try {
      const htmlUrl = await screen.getHtml();
      const imageUrl = await screen.getImage();
      console.log(`     📄 HTML:  ${htmlUrl || "(No HTML available)"}`);
      console.log(`     🖼️  Image: ${imageUrl || "(No Image available)"}`);
    } catch (e: any) {
      console.log(`     ❌ Error fetching URLs: ${e.message}`);
    }
  }

  console.log(); // blank line
}
