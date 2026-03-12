/**
 * Create a new project, call project.generate() to generate a screen,
 * then log the resulting screen's HTML URL.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/generate-screen.ts
 */
import "./_require-key.js";
import { stitch } from "@google/stitch-sdk";

console.log("🚀 Creating a project for screen generation...");

const rawProject = await stitch.callTool<any>("create_project", { title: "Analytics App" });
const project = stitch.project(rawProject.name);
console.log(`✅ Project created: ${project.id}`);

const prompt = "A dashboard for a SaaS analytics tool";
console.log(`🎨 Generating screen with prompt: "${prompt}"...`);
console.log("   (This may take up to a minute)");

const screen = await project.generate(prompt);
console.log(`✅ Screen generated: ${screen.id}`);

console.log("🔍 Fetching HTML...");
const htmlUrl = await screen.getHtml();

console.log("\n✨ Output:");
console.log(`📄 HTML URL: ${htmlUrl}`);
