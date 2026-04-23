import "../_require-key.js";
import { stitch } from "@google/stitch-sdk";

async function main() {
  console.log("🚀 Basic Design Generation Example");

  // 1. Create a project
  console.log("📁 Creating a new project...");
  const rawProject = await stitch.callTool<any>("create_project", { title: "Basic Design Example" });
  const project = stitch.project(rawProject.name);
  console.log(`✅ Project created: ${project.id}`);

  // 2. Generate a screen
  console.log("🎨 Generating a screen from a text prompt...");
  const screen = await project.generate("A landing page for a modern coffee shop with a hero image, features section, and email signup form.");
  console.log(`✅ Screen generated: ${screen.id}`);

  // 3. Get outputs
  const htmlUrl = await screen.getHtml();
  const imageUrl = await screen.getImage();

  console.log("\n✨ Results:");
  console.log(`📄 HTML URL:  ${htmlUrl}`);
  console.log(`🖼️  Image URL: ${imageUrl}`);

  console.log("\nNext steps:");
  console.log("- Download the HTML from the URL");
  console.log("- Extract the Tailwind configuration block");
  console.log("- Integrate the assets into your application");
}

main().catch(console.error);
