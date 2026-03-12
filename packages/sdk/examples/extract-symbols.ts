/**
 * Fetch HTML from a screen and parse it for Material Symbols usage.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/extract-symbols.ts
 */
import "./_require-key.js";
import { stitch } from "@google/stitch-sdk";

const projects = await stitch.projects();
if (projects.length === 0) {
  console.log("❌ No projects found. Cannot generate a screen.");
  process.exit(1);
}
const project = projects[0];

console.log(`🎨 Generating a screen in project ${project.id}...`);
const screen = await project.generate("A dashboard with many Material Design icons");
console.log(`✅ Screen generated: ${screen.id}`);

const htmlOrUrl = await screen.getHtml();
let html = htmlOrUrl;

// If getHtml() returns a download URL, fetch the actual HTML content
if (htmlOrUrl.startsWith("http")) {
  console.log(`📥 Fetching HTML from ${htmlOrUrl}...`);
  const response = await fetch(htmlOrUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch HTML: ${response.statusText}`);
  }
  html = await response.text();
} else {
  console.log(`📥 Using HTML directly (length: ${html.length})`);
}

// Parse Google Fonts links for Material Symbols
console.log("\n🔍 Checking for Material Symbols font import...");
if (html.includes("fonts.googleapis.com/css2?family=Material+Symbols")) {
  console.log("✅ Found Material Symbols font import!");
} else {
  console.log("❌ No Material Symbols font import found.");
}

// Parse Material Symbols usage
console.log("\n🔍 Parsing Material Symbols usage...");
// Look for <span class="... material-symbols-outlined ...">icon_name</span>
const matches = Array.from(
  html.matchAll(/<span[^>]*class="[^"]*material-symbols-[^"]*"[^>]*>([^<]+)<\/span>/g)
);

if (matches.length > 0) {
  const uniqueIcons = new Set(matches.map(m => m[1].trim()));
  console.log(`✅ Found ${uniqueIcons.size} unique Material Symbol(s):`);
  uniqueIcons.forEach(icon => console.log(`  - ${icon}`));
} else {
  console.log("❌ No Material Symbols usage found in HTML.");
}
