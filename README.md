# @google/stitch-sdk

Generate UI screens from text prompts and extract their HTML and screenshots programmatically.

## Create a screen

```typescript
import { stitch } from "@google/stitch-sdk";

const project = await stitch.createProject("My App");
const screen = await project.generate(`
  A settings page with a dark theme and toggle switches
`);
const html = await screen.getHtml();
console.log(html); // Full HTML document
```

Set `STITCH_API_KEY` in your environment. The `stitch` singleton reads it automatically and connects on first use — no setup code required.

## List existing projects and screens

```typescript
import { stitch } from "@google/stitch-sdk";

const projects = await stitch.projects();

for (const project of projects) {
  console.log(project.id, project.data?.title);

  const screens = await project.screens();
  for (const screen of screens) {
    const image = await screen.getImage();
    console.log(`  Screenshot: ${image}`);
  }
}
```

## Explicit configuration

Pass credentials directly instead of using the singleton:

```typescript
import { Stitch } from "@google/stitch-sdk";

const stitch = new Stitch({ apiKey: "your-api-key" });

const projects = await stitch.projects();
```

Connection is established automatically on the first API call. You can also call `await stitch.connect()` explicitly if you want to verify credentials upfront.

## Error handling

All SDK methods throw `StitchError` on failure. Use try/catch at whatever granularity you need:

```typescript
import { stitch, StitchError } from "@google/stitch-sdk";

try {
  const project = await stitch.createProject("My App");
  const screen = await project.generate("A dashboard with charts");
  const html = await screen.getHtml();
} catch (e) {
  if (e instanceof StitchError) {
    console.log(e.code);        // "AUTH_FAILED", "NOT_FOUND", etc.
    console.log(e.message);     // Human-readable description
    console.log(e.suggestion);  // Recovery hint, if available
    console.log(e.recoverable); // Whether retrying might succeed
  }
}
```

### `StitchError`

Extends `Error` with structured fields:

| Field | Type | Description |
|---|---|---|
| `code` | `StitchErrorCode` | One of `AUTH_FAILED`, `NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `NETWORK_ERROR`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `message` | `string` | Human-readable description |
| `suggestion` | `string?` | Recovery hint, if available |
| `recoverable` | `boolean` | Whether retrying might succeed |

## Dynamic tool client

For agents and programmatic tool invocation, use `StitchToolClient` directly:

```typescript
import { StitchToolClient } from "@google/stitch-sdk";

const client = new StitchToolClient({ apiKey: "your-api-key" });
await client.connect();

const tools = await client.listTools();
const result = await client.callTool("create_project", { title: "My App" });
```

The tool client accepts tool names and JSON parameters directly, matching the MCP `tools/call` interface. Use this when you need to invoke tools by name without the domain model.

## API Reference

### `Stitch`

The main entry point. Manages connection and provides access to projects.

```typescript
const s = new Stitch(config?: StitchConfigInput);
```

#### `stitch.connect()`

Establishes a connection to the Stitch MCP server. Called automatically on first API call if omitted.

Returns `Promise<void>`. Throws `StitchError` on failure.

#### `stitch.createProject(title)`

Creates a new project.

```typescript
const project = await stitch.createProject("Landing Page");
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | yes | Name for the new project |

Returns `Promise<Project>`. Throws `StitchError` on failure.

#### `stitch.projects()`

Lists all projects owned by the authenticated user.

```typescript
const projects = await stitch.projects();
```

Returns `Promise<Project[]>`. Throws `StitchError` on failure.

#### `stitch.project(id)`

Returns a `Project` handle for an existing project ID. Does not make a network call.

