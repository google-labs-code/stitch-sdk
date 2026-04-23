# Skill: Building a Stitch MCP Server

This skill teaches an agent how to wrap the Stitch SDK into a custom Model Context Protocol (MCP) server.

## Context

While Stitch provides its own MCP tools, agents often benefit from compound tools that combine multiple Stitch operations or add domain-specific logic. By creating a custom MCP server, you can provide an agent with high-level workflows tailored to specific tasks, such as generating a UI and immediately extracting its Tailwind config in a single step.

## Implementation Pattern

1. **Initialize the MCP Server**: Use the `@modelcontextprotocol/sdk/server` package.
2. **Define Compound Tools**: Create tools that encapsulate multiple Stitch SDK calls.
3. **Use the Stitch SDK**: Use `@google/stitch-sdk` to interact with Stitch within your tool handlers.
4. **Connect Transport**: Start the server using the `StdioServerTransport`.

## Example: `generate_and_extract` Tool

This compound tool generates a screen and extracts the relevant parts (HTML body, Tailwind config, image URL) in a single step.

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { stitch } from "@google/stitch-sdk";

// 1. Initialize Server
const server = new Server(
  { name: "stitch-custom-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 2. Define Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_and_extract",
        description: "Generates a UI screen and extracts its theme and HTML body.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "The UI to generate" },
            title: { type: "string", description: "Project title" }
          },
          required: ["prompt", "title"]
        }
      }
    ]
  };
});

// 3. Handle Tool Calls using Stitch SDK
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "generate_and_extract") {
    const { prompt, title } = request.params.arguments as any;

    // Use the Stitch SDK
    const project = await stitch.createProject(title);
    const screen = await project.generate(prompt);

    const htmlUrl = await screen.getHtml();
    const imageUrl = await screen.getImage();

    // Fetch and extract data (simplified for example)
    const resp = await fetch(htmlUrl);
    const html = await resp.text();
    const configMatch = html.match(/<script id="tailwind-config">([\s\S]*?)<\/script>/);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          imageUrl,
          tailwindConfig: configMatch ? configMatch[1].trim() : null,
          htmlLength: html.length
        }, null, 2)
      }]
    };
  }
  throw new Error("Tool not found");
});

// 4. Connect Transport
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Stitch Custom MCP Server running on stdio");
}

run().catch(console.error);
```
