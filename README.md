# @google/stitch-sdk

Generate UI screens from text prompts and extract their HTML and screenshots programmatically.

## Quick Start

Set your API key and generate a screen:

```ts
import { stitch } from "@google/stitch-sdk";

// STITCH_API_KEY must be set in the environment
const project = stitch.project("your-project-id");
const screen = await project.generate("A login page with email and password fields");
const html = await screen.getHtml();
const imageUrl = await screen.getImage();
```

`html` is a download URL for the screen's HTML. `imageUrl` is a download URL for the screenshot.

Need to create a project first? Use the tool client:

```ts
const result = await stitch.callTool("create_project", { title: "My App" });
```

## Install

```bash
npm install @google/stitch-sdk
```

## Working with Projects and Screens

### List existing projects

```ts
import { stitch } from "@google/stitch-sdk";

const projects = await stitch.projects();
for (const project of projects) {
  console.log(project.id, project.projectId);
  const screens = await project.screens();
  console.log(`  ${screens.length} screens`);
}
```

### Reference a project by ID

If you already have a project ID, reference it directly:

```ts
const project = stitch.project("4044680601076201931");
// Call methods on it — each method fetches data as needed
const screens = await project.screens();
```

### Edit a screen

```ts
const screen = await project.generate("A dashboard with charts");
const edited = await screen.edit("Make the background dark and add a sidebar");
const editedHtml = await edited.getHtml();
```

### Generate variants

```ts
const variants = await screen.variants("Try different color schemes", {
  variantCount: 3,
  creativeRange: "EXPLORE",
  aspects: ["COLOR_SCHEME", "LAYOUT"],
});

for (const variant of variants) {
  console.log(variant.id, await variant.getHtml());
}
```

`variantOptions` fields:

| Field | Type | Default | Description |
|---|---|---|---|
| `variantCount` | `number` | 3 | Number of variants (1–5) |
| `creativeRange` | `string` | `"EXPLORE"` | `"REFINE"`, `"EXPLORE"`, or `"REIMAGINE"` |
| `aspects` | `string[]` | all | `"LAYOUT"`, `"COLOR_SCHEME"`, `"IMAGES"`, `"TEXT_FONT"`, `"TEXT_CONTENT"` |

## Tool Client (Agent Usage)

For agents and orchestration scripts that need direct MCP tool access:

```ts
import { stitch } from "@google/stitch-sdk";

// List available tools
const { tools } = await stitch.listTools();
for (const tool of tools) {
  console.log(tool.name, tool.description);
}

// Call a tool directly
const result = await stitch.callTool("create_project", {
  title: "Agent Project",
});
```

For explicit configuration (custom API key, base URL), use `StitchToolClient` directly:

```ts
import { StitchToolClient } from "@google/stitch-sdk";

const client = new StitchToolClient({ apiKey: "your-api-key" });
const result = await client.callTool("create_project", { title: "Agent Project" });
await client.close();
```

The client auto-connects on the first `callTool` or `listTools` call. No explicit `connect()` needed.

## AI SDK Integration