```typescript
const project = stitch.project("projects/4044680601076201931");
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | yes | Project resource name (e.g. `projects/123`) |

Returns `Project`.

### `Project`

Represents a Stitch project. Obtained from `stitch.createProject()`, `stitch.projects()`, or `stitch.project(id)`.

#### `project.generate(prompt, deviceType?)`

Generates a new screen from a text prompt.

```typescript
const screen = await project.generate("A login form with email and password fields");
```

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `prompt` | `string` | yes | — | What the screen should look like |
| `deviceType` | `"DESKTOP" \| "MOBILE"` | no | `"DESKTOP"` | Target device layout |

Returns `Promise<Screen>`. Throws `StitchError` on failure.

#### `project.screens()`

Lists all screens in the project.

```typescript
const screens = await project.screens();
```

Returns `Promise<Screen[]>`. Throws `StitchError` on failure.

#### `project.id`

The project resource name (e.g. `projects/4044680601076201931`).

#### `project.data`

The raw `ProjectData` object, if the project was fetched from the API. Contains `title`, `visibility`, `createTime`, `updateTime`, `deviceType`, `designTheme`, and `screenInstances`.

### `Screen`

Represents a generated screen. Obtained from `project.generate()` or `project.screens()`.

#### `screen.getHtml()`

Fetches the full HTML source code for the screen. Uses cached data from generation when available.

```typescript
const html = await screen.getHtml();
await Bun.write("output.html", html);
```

Returns `Promise<string>`. Throws `StitchError` on failure.

#### `screen.getImage()`

Fetches a screenshot URL for the screen. Uses cached data from generation when available.

```typescript
const imageUrl = await screen.getImage();
console.log(imageUrl); // "https://..."
```

Returns `Promise<string>`. Throws `StitchError` on failure.

#### `screen.edit(prompt)`

Edits the screen using a text prompt. Returns a new `Screen` with the modified design.

```typescript
const edited = await screen.edit("Make the background dark and add a subtitle");
const html = await edited.getHtml();
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `prompt` | `string` | yes | What to change |

Returns `Promise<Screen>`. Throws `StitchError` on failure.

#### `screen.variants(prompt, options?)`

Generates design variants of the screen.

```typescript
const variants = await screen.variants("Try different color schemes", { count: 2 });
for (const v of variants) {
  console.log(v.id, await v.getHtml());
}
```

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `prompt` | `string` | yes | — | Direction for variants |
| `options.count` | `number` | no | `2` | Number of variants (1-5) |

Returns `Promise<Screen[]>`. Throws `StitchError` on failure.

#### `screen.id`

The screen ID.

#### `screen.data`

The raw screen data object with `id`, `htmlCode`, `screenshot`, `width`, `height`.

### `StitchProxy`

An MCP proxy server that forwards tool calls to Stitch. Use this to expose Stitch as a local MCP server for AI agents and tools that speak the MCP protocol.

```typescript
import { StitchProxy } from "@google/stitch-sdk";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const proxy = new StitchProxy({ apiKey: "your-api-key" });
const transport = new StdioServerTransport();
await proxy.start(transport);
```

#### `proxy.start(transport)`

Connects to Stitch, discovers available tools, and starts serving on the given transport.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `transport` | `Transport` | yes | An MCP transport (e.g. `StdioServerTransport`) |

#### `proxy.close()`

Shuts down the proxy server.

### `stitch` (singleton)

A lazily-initialized default `Stitch` instance. Reads `STITCH_API_KEY` from the environment on first access. Connects automatically on first API call.

```typescript
import { stitch } from "@google/stitch-sdk";

const projects = await stitch.projects();
```

## Setup

### Install

```bash
npm install @google/stitch-sdk
```

### Authentication

The SDK supports two authentication methods:

**API Key** (recommended for scripts and server-side use):

Set `STITCH_API_KEY` in your environment and use the `stitch` singleton, or pass it directly:

```typescript
const stitch = new Stitch({ apiKey: "your-api-key" });
```

**OAuth Access Token** (for user-authenticated requests):

```typescript
const stitch = new Stitch({
  accessToken: "ya29.your-token",
  projectId: "your-gcp-project-id",
});
```

Falls back to `STITCH_ACCESS_TOKEN` and `GOOGLE_CLOUD_PROJECT` environment variables.

### Configuration

| Option | Type | Default | Env Variable | Description |
|---|---|---|---|---|
| `apiKey` | `string` | — | `STITCH_API_KEY` | API key for authentication |
| `accessToken` | `string` | — | `STITCH_ACCESS_TOKEN` | OAuth access token |
| `projectId` | `string` | — | `GOOGLE_CLOUD_PROJECT` | GCP project ID (required with OAuth) |
| `baseUrl` | `string` | `https://stitch.googleapis.com/mcp` | — | MCP server URL |
| `timeout` | `number` | `300000` | — | Request timeout in milliseconds |

One of `apiKey` or `accessToken` + `projectId` is required. The SDK validates this at construction time and throws immediately if neither is provided.

### Proxy Configuration

| Option | Type | Default | Env Variable | Description |
|---|---|---|---|---|
| `apiKey` | `string` | — | `STITCH_API_KEY` | API key (required for proxy) |
| `url` | `string` | `https://stitch.googleapis.com/mcp` | `STITCH_MCP_URL` | Stitch MCP endpoint |
| `name` | `string` | `stitch-proxy` | — | Proxy server name |
| `version` | `string` | `1.0.0` | — | Proxy server version |