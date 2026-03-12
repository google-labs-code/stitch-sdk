/**
 * Call stitch.listTools() to enumerate available MCP tools and log
 * their names, descriptions, and parameter schemas.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/list-tools.ts
 */
import "./_require-key.js";
import { stitch } from "@google/stitch-sdk";

console.log("🛠️  Retrieving available tools via stitch.listTools()...\n");
const toolsResponse = await stitch.listTools();

const tools = toolsResponse.tools;
console.log(`✅ Found ${tools.length} available tools:\n`);

for (const tool of tools) {
  console.log(`🔹 Tool: ${tool.name}`);
  console.log(`   Description: ${tool.description}`);
  if (tool.inputSchema) {
    console.log("   Input Schema:");
    console.log(JSON.stringify(tool.inputSchema, null, 2).replace(/^/gm, "     "));
  }
  console.log("");
}
