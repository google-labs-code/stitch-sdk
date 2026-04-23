# Tool Filtering Custom AI Workflow Example

This example demonstrates how to use the `stitchTools({ include: [...] })` functionality with the Vercel AI SDK to filter the available Stitch MCP tools.

Filtering tools is useful for:
- **Reducing context window usage** by only exposing the necessary tool schemas to the LLM.
- **Enforcing least privilege** so an agent can only perform specific operations (e.g., read-only access to screens without the ability to create new projects or edit design systems).

## Prerequisites

- `STITCH_API_KEY` (or `STITCH_ACCESS_TOKEN`) for the Stitch SDK.
- `GEMINI_API_KEY` (or another AI SDK provider token) for the LLM.

## How to run

```bash
# Run the example script
bun index.ts
```
