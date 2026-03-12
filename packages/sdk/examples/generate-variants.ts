/**
 * Pick an existing screen and call screen.variants() with variant options,
 * then log the resulting variant screens.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/generate-variants.ts
 */
import "./_require-key.js";
import { stitch } from "@google/stitch-sdk";

console.log("🔍 Fetching your projects to find a screen to generate variants from...");

const projects = await stitch.projects();
if (projects.length === 0) {
  console.log("📭 No projects found. Run getting-started.ts first.");
  process.exit(0);
}

// Find the first screen available
let targetScreen = null;
let targetProject = null;

for (const project of projects) {
  const screens = await project.screens();
  if (screens.length > 0) {
    targetProject = project;
    targetScreen = screens[0];
    break;
  }
}

if (!targetScreen || !targetProject) {
  console.log("📭 No screens found in any project. Run getting-started.ts first.");
  process.exit(0);
}

console.log(`✅ Found base screen ${targetScreen.id} in project ${targetProject.id}`);

const variantsPrompt = "Change the button style to outline";
const variantOptions = { variantCount: 3 };

console.log(`\n🎨 Generating variants with prompt: "${variantsPrompt}"...`);
console.log("   (This may take up to a minute)");

try {
  // Note: The method is named `variants` in the SDK domain class (as mapped in domain-map.json).
  // The issue refers to it conceptually as "generateVariants".
  const variantScreens = await targetScreen.variants(variantsPrompt, variantOptions);

  console.log(`✅ Successfully generated ${variantScreens.length} variants!`);

  for (let i = 0; i < variantScreens.length; i++) {
    const screen = variantScreens[i];
    const htmlUrl = await screen.getHtml();
    console.log(`\n✨ Variant ${i + 1} (${screen.id}):`);
    console.log(`   📄 HTML URL: ${htmlUrl}`);
  }

} catch (e: any) {
  console.error("❌ Failed to generate variants:");
  console.error(e.message);
}
