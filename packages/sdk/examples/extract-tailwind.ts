/**
 * Fetch HTML from a screen and parse out the Tailwind configuration
 * and Google Fonts links.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/extract-tailwind.ts
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
const screen = (
  await project.generate("A modern login page with a custom Tailwind theme")
).first;
console.log(`✅ Screen generated: ${screen.id}`);

// getHtml() returns the HTML content directly (getHtmlUrl() for the URL).
const html = await screen.getHtml();
console.log(`📥 Fetched HTML content (length: ${html.length})`);

// Parse out the Tailwind configuration
console.log("🔍 Parsing Tailwind config...");
const configMatch = html.match(
  /<script id="tailwind-config">([\s\S]*?)<\/script>/,
);

if (configMatch) {
  console.log("✅ Found Tailwind config!");
  console.log(configMatch[1].trim());
} else {
  console.log("❌ No Tailwind config found.");
}

// Parse Google Fonts links
console.log("🔍 Parsing Google Fonts links...");
const fontsMatches =
  html.match(/<link[^>]*fonts\.googleapis\.com[^>]*>/g) || [];

if (fontsMatches.length > 0) {
  console.log(`✅ Found ${fontsMatches.length} Google Fonts link(s):`);
  fontsMatches.forEach((link) => console.log(`  - ${link}`));
} else {
  console.log("❌ No Google Fonts links found.");
}
