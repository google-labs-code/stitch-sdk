/**
 * Download HTML and screenshot artifacts from a screen.
 * Fetches HTML via getHtml() and image via getImage(), then saves them locally.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/download-artifacts.ts
 */
import "./_require-key.js";
import { stitch } from "@google/stitch-sdk";
import fs from "fs/promises";
import path from "path";

console.log("Listing projects...");
const projects = await stitch.projects();

if (projects.length === 0) {
  console.log("No projects found. Create a project and screen first.");
  process.exit(0);
}

const p = projects[0];
console.log(`Using project: ${p.id}`);

console.log("Listing screens...");
const screens = await p.screens();

if (screens.length === 0) {
  console.log(`No screens found in project ${p.id}.`);
  process.exit(0);
}

const screen = screens[0];
console.log(`Using screen: ${screen.id}`);

const outDir = path.join(process.cwd(), "out");
await fs.mkdir(outDir, { recursive: true });

try {
  // Download HTML
  console.log("Fetching HTML URL...");
  const htmlUrl = await screen.getHtml();
  if (htmlUrl) {
    console.log(`Downloading HTML from ${htmlUrl}...`);
    const htmlResponse = await fetch(htmlUrl);
    if (!htmlResponse.ok) throw new Error(`HTML fetch failed: ${htmlResponse.statusText}`);
    const htmlCode = await htmlResponse.text();
    const htmlPath = path.join(outDir, `${screen.id}.html`);
    await fs.writeFile(htmlPath, htmlCode);
    console.log(`✅ Saved HTML to ${htmlPath}`);
  } else {
    console.log("⚠️ No HTML URL available for this screen.");
  }

  // Download Image
  console.log("Fetching Image URL...");
  const imageUrl = await screen.getImage();
  if (imageUrl) {
    console.log(`Downloading Image from ${imageUrl}...`);
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error(`Image fetch failed: ${imageResponse.statusText}`);
    const imageBuffer = await imageResponse.arrayBuffer();
    const imagePath = path.join(outDir, `${screen.id}.jpeg`);
    await fs.writeFile(imagePath, Buffer.from(imageBuffer));
    console.log(`✅ Saved Image to ${imagePath}`);
  } else {
    console.log("⚠️ No Image URL available for this screen.");
  }
} catch (error) {
  console.error("Failed to download artifacts:", error);
}
