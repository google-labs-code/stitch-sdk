---
name: stitch-sdk-usage
description: Use the Stitch SDK to generate, edit, and iterate on UI screens from text prompts, manage projects, and retrieve screen HTML/images. Use when the user wants to consume the SDK in their application.
---

# Using the Stitch SDK

The Stitch SDK provides a TypeScript interface for Google Stitch, an AI-powered UI generation service.

## Installation

```bash
npm install @google/stitch-sdk
```

## Environment Variables

```bash
export STITCH_API_KEY="your-api-key"
```

## Quick Start

```typescript
import { stitch } from "@google/stitch-sdk";

const project = await stitch.createProject({ title: "My App" });
const generation = await project.generate("A settings page with dark theme");
const screen = generation.first; // all screens: generation.screens
const html = await screen.getHtml(); // the HTML content
const png = await screen.getImage(); // screenshot bytes (Uint8Array)
```

The `stitch` singleton reads `STITCH_API_KEY` from the environment and connects on first use — no setup code required.

## Working with Projects

```typescript
import { stitch } from "@google/stitch-sdk";

// List all projects
const projects = await stitch.projects();

// Reference a project by ID (no network call)
const project = stitch.project("4044680601076201931");

// Create a new project
const newProject = await stitch.createProject({ title: "My App" });
```

## Design Systems

```typescript
// Create a design system for a project
const ds = await project.createDesignSystem({ displayName: "My Theme" });

// List design systems
const systems = await project.listDesignSystems();

// Reference by ID (no network call)
const dsRef = project.designSystem("existing-asset-id");

// Update a design system
const updated = await ds.update({ displayName: "Updated Theme" });

// Apply to screens (requires SelectedScreenInstance objects from project.data.screenInstances)
// Returns a Generation — all updated screens are in .screens
const applied = await ds.apply([
  { id: "instance-id", sourceScreen: "projects/123/screens/456" },
]);
applied.screens;
```

## Uploading Images

Upload an existing image file (PNG, JPG, JPEG, WEBP) to create a screen directly from a mockup or asset.

```typescript
import { stitch } from "@google/stitch-sdk";

const project = stitch.project("your-project-id");

// Upload a local image file
const [screen] = await project.upload("./mockup.png", {
  title: "Home Screen",
});

console.log(screen.id);
const html = await screen.getHtml(); // HTML content
const png = await screen.getImage(); // screenshot bytes (Uint8Array)
```

The method reads the file from disk and posts it directly to the Stitch REST API — no output token constraints apply (unlike agent-driven MCP calls).

**Supported formats:** `.png`, `.jpg`, `.jpeg`, `.webp`

**Options:**
| Option | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | — | Display title for the created screen |
| `createScreenInstances` | `boolean` | `true` | Whether to add the screen to the canvas |

**Throws** `StitchError` with codes: `NOT_FOUND` (file not found), `UNKNOWN_ERROR` (unsupported format or upload failure), `AUTH_FAILED` (invalid API key).

## Generating and Iterating on Screens

```typescript
// Generate screens from a prompt. Stitch can return MANY screens per
// generation — a Generation carries all of them plus the raw response.
const generation = await project.generate(
  "Login page with email and password fields",
);
generation.screens; // every generated Screen
generation.first; // convenience: the first screen
generation.raw; // full typed tool response

// Optional settings go in a trailing options object
const mobile = await project.generate("A settings page", {
  deviceType: "MOBILE",
});

// Edit an existing screen (also returns a Generation)
const edited = await generation.first.edit(
  "Make the background dark and add a subtitle",
);

// Generate variants of a screen
const variants = await generation.first.variants(
  "Try different color schemes",
  {
    variantCount: 2,
    creativeRange: "EXPLORE",
    aspects: ["COLOR_SCHEME", "LAYOUT"],
  },
);
variants.screens; // all variant Screens
```

## Retrieving Screen Assets

```typescript
// CONTENT (fetched for you)
const html = await screen.getHtml(); // HTML string
const png = await screen.getImage(); // Uint8Array

// Or just the signed download URLs
const htmlUrl = await screen.getHtmlUrl();
const imageUrl = await screen.getImageUrl();
```

URL accessors use cached data from the generation response when available and write fetched responses back to the cache. A missing artifact throws `StitchError` with code `NOT_FOUND` (never a silent empty string).

## Dynamic Tool Client (for agents)

For agents and orchestration scripts that forward JSON payloads to MCP tools:

```typescript
import { stitch } from "@google/stitch-sdk";

// Find available tools
const { tools } = await stitch.listTools();
for (const tool of tools) {
  console.log(`${tool.name}: ${tool.description}`);
}
// Call a tool with a JSON payload
const result = await stitch.callTool("generate_screen_from_text", {
  projectId: "123",
  prompt: "A login page",
});
await stitch.close();
```

