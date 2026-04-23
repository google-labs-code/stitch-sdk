/**
 * Browse and Export Script
 *
 * Demonstrates listing projects and screens, then downloading the HTML and
 * screenshot image artifacts for a screen.
 *
 * Run with: STITCH_API_KEY=your-key bun index.ts
 */

import { stitch } from "@google/stitch-sdk";
import fs from "fs/promises";
import path from "path";

// Verify API key is set
if (!process.env.STITCH_API_KEY) {
  console.error("Error: STITCH_API_KEY environment variable is required.");
  process.exit(1);
}

async function main() {
  console.log("🔍 Fetching projects...");
  const projects = await stitch.projects();

  if (projects.length === 0) {
    console.log("📭 No projects found.");
    return;
  }

  console.log(`✅ Found ${projects.length} project(s).\n`);

  let targetScreen = null;

  // Browse projects to find one with screens
  for (const project of projects) {
    console.log(`📁 Project: ${project.id}`);
    const screens = await project.screens();

    if (screens.length > 0) {
      console.log(`  📱 Found ${screens.length} screen(s).`);
      if (!targetScreen) {
          targetScreen = screens[0];
      }
    } else {
        console.log("  📭 No screens in this project.");
    }
  }

  if (!targetScreen) {
      console.log("\nNo screens found across any projects to export.");
      return;
  }

  console.log(`\n📥 Exporting artifacts for screen ${targetScreen.id}...`);

  const outDir = path.join(process.cwd(), "out");
  await fs.mkdir(outDir, { recursive: true });

  try {
    // Download HTML
    console.log("Fetching HTML URL...");
    const htmlUrl = await targetScreen.getHtml();
    if (htmlUrl) {
      console.log(`Downloading HTML from ${htmlUrl.slice(0, 50)}...`);
      const htmlResponse = await fetch(htmlUrl);
      if (!htmlResponse.ok) throw new Error(`HTML fetch failed: ${htmlResponse.statusText}`);
      const htmlCode = await htmlResponse.text();
      const htmlPath = path.join(outDir, `${targetScreen.id}.html`);
      await fs.writeFile(htmlPath, htmlCode);
      console.log(`✅ Saved HTML to ${htmlPath}`);
    } else {
      console.log("⚠️ No HTML URL available for this screen.");
    }

    // Download Image
    console.log("Fetching Image URL...");
    const imageUrl = await targetScreen.getImage();
    if (imageUrl) {
      console.log(`Downloading Image from ${imageUrl.slice(0, 50)}...`);
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) throw new Error(`Image fetch failed: ${imageResponse.statusText}`);
      const imageBuffer = await imageResponse.arrayBuffer();
      const imagePath = path.join(outDir, `${targetScreen.id}.jpeg`);
      await fs.writeFile(imagePath, Buffer.from(imageBuffer));
      console.log(`✅ Saved Image to ${imagePath}`);
    } else {
      console.log("⚠️ No Image URL available for this screen.");
    }
  } catch (error) {
    console.error("Failed to download artifacts:", error);
  }
}

main().catch(console.error);
