/**
 * The simplest possible example: connect to Stitch, create a project, generate a screen, and log the result.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/getting-started.ts
 */
import "./_require-key.js";
import { stitch } from "@google/stitch-sdk";

console.log("🚀 Getting started with Stitch...");

// 1. Create a project
console.log("📁 Creating a new project...");
const rawProject = await stitch.callTool<any>("create_project", { title: "Getting Started" });
const project = stitch.project(rawProject.name);
console.log(`✅ Project created: ${project.id}`);

// 2. Generate a screen
console.log("🎨 Generating a screen: 'A simple login page'...");
const screen = await project.generate("A simple login page");
console.log(`✅ Screen generated: ${screen.id}`);

// 3. Get outputs
const htmlUrl = await screen.getHtml();
const imageUrl = await screen.getImage();

console.log("\n✨ Results:");
console.log(`📄 HTML URL:  ${htmlUrl}`);
console.log(`🖼️  Image URL: ${imageUrl}`);
