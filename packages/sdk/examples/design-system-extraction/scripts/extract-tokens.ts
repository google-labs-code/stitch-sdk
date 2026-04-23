/**
 * Extract and reconcile design tokens (colors, fonts) from multiple generated screens.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/design-system-extraction/scripts/extract-tokens.ts
 */
import "../../_require-key.js";
import { stitch } from "@google/stitch-sdk";

// Helper to extract Tailwind config string from HTML
function extractTailwindConfigString(html: string): string | null {
  const match = html.match(/<script id="tailwind-config">([\s\S]*?)<\/script>/);
  return match ? match[1].trim() : null;
}

// Helper to parse Tailwind config string to an object (best effort)
// Since the config is JS (e.g. `tailwind.config = { ... }`), we use a simple eval-like approach.
// In a real agent workflow, an agent might parse this more robustly or use regex.
function parseConfig(configStr: string): any {
  try {
    // Remove 'tailwind.config = ' to just get the object
    let objStr = configStr.replace(/tailwind\.config\s*=\s*/, '').trim();
    // Remove trailing semicolon if it exists
    if (objStr.endsWith(';')) {
      objStr = objStr.slice(0, -1);
    }
    // Using Function to safely evaluate the object literal
    return new Function(`return ${objStr}`)();
  } catch (e) {
    console.error("Failed to parse config:", e);
    return null;
  }
}

// Helper to extract Google Fonts links from HTML
function extractGoogleFonts(html: string): string[] {
  return html.match(/<link[^>]*fonts\.googleapis\.com[^>]*>/g) || [];
}

async function main() {
  const project = await stitch.createProject("Design System Project");
  console.log(`🎨 Created project: ${project.id}`);

  const prompts = [
    "A clean landing page with a primary blue color and modern sans-serif fonts.",
    "A complex analytics dashboard with a dark sidebar and a vibrant accent color."
  ];

  const screensData = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    console.log(`\nGenerating screen ${i + 1} from prompt: "${prompt}"...`);
    const screen = await project.generate(prompt);

    const htmlUrl = await screen.getHtml();
    let html = htmlUrl;

    if (htmlUrl.startsWith("http")) {
      console.log(`📥 Fetching HTML for screen ${screen.id}...`);
      const response = await fetch(htmlUrl);
      if (!response.ok) {
         console.error(`Failed to fetch HTML for screen ${screen.id}`);
         continue;
      }
      html = await response.text();
    }

    const configStr = extractTailwindConfigString(html);
    const fonts = extractGoogleFonts(html);

    screensData.push({
      id: screen.id,
      configStr,
      fonts,
      parsedConfig: configStr ? parseConfig(configStr) : null
    });
  }

  console.log("\n--- Extraction Results ---\n");

  const allColors: Record<string, string[]> = {};
  const allFonts: Record<string, string[]> = {};

  screensData.forEach((data, index) => {
    console.log(`Screen ${index + 1} (${data.id}):`);
    console.log(`  Fonts: ${data.fonts.length} links found.`);

    if (data.parsedConfig && data.parsedConfig.theme && data.parsedConfig.theme.extend) {
      const colors = data.parsedConfig.theme.extend.colors || {};
      const fonts = data.parsedConfig.theme.extend.fontFamily || {};

      console.log(`  Extracted Colors: ${Object.keys(colors).join(", ") || "None"}`);
      console.log(`  Extracted Fonts: ${Object.keys(fonts).join(", ") || "None"}`);

      // Collect all colors for reconciliation
      Object.entries(colors).forEach(([name, value]) => {
         // handle case where value is an object (e.g., 500: '#...', 600: '#...')
         const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
         if (!allColors[name]) allColors[name] = [];
         allColors[name].push(valStr);
      });

      // Collect all fonts for reconciliation
      Object.entries(fonts).forEach(([name, value]) => {
         const valStr = typeof value === 'string' ? value : JSON.stringify(value);
         if (!allFonts[name]) allFonts[name] = [];
         allFonts[name].push(valStr);
      });
    } else {
      console.log("  Could not parse Tailwind config theme extensions.");
    }
  });

  console.log("\n--- Reconciliation ---");

  console.log("\nColor Conflicts:");
  let hasColorConflicts = false;
  Object.entries(allColors).forEach(([name, values]) => {
     const uniqueValues = Array.from(new Set(values));
     if (uniqueValues.length > 1) {
       hasColorConflicts = true;
       console.log(`  Conflict on color '${name}':`);
       uniqueValues.forEach((val, idx) => console.log(`    Screen ${idx + 1} -> ${val}`));
     }
  });
  if (!hasColorConflicts) console.log("  No color conflicts detected.");

  console.log("\nFont Conflicts:");
  let hasFontConflicts = false;
  Object.entries(allFonts).forEach(([name, values]) => {
     const uniqueValues = Array.from(new Set(values));
     if (uniqueValues.length > 1) {
       hasFontConflicts = true;
       console.log(`  Conflict on font '${name}':`);
       uniqueValues.forEach((val, idx) => console.log(`    Screen ${idx + 1} -> ${val}`));
     }
  });
  if (!hasFontConflicts) console.log("  No font conflicts detected.");

  console.log("\nIn an agent workflow, the agent would now analyze these conflicts, make a decision on which to keep (or rename them), and generate a unified tailwind.config.ts.");
}

main().catch(console.error);
