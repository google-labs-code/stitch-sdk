/**
 * Inspect available Stitch tools offline using stitch.toolMap.
 * No API key or network connection required.
 *
 * Usage:
 *   bun packages/sdk/examples/inspect-tools.ts
 */
import { stitch } from "@google/stitch-sdk";

console.log(`📋 ${stitch.toolMap.size} tools available:\n`);

for (const [name, tool] of stitch.toolMap) {
  console.log(`🔹 ${name}`);
  console.log(`   ${tool.description.split("\n")[0].trim()}`);
  for (const param of tool.params) {
    const req = param.required ? " (required)" : "";
    console.log(`   · ${param.name}: ${param.type ?? "object"}${req}`);
  }
  console.log("");
}

// Look up a specific tool by name
const tool = stitch.toolMap.get("generate_screen_from_text");
if (tool) {
  console.log(`🔎 Found tool: ${tool.name}`);
  console.log(`   Required: ${tool.params.filter(p => p.required).map(p => p.name).join(", ")}`);
  console.log(`   Optional: ${tool.params.filter(p => !p.required).map(p => p.name).join(", ")}`);
}

// Introspect a tool, then call it (requires STITCH_API_KEY)
// const gen = stitch.toolMap.get("generate_screen_from_text")!;
// const args: Record<string, unknown> = {};
// for (const param of gen.params) {
//   if (param.required) {
//     args[param.name] = param.name === "prompt"
//       ? "A login page with email and password fields"
//       : "my-project-id";
//   }
// }
// const result = await stitch.callTool("generate_screen_from_text", args);