## Error Handling

All SDK methods throw `StitchError` on failure. Use try/catch:

```typescript
import { stitch, StitchError } from "@google/stitch-sdk";

try {
  const project = stitch.project("bad-id");
  await project.screens();
} catch (e) {
  if (e instanceof StitchError) {
    console.log(e.code); // "AUTH_FAILED", "NOT_FOUND", etc.
    console.log(e.message); // Human-readable description
    console.log(e.recoverable); // Whether retrying might succeed
  }
}
```

Error codes: `AUTH_FAILED`, `NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `NETWORK_ERROR`, `VALIDATION_ERROR`, `UNKNOWN_ERROR`

## API Reference

### Stitch Class

| Method                    | Returns              | Description                                 |
| ------------------------- | -------------------- | ------------------------------------------- |
| `createProject(options?)` | `Promise<Project>`   | Create a new project (`options.title`)      |
| `projects()`              | `Promise<Project[]>` | List all projects                           |
| `project(id)`             | `Project`            | Reference a project by ID (no network call) |

### Project Class

| Method                             | Returns                       | Description                                                                               |
| ---------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `generate(prompt, options?)`       | `Promise<Generation<Screen>>` | Generate screens — `.screens`, `.first`, `.raw` (`options.deviceType`, `options.modelId`) |
| `screens()`                        | `Promise<Screen[]>`           | List all screens in the project                                                           |
| `getScreen(screenId)`              | `Promise<Screen>`             | Retrieve a specific screen by ID                                                          |
| `upload(filePath, opts?)`          | `Promise<Screen[]>`           | Upload an image/HTML file and create screen(s) from it                                    |
| `createDesignSystem(designSystem)` | `Promise<DesignSystem>`       | Create a design system for this project                                                   |
| `listDesignSystems()`              | `Promise<DesignSystem[]>`     | List all design systems                                                                   |
| `designSystem(id)`                 | `DesignSystem`                | Reference by ID (no API call)                                                             |

`deviceType`: `"MOBILE"` | `"DESKTOP"` | `"TABLET"` | `"AGNOSTIC"`

`upload` supported formats: `.png` `.jpg` `.jpeg` `.webp` `.html`

### DesignSystem Class

| Method                           | Returns                       | Description                                      |
| -------------------------------- | ----------------------------- | ------------------------------------------------ |
| `update(designSystem)`           | `Promise<DesignSystem>`       | Update the design system's theme                 |
| `apply(selectedScreenInstances)` | `Promise<Generation<Screen>>` | Apply this design system to screens (`.screens`) |

### Screen Class

| Method                                       | Returns                       | Description                         |
| -------------------------------------------- | ----------------------------- | ----------------------------------- |
| `getHtml()`                                  | `Promise<string>`             | Fetch the screen's HTML content     |
| `getImage()`                                 | `Promise<Uint8Array>`         | Fetch the screenshot bytes          |
| `getHtmlUrl()` / `getImageUrl()`             | `Promise<string>`             | Signed download URLs (cache-aware)  |
| `edit(prompt, options?)`                     | `Promise<Generation<Screen>>` | Edit the screen using a text prompt |
| `variants(prompt, variantOptions, options?)` | `Promise<Generation<Screen>>` | Generate variants of the screen     |

`modelId`: `"GEMINI_3_8_FLASH"` | `"GEMINI_3_5_FLASH_LITE"` (optional, defaults to backend default)

### StitchToolClient (for agents)

| Method                 | Returns          | Description                                        |
| ---------------------- | ---------------- | -------------------------------------------------- |
| `callTool(name, args)` | `Promise<T>`     | Call any MCP tool by name                          |
| `listTools()`          | `Promise<Tools>` | Discover available tools                           |
| `connect()`            | `Promise<void>`  | Establish MCP connection (auto-called by callTool) |
| `close()`              | `Promise<void>`  | Close the connection                               |

### Explicit Configuration

```typescript
import { Stitch, StitchToolClient } from "@google/stitch-sdk";

const client = new StitchToolClient({
  apiKey: "your-api-key",
  baseUrl: "https://stitch.googleapis.com/mcp",
  timeout: 300_000,
});

const sdk = new Stitch(client);
const projects = await sdk.projects();
```

| Option        | Env Variable           | Description                                                   |
| ------------- | ---------------------- | ------------------------------------------------------------- |
| `apiKey`      | `STITCH_API_KEY`       | API key for authentication                                    |
| `accessToken` | `STITCH_ACCESS_TOKEN`  | OAuth access token                                            |
| `projectId`   | `GOOGLE_CLOUD_PROJECT` | GCP project ID (required with OAuth)                          |
| `baseUrl`     | —                      | MCP server URL (default: `https://stitch.googleapis.com/mcp`) |
| `timeout`     | —                      | Request timeout in ms (default: 300000)                       |
