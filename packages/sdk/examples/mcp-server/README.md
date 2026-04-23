# Stitch Design MCP Server Example

This example demonstrates how to build a Model Context Protocol (MCP) server that exposes the Stitch SDK to agent frameworks. It wraps the core Stitch functionality into high-level, compound tools that are optimized for AI agents.

## Why wrap Stitch in another MCP Server?

Stitch itself is an MCP server, but its native tools are low-level (e.g., `create_project`, `generate_screen_from_text`). When building an AI agent that generates and implements UI designs, wrapping the Stitch SDK in a custom MCP server allows you to:

1. **Create Compound Actions**: Combine generation, asset extraction, and theme parsing into a single tool call (e.g., `generate_and_extract`), saving the agent multiple round-trips.
2. **Add Domain-Specific Logic**: Translate Stitch's generic HTML output into your framework's specific structure (e.g., scaffolding a Next.js or Astro project automatically).
3. **Control Tool Exposure**: Expose only the specific workflows your agent needs, rather than the entire raw Stitch API.

## Example Tools

This server exposes compound tools:

- `generate_and_extract`: Generates a screen from a prompt and returns the extracted theme + HTML body + screenshot URL in one call.
- `compare_themes`: Generates variants of a screen and diffs their configs.
- `scaffold_project`: Generates multiple screens based on a requirement and returns them as a page manifest.

## Running the Server

To start the MCP server over standard input/output (stdio), which is the standard way MCP clients communicate with servers:

```bash
export STITCH_API_KEY="your-api-key"
bun run src/index.ts
```

## Using with an MCP Client

You can use this server with any MCP-compatible client, such as the Vercel AI SDK or an agent framework.

1. Configure your client to spawn this script as a child process.
2. The server communicates via standard input/output using the MCP protocol.
