# @google/stitch-sdk

Generate UI screens from text prompts and extract their HTML and screenshots programmatically.

## Quick Start

Set your API key and generate a screen:

```ts
import { stitch } from "@google/stitch-sdk";

// STITCH_API_KEY must be set in the environment
const project = await stitch.createProject({ title: "My App" });
const generation = await project.generate(
  "A login page with email and password fields",
);
const screen = generation.first; // every screen: generation.screens
const html = await screen.getHtml(); // HTML content (URL: getHtmlUrl())
const png = await screen.getImage(); // screenshot bytes (URL: getImageUrl())
```

`html` is a download URL for the screen's HTML. `imageUrl` is a download URL for the screenshot.

## Install

```bash
npm install @google/stitch-sdk
```

To use `stitchTools()` with the [Vercel AI SDK](https://sdk.vercel.ai/), install `ai` as well:

```bash
npm install @google/stitch-sdk ai
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
const { first: screen } = await project.generate("A dashboard with charts");
const edited = await screen.edit("Make the background dark and add a sidebar");
const editedHtml = await edited.first.getHtml();
```

### Generate variants

```ts
const variants = await screen.variants("Try different color schemes", {
  variantCount: 3,
  creativeRange: "EXPLORE",
  aspects: ["COLOR_SCHEME", "LAYOUT"],
});

for (const variant of variants.screens) {
  console.log(variant.id, await variant.getHtmlUrl());
}
```

`variantOptions` fields:

| Field           | Type       | Default     | Description                                                               |
| --------------- | ---------- | ----------- | ------------------------------------------------------------------------- |
| `variantCount`  | `number`   | 3           | Number of variants (1–5)                                                  |
| `creativeRange` | `string`   | `"EXPLORE"` | `"REFINE"`, `"EXPLORE"`, or `"REIMAGINE"`                                 |
| `aspects`       | `string[]` | all         | `"LAYOUT"`, `"COLOR_SCHEME"`, `"IMAGES"`, `"TEXT_FONT"`, `"TEXT_CONTENT"` |

## Tool Client (Agent Usage)

For agents and orchestration scripts that need direct MCP tool access:

```ts
import { StitchToolClient } from "@google/stitch-sdk";

const client = new StitchToolClient({ apiKey: "your-api-key" });

// List available tools
const { tools } = await client.listTools();
for (const tool of tools) {
  console.log(tool.name, tool.description);
}

// Call a tool directly — returns are now strongly typed!
import { CreateProjectResponse, parseResourceName } from "@google/stitch-sdk";
const result = await client.callTool<CreateProjectResponse>("create_project", {
  title: "Agent Project",
});
// create_project returns the resource `name` (e.g. "projects/123"); the
// bare id is the last segment. (The high-level Stitch.createProject() does
// this for you and returns a Project.)
console.log(result.name, parseResourceName(result.name ?? ""));

await client.close();
```

The client auto-connects on the first `callTool` or `listTools` call. No explicit `connect()` needed.
All tool responses and input parameters are strictly typed and exported from the SDK.

## API Reference

### `Stitch`

The root class. Manages projects.

| Method                    | Parameters                     | Returns              | Description                             |
| ------------------------- | ------------------------------ | -------------------- | --------------------------------------- |
| `createProject(options?)` | `options?: { title?: string }` | `Promise<Project>`   | Create a new project                    |
| `projects()`              | —                              | `Promise<Project[]>` | List all accessible projects            |
| `project(id)`             | `id: string`                   | `Project`            | Reference a project by ID (no API call) |

### `Project`

A Stitch project containing screens.

| Property    | Type     | Description                             |
| ----------- | -------- | --------------------------------------- |
| `id`        | `string` | Alias for `projectId`                   |
| `projectId` | `string` | Bare project ID (no `projects/` prefix) |

| Method                       | Parameters                                              | Returns                       | Description                                     |
| ---------------------------- | ------------------------------------------------------- | ----------------------------- | ----------------------------------------------- |
| `generate(prompt, options?)` | `prompt: string`, `options?: { deviceType?, modelId? }` | `Promise<Generation<Screen>>` | Generate screens — `.screens`, `.first`, `.raw` |
| `screens()`                  | —                                                       | `Promise<Screen[]>`           | List all screens in the project                 |
| `getScreen(screenId)`        | `screenId: string`                                      | `Promise<Screen>`             | Retrieve a specific screen by ID                |

`DeviceType`: `"MOBILE"` \| `"DESKTOP"` \| `"TABLET"` \| `"AGNOSTIC"`

### `Screen`

A generated UI screen. Provides access to HTML and screenshots.

| Property    | Type     | Description          |
| ----------- | -------- | -------------------- |
| `id`        | `string` | Alias for `screenId` |
| `screenId`  | `string` | Bare screen ID       |
| `projectId` | `string` | Parent project ID    |

| Method                                       | Parameters                                                                                | Returns                       | Description                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------- |
| `edit(prompt, options?)`                     | `prompt: string`, `options?: { deviceType?, modelId? }`                                   | `Promise<Generation<Screen>>` | Edit the screen — `.screens`, `.first`, `.raw` |
| `variants(prompt, variantOptions, options?)` | `prompt: string`, `variantOptions: VariantOptions`, `options?: { deviceType?, modelId? }` | `Promise<Generation<Screen>>` | Generate design variants                       |
| `getHtml()`                                  | —                                                                                         | `Promise<string>`             | Fetch the screen's HTML content                |
| `getImage()`                                 | —                                                                                         | `Promise<Uint8Array>`         | Fetch the screenshot bytes                     |
| `getHtmlUrl()` / `getImageUrl()`             | —                                                                                         | `Promise<string>`             | Signed download URLs (cache-aware)             |

URL accessors use cached data from the generation response when available, write fetched responses back to the cache, and throw `StitchError` `NOT_FOUND` for missing artifacts (never a silent empty string).

`modelId`: `"GEMINI_3_8_FLASH"` \| `"GEMINI_3_5_FLASH_LITE"` (optional, defaults to backend default)

### `StitchToolClient`

Low-level authenticated pipe to the Stitch MCP server. Use this when you need direct tool access (e.g., in an AI agent).

```ts
import { StitchToolClient, GetScreenResponse } from "@google/stitch-sdk";

const client = new StitchToolClient({ apiKey: "..." });
const result = await client.callTool<GetScreenResponse>("get_screen", {
  projectId: "...",
  screenId: "...",
});
await client.close();
```

| Method                    | Parameters                                  | Returns              | Description                                    |
| ------------------------- | ------------------------------------------- | -------------------- | ---------------------------------------------- |
| `callTool<T>(name, args)` | `name: string`, `args: Record<string, any>` | `Promise<T>`         | Call an MCP tool                               |
| `listTools()`             | —                                           | `Promise<{ tools }>` | List available tools                           |
| `connect()`               | —                                           | `Promise<void>`      | Explicitly connect (auto-called by `callTool`) |
| `close()`                 | —                                           | `Promise<void>`      | Close the connection                           |

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

### `toolMap`

Static tool schemas with pre-parsed parameters. Import from `@google/stitch-sdk/tools` (kept off the root entry so it stays lean). No network call or API key needed.

```ts
import { stitch } from "@google/stitch-sdk";

// Look up a tool
import { toolMap } from "@google/stitch-sdk/tools";

const tool = toolMap.get("generate_screen_from_text");
if (tool) {
  // Pre-parsed params — no JSON Schema parsing needed
  const required = tool.params.filter((p) => p.required);
  const optional = tool.params.filter((p) => !p.required);
  console.log(required.map((p) => p.name)); // ["projectId", "prompt"]
  console.log(optional.map((p) => p.name)); // ["deviceType", "modelId"]
}

// Iterate all tools
for (const [name, tool] of toolMap) {
  for (const param of tool.params) {
    console.log(param.name, param.type, param.required);
  }
}
```

Each `ToolParam` has: `name`, `type`, `description`, `required`, and `enum` (for constrained values).

The raw `inputSchema` (`ToolInputSchema`) is also available on each entry. Exports from `@google/stitch-sdk/tools`: `toolMap`, `toolDefinitions`, `ToolInfo`, `ToolParam`, `ToolDefinition`, `ToolInputSchema`, `ToolPropertySchema`.

## Configuration

### Environment Variables

| Variable               | Required           | Description                                 |
| ---------------------- | ------------------ | ------------------------------------------- |
| `STITCH_API_KEY`       | Yes (or use OAuth) | API key for authentication                  |
| `STITCH_ACCESS_TOKEN`  | No                 | OAuth access token (alternative to API key) |
| `GOOGLE_CLOUD_PROJECT` | With OAuth         | Google Cloud project ID                     |
| `STITCH_HOST`          | No                 | Override the MCP server URL                 |

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

| Option        | Type     | Default                             | Description          |
| ------------- | -------- | ----------------------------------- | -------------------- |
| `apiKey`      | `string` | `STITCH_API_KEY`                    | API key              |
| `accessToken` | `string` | `STITCH_ACCESS_TOKEN`               | OAuth token          |
| `projectId`   | `string` | `GOOGLE_CLOUD_PROJECT`              | Cloud project ID     |
| `baseUrl`     | `string` | `https://stitch.googleapis.com/mcp` | MCP server URL       |
| `timeout`     | `number` | `300000`                            | Request timeout (ms) |

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
    console.error(error.code); // "UNKNOWN_ERROR"
    console.error(error.message); // Human-readable description
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
