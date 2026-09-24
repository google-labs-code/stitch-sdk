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
  // getHtml() returns the HTML CONTENT (use getHtmlUrl() for just the URL).
  console.log("Fetching HTML content...");
  const htmlCode = await screen.getHtml();
  const htmlPath = path.join(outDir, `${screen.id}.html`);
  await fs.writeFile(htmlPath, htmlCode);
  console.log(`✅ Saved HTML to ${htmlPath}`);

  // getImage() returns the screenshot BYTES as a Uint8Array.
  console.log("Fetching image bytes...");
  const imageBytes = await screen.getImage();
  const imagePath = path.join(outDir, `${screen.id}.png`);
  await fs.writeFile(imagePath, imageBytes);
  console.log(`✅ Saved image to ${imagePath}`);
} catch (error) {
  console.error("Failed to download artifacts:", error);
}