Drop Stitch tools directly into the [Vercel AI SDK](https://sdk.vercel.ai/):

```ts
import { generateText, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { stitchTools } from "@google/stitch-sdk";

const { text, steps } = await generateText({
  model: google("gemini-2.5-flash"),
  tools: stitchTools(),
  prompt: "Create a project and generate a modern dashboard with a stat card",
  stopWhen: stepCountIs(5),
});

// The model autonomously calls create_project, generate_screen, get_screen
const toolCalls = steps.flatMap(s => s.toolCalls);
console.log(`Model called ${toolCalls.length} tools`);
```

Filter to specific tools:

```ts
const tools = stitchTools({
  include: ["create_project", "generate_screen_from_text", "get_screen"],
});
```

## API Reference

### `Stitch`

The root class. Manages projects.

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `projects()` | — | `Promise<Project[]>` | List all accessible projects |
| `project(id)` | `id: string` | `Project` | Reference a project by ID (no API call) |

### `Project`

A Stitch project containing screens.

| Property | Type | Description |
|---|---|---|
| `id` | `string` | Alias for `projectId` |
| `projectId` | `string` | Bare project ID (no `projects/` prefix) |

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `generate(prompt, deviceType?)` | `prompt: string`, `deviceType?: DeviceType` | `Promise<Screen>` | Generate a screen from a text prompt |
| `screens()` | — | `Promise<Screen[]>` | List all screens in the project |
| `getScreen(screenId)` | `screenId: string` | `Promise<Screen>` | Retrieve a specific screen by ID |

`DeviceType`: `"MOBILE"` \| `"DESKTOP"` \| `"TABLET"` \| `"AGNOSTIC"`

### `Screen`

A generated UI screen. Provides access to HTML and screenshots.

| Property | Type | Description |
|---|---|---|
| `id` | `string` | Alias for `screenId` |
| `screenId` | `string` | Bare screen ID |
| `projectId` | `string` | Parent project ID |

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `edit(prompt, deviceType?, modelId?)` | `prompt: string` | `Promise<Screen>` | Edit the screen with a text prompt |
| `variants(prompt, variantOptions, deviceType?, modelId?)` | `prompt: string`, `variantOptions: object` | `Promise<Screen[]>` | Generate design variants |
| `getHtml()` | — | `Promise<string>` | Get the screen's HTML download URL |
| `getImage()` | — | `Promise<string>` | Get the screen's screenshot download URL |

`getHtml()` and `getImage()` use cached data from the generation response when available. If the screen was loaded from `screens()` or `getScreen()`, they call the `get_screen` API automatically.

`modelId`: `"GEMINI_3_PRO"` \| `"GEMINI_3_FLASH"`

### `StitchToolClient`

Low-level authenticated pipe to the Stitch MCP server. Use this when you need direct tool access (e.g., in an AI agent).

```ts
const client = new StitchToolClient({ apiKey: "..." });
const result = await client.callTool<any>("tool_name", { arg: "value" });
await client.close();
```

| Method | Parameters | Returns | Description |
|---|---|---|---|
| `callTool<T>(name, args)` | `name: string`, `args: Record<string, any>` | `Promise<T>` | Call an MCP tool |
| `listTools()` | — | `Promise<{ tools }>` | List available tools |
| `connect()` | — | `Promise<void>` | Explicitly connect (auto-called by `callTool`) |
| `close()` | — | `Promise<void>` | Close the connection |

### `stitchTools()`

Returns all Stitch MCP tools as Vercel AI SDK `dynamicTool` objects. Drop into `generateText()` or `streamText()` — the model calls tools autonomously.

```ts
import { generateText, stepCountIs } from "ai";
import { stitchTools } from "@google/stitch-sdk";

const { text } = await generateText({
  model: yourModel,
  tools: stitchTools(),
  prompt: "Create a login page",
  stopWhen: stepCountIs(5),
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | `STITCH_API_KEY` | Override env var |
| `include` | `string[]` | all tools | Only expose specific tool names |

Each tool's `execute` function calls `StitchToolClient.callTool()` under the hood. The client is lazily initialized via the singleton.

### `StitchProxy`

An MCP proxy server that forwards requests to Stitch. Use this to expose Stitch tools through your own MCP server.

```ts
import { StitchProxy } from "@google/stitch-sdk";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const proxy = new StitchProxy({ apiKey: "..." });
const transport = new StdioServerTransport();
await proxy.start(transport);
```

### `stitch` Singleton

A pre-configured `Stitch` instance that reads `STITCH_API_KEY` from the environment. Lazily initialized on first use.

```ts
import { stitch } from "@google/stitch-sdk";

// No setup needed — just use it
const projects = await stitch.projects();
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `STITCH_API_KEY` | Yes (or use OAuth) | API key for authentication |
| `STITCH_ACCESS_TOKEN` | No | OAuth access token (alternative to API key) |
| `GOOGLE_CLOUD_PROJECT` | With OAuth | Google Cloud project ID |
| `STITCH_HOST` | No | Override the MCP server URL |

### Explicit Configuration

```ts
import { Stitch, StitchToolClient } from "@google/stitch-sdk";

const client = new StitchToolClient({
  apiKey: "your-api-key",
  baseUrl: "https://stitch.googleapis.com/mcp",
  timeout: 300_000,
});

const sdk = new Stitch(client);
const projects = await sdk.projects();
```

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | `STITCH_API_KEY` | API key |
| `accessToken` | `string` | `STITCH_ACCESS_TOKEN` | OAuth token |
| `projectId` | `string` | `GOOGLE_CLOUD_PROJECT` | Cloud project ID |
| `baseUrl` | `string` | `https://stitch.googleapis.com/mcp` | MCP server URL |
| `timeout` | `number` | `300000` | Request timeout (ms) |

Authentication requires either `apiKey` or both `accessToken` and `projectId`.

## Error Handling

All domain class methods throw `StitchError` on failure:

```ts
import { stitch, StitchError } from "@google/stitch-sdk";

try {
  const project = stitch.project("bad-id");
  await project.screens();
} catch (error) {
  if (error instanceof StitchError) {
    console.error(error.code);        // "UNKNOWN_ERROR"
    console.error(error.message);     // Human-readable description
    console.error(error.recoverable); // false
  }
}
```

Error codes: `AUTH_FAILED`, `NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `NETWORK_ERROR`, `VALIDATION_ERROR`, `UNKNOWN_ERROR`.

---

## Disclaimer

This is not an officially supported Google product. This project is not
eligible for the [Google Open Source Software Vulnerability Rewards
Program](https://bughunters.google.com/open-source-security).

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.