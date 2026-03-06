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
import { stitch } from '@google/stitch-sdk';

const project = await stitch.createProject("My App");
const screen = await project.generate("A settings page with dark theme");
const html = await screen.getHtml();
console.log(html); // Full HTML document
```

The `stitch` singleton reads `STITCH_API_KEY` from the environment and connects on first use — no setup code required.

## Working with Projects

```typescript
import { stitch } from '@google/stitch-sdk';

// List all projects
const projects = await stitch.projects();

// Access a specific project by ID (no network call)
const project = stitch.project("projects/123");

// Create a new project
const project = await stitch.createProject("My App");
```

## Generating and Iterating on Screens

```typescript
// Generate a new screen from a prompt
const screen = await project.generate("Login page with email and password fields");

// Edit an existing screen
const edited = await screen.edit("Make the background dark and add a subtitle");

// Generate variants of a screen
const variants = await screen.variants("Try different color schemes", { count: 2 });
```

## Retrieving Screen Assets

```typescript
// Get screen HTML
const html = await screen.getHtml();

// Get screen image URL
const imageUrl = await screen.getImage();
```

Both methods use cached data from the generation response when available, falling back to an API call when needed.

## Dynamic Tool Client (for agents)

For agents and orchestration scripts that forward JSON payloads to MCP tools:

```typescript
import { StitchToolClient } from '@google/stitch-sdk';

const client = new StitchToolClient(); // reads STITCH_API_KEY from env
const tools = await client.listTools();
const result = await client.callTool("generate_screen_from_text", {
  projectId: "123", prompt: "A login page"
});
```

## Error Handling

All SDK methods throw `StitchError` on failure. Use try/catch:

```typescript
import { stitch, StitchError } from '@google/stitch-sdk';

try {
  const screen = await project.generate("A dashboard");
} catch (e) {
  if (e instanceof StitchError) {
    console.log(e.code);        // "AUTH_FAILED", "NOT_FOUND", etc.
    console.log(e.message);     // Human-readable description
    console.log(e.recoverable); // Whether retrying might succeed
  }
}
```

Error codes: `AUTH_FAILED`, `NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `NETWORK_ERROR`, `VALIDATION_ERROR`, `UNKNOWN_ERROR`

## API Reference

### Stitch Class

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | `Promise<void>` | Connect to the Stitch MCP server |
| `projects()` | `Promise<Project[]>` | List all projects |
| `project(id)` | `Project` | Get a project handle by ID (no network call) |
| `createProject(title)` | `Promise<Project>` | Create a new project |

### Project Class

| Method | Returns | Description |
|--------|---------|-------------|
| `generate(prompt, deviceType?)` | `Promise<Screen>` | Generate a screen from a text prompt |
| `screens()` | `Promise<Screen[]>` | List all screens in the project |

### Screen Class

| Method | Returns | Description |
|--------|---------|-------------|
| `getHtml()` | `Promise<string>` | Fetch the screen's HTML code |
| `getImage()` | `Promise<string>` | Fetch the screen's image URL |
| `edit(prompt)` | `Promise<Screen>` | Edit the screen using a text prompt |
| `variants(prompt, options?)` | `Promise<Screen[]>` | Generate variants of the screen |

### StitchToolClient (for agents)

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | `Promise<void>` | Establish MCP connection |
| `callTool(name, args)` | `Promise<T>` | Call any MCP tool by name |
| `listTools()` | `Promise<Tools>` | Discover available tools |
| `close()` | `Promise<void>` | Close the connection |

### Explicit Configuration

```typescript
import { Stitch } from '@google/stitch-sdk';

// API Key
const stitch = new Stitch({ apiKey: "your-api-key" });

// OAuth
const stitch = new Stitch({
  accessToken: "ya29.your-token",
  projectId: "your-gcp-project-id",
});
```

| Option | Env Variable | Description |
|---|---|---|
| `apiKey` | `STITCH_API_KEY` | API key for authentication |
| `accessToken` | `STITCH_ACCESS_TOKEN` | OAuth access token |
| `projectId` | `GOOGLE_CLOUD_PROJECT` | GCP project ID (required with OAuth) |
| `baseUrl` | — | MCP server URL (default: `https://stitch.googleapis.com/mcp`) |
| `timeout` | — | Request timeout in ms (default: 300000) |
