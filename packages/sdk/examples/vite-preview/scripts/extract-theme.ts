/**
 * Extract the Tailwind configuration from a Stitch screen and convert it
 * into a Tailwind v4 `@theme` CSS block.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/vite-preview/scripts/extract-theme.ts <screen-id>
 */
import "../../_require-key.js";
import { stitch } from "@google/stitch-sdk";

async function main() {
  const args = process.argv.slice(2);
  const screenId = args[0];

  let html = "";

  if (screenId) {
    console.error(`Fetching screen ${screenId}...`);
    const projects = await stitch.projects();
    if (projects.length === 0) {
      console.error("No projects found to lookup the screen from.");
      process.exit(1);
    }
    const screen = await projects[0].getScreen(screenId);
    const htmlOrUrl = await screen.getHtml();

    if (htmlOrUrl.startsWith("http")) {
      const response = await fetch(htmlOrUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch HTML: ${response.statusText}`);
      }
      html = await response.text();
    } else {
      html = htmlOrUrl;
    }
  } else {
    console.error("No screen ID provided. Generating a sample screen...");
    const projects = await stitch.projects();
    if (projects.length === 0) {
      console.error("No projects found. Create a project first.");
      process.exit(1);
    }
    const project = projects[0];
    const screen = await project.generate("A landing page with a unique color theme");
    console.error(`Generated sample screen: ${screen.id}`);

    const htmlOrUrl = await screen.getHtml();
    if (htmlOrUrl.startsWith("http")) {
      const response = await fetch(htmlOrUrl);
      html = await response.text();
    } else {
      html = htmlOrUrl;
    }
  }

  // Parse out the JSON from the config block
  const configMatch = html.match(/<script id="tailwind-config">([\s\S]*?)<\/script>/);
  if (!configMatch) {
    console.error("No Tailwind config found in HTML.");
    process.exit(1);
  }

  const rawConfig = configMatch[1].trim();
  // Strip tailwind.config = prefix if present
  let jsonString = rawConfig;
  if (jsonString.startsWith("tailwind.config = ")) {
    jsonString = jsonString.replace("tailwind.config = ", "");
  }
  // Strip trailing semicolon
  if (jsonString.endsWith(";")) {
    jsonString = jsonString.slice(0, -1);
  }

  let configObj: any;
  try {
    // The config is sometimes JS, not strict JSON. Use Function instead of JSON.parse
    // to safely evaluate the object literal.
    configObj = new Function(`return ${jsonString}`)();
  } catch (e) {
    console.error("Failed to parse config as object literal.");
    process.exit(1);
  }

  // Generate Tailwind v4 CSS
  console.log("/* Tailwind v4 Extracted Theme */");
  console.log("@import \"tailwindcss\";\n");
  console.log("@theme {");

  const theme = configObj.theme?.extend || configObj.theme || {};

  // Convert colors
  if (theme.colors) {
    for (const [colorName, colorValue] of Object.entries(theme.colors)) {
      if (typeof colorValue === "string") {
        console.log(`  --color-${colorName}: ${colorValue};`);
      } else if (typeof colorValue === "object" && colorValue !== null) {
        for (const [shade, hex] of Object.entries(colorValue)) {
          console.log(`  --color-${colorName}-${shade}: ${hex};`);
        }
      }
    }
  }

  // Convert font families
  if (theme.fontFamily) {
    for (const [fontName, fontArray] of Object.entries(theme.fontFamily)) {
      if (Array.isArray(fontArray)) {
        const formattedFonts = fontArray.map(f => (f.includes(" ") ? `"${f}"` : f)).join(", ");
        console.log(`  --font-${fontName}: ${formattedFonts};`);
      } else if (typeof fontArray === "string") {
        console.log(`  --font-${fontName}: ${fontArray};`);
      }
    }
  }

  // Convert background images
  if (theme.backgroundImage) {
    for (const [bgName, bgValue] of Object.entries(theme.backgroundImage)) {
      console.log(`  --background-image-${bgName}: ${bgValue};`);
    }
  }

  console.log("}");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});