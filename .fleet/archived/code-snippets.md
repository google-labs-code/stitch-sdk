---
milestone: "1"
---
# Use-Case Code Snippets

Create runnable TypeScript code snippets that demonstrate the Stitch SDK (`@google/stitch-sdk`) from a user's perspective. Each snippet tells a short story — a developer trying to accomplish something real. Snippets live in `packages/sdk/examples/` as standalone `.ts` files using top-level `await`.

## Diagnostics

Run these before writing any snippets. They teach you what the SDK exposes.

### Learn the public API surface

```bash
cat packages/sdk/src/index.ts
```

This shows every export. The SDK has three modalities:
1. **Domain classes** — `Stitch`, `Project`, `Screen` (generated from `generated/src/`)
2. **Singleton** — `stitch` (pre-configured instance, reads `STITCH_API_KEY` from env)
3. **AI SDK adapter** — `stitchTools()` (returns tools for Vercel AI SDK `generateText`)

### Learn the domain methods

```bash
cat packages/sdk/generated/src/stitch.ts
cat packages/sdk/generated/src/project.ts
cat packages/sdk/generated/src/screen.ts
```

These show every method on each domain class, their parameters, and return types. The domain map that drives code generation is at `packages/sdk/generated/domain-map.json`.

### Learn the tool client

```bash
cat packages/sdk/src/client.ts
```

This shows `StitchToolClient` — the low-level MCP client. The singleton `stitch` delegates to this. Key methods: `callTool(name, args)`, `listTools()`, `connect()`, `close()`.

### Learn the error types

```bash
cat packages/sdk/src/spec/errors.ts
```

This shows `StitchError` and `StitchErrorCode`. Every domain method throws `StitchError` on failure.

### Learn the AI SDK adapter

```bash
cat packages/sdk/src/tools-adapter.ts
```

This shows `stitchTools()` — how Stitch MCP tools become Vercel AI SDK `dynamicTool` instances.

### Learn the config schema

```bash
cat packages/sdk/src/spec/client.ts
```

This shows `StitchConfigSchema` (Zod) — what environment variables and constructor options are available.

### Inspect real output shapes (requires STITCH_API_KEY)

```bash
STITCH_API_KEY=$STITCH_API_KEY bun -e '
import { stitch } from "./packages/sdk/dist/src/index.js";
const projects = await stitch.projects();
console.log("Projects:", projects.length);
if (projects.length > 0) {
  const p = projects[0];
  console.log("Project keys:", Object.keys(p));
  const screens = await p.screens();
  console.log("Screens:", screens.length);
  if (screens.length > 0) {
    const s = screens[0];
    console.log("Screen keys:", Object.keys(s));
    const html = await s.getHtml();
    console.log("getHtml() type:", typeof html, "length:", html?.length);
    const img = await s.getImage();
    console.log("getImage() type:", typeof img, "length:", img?.length);
  }
}
'
```

### Inspect HTML structure (requires STITCH_API_KEY)

```bash
STITCH_API_KEY=$STITCH_API_KEY bun -e '
import { stitch } from "./packages/sdk/dist/src/index.js";
const projects = await stitch.projects();
const p = projects[0];
const screens = await p.screens();
const s = screens[0];
const htmlUrl = await s.getHtml();
const resp = await fetch(htmlUrl);
const html = await resp.text();
const config = html.match(/<script id="tailwind-config">([\s\S]*?)<\/script>/);
const fonts = html.match(/<link[^>]*fonts\.googleapis\.com[^>]*>/g) ?? [];
console.log("HTML length:", html.length);
console.log("Tailwind config:", config ? "present" : "absent");
console.log("Google Fonts links:", fonts.length);
if (config) console.log("Config content:", config[1]);
'
```

## Tools

These are for building, verifying, and running snippets.

```bash
# Build the SDK (required before running snippets that import from dist/)
npm run build

# Type check
cd packages/sdk && npx tsc --noEmit

# Run a single snippet
STITCH_API_KEY=$STITCH_API_KEY bun packages/sdk/examples/<snippet>.ts

# Run all unit tests
npm run test

# Check existing snippets
find packages/sdk/examples -name "*.ts" -exec head -5 {} +
```

## Assessment Hints

Start by running the **Diagnostics** above. Read the source files to understand the SDK's public API. Identify the distinct **user journeys** the API enables — not just individual methods, but the multi-step workflows a developer would actually follow.

Each snippet covers a distinct user journey. Organize by scenario, not by API method. Each snippet should:

- Start with a JSDoc comment describing **what the user is trying to accomplish**
- Use the `stitch` singleton for the common case (reads `STITCH_API_KEY` from env)
- Use top-level `await` — no `main()` wrapper
- Include realistic variable names and `console.log` statements that show what a developer would care about
- Handle errors a real user would encounter
- End with a clear outcome the user can verify

Here are starting points for inspiration, but prioritize what you discover through the diagnostics — the SDK may support compelling workflows beyond these:

- **Getting started** — Use `stitch.project(id)` to reference a project, generate a screen, retrieve HTML and screenshot URLs
- **Creating a project** — Use `stitch.callTool("create_project", ...)` to create a project, then use the identity map to work with it
- **Design iteration** — Generate a screen, edit it, generate variants, compare results
- **Browsing designs** — List projects and screens, download HTML to local files
- **AI agent** — Use `stitchTools()` with Vercel AI SDK to let an LLM generate and iterate on designs
- **Error handling** — Handle `StitchError` for common scenarios like invalid project IDs

Before creating a new snippet, review the existing files in `packages/sdk/examples/` to ensure the use case is genuinely distinct from what already exists.

## Snippet Structure

Snippets that call the live API should import the shared gate helper:

**`packages/sdk/examples/_require-key.ts`** (shared, not a snippet itself):
```typescript
if (!process.env.STITCH_API_KEY) {
  console.log("⏭️  Set STITCH_API_KEY to run this snippet.");
  console.log("   STITCH_API_KEY=your-key bun", process.argv[1]);
  process.exit(0);
}
```

Each snippet file follows this pattern:

```typescript
/**
 * <What the user is trying to accomplish>.
 *
 * Usage:
 *   STITCH_API_KEY=your-key bun packages/sdk/examples/<filename>.ts
 */
import "./_require-key.js";
import { stitch } from "@google/stitch-sdk";

const project = stitch.project("your-project-id");
const screen = await project.generate("A login page");
const html = await screen.getHtml();
console.log("HTML URL:", html);
```

Keep snippets under 80 lines. Prefer clarity over cleverness — a developer new to Stitch should understand every line. Use top-level `await` throughout.

## Insight Hints

After creating snippets, report:
- Which SDK methods are covered by at least one snippet and which are uncovered
- Any API capabilities (from `stitch.listTools()` or the domain-map) that would make compelling use cases but aren't represented yet
- Whether the HTML output shapes (Tailwind config, Google Fonts, Material Symbols) suggest additional snippet ideas

## Verification

Each snippet that creates resources should create its own project. Read-only snippets (listing, browsing) work against existing state.

Run each snippet against the live API:

```bash
STITCH_API_KEY=$STITCH_API_KEY bun packages/sdk/examples/getting-started.ts
STITCH_API_KEY=$STITCH_API_KEY bun packages/sdk/examples/design-iteration.ts
STITCH_API_KEY=$STITCH_API_KEY bun packages/sdk/examples/browse-designs.ts
```

Each snippet should run to completion without errors and produce meaningful output to stdout.

### When something goes wrong

If a snippet fails, determine whether the issue is in the snippet or in the SDK:

- **Snippet bug** (wrong method name, missing import, bad argument) — fix the snippet and re-run.
- **SDK bug** (a field returns `undefined` when the API populates it, an endpoint returns an unexpected status, or projection logic crashes on valid API data) — write a detailed report:
  ```bash
  cat > /tmp/bug-report.md << 'EOF'
  ## Steps to Reproduce
  The snippet file and the exact command used to run it.

  ## Expected Behavior
  What should have happened.

  ## Actual Behavior
  What actually happened, including the full stack trace.

  ## Environment
  - Node version: (output of node --version)
  - Bun version: (output of bun --version)
  - SDK version: (from packages/sdk/package.json)

  ## Additional Context
  Any other observations — response payloads, screen data shapes, related API quirks.
  EOF
  ```

  Before filing, redact API keys or tokens that may appear in stack traces or HTTP logs.

## Constraints

- Each snippet must be a self-contained, runnable `.ts` file
- Use top-level `await` — no `main()` wrappers or IIFEs
- Use only the public SDK API (`import { ... } from "@google/stitch-sdk"`)
- Include a JSDoc comment with a Usage section showing how to run it
- Gate on `STITCH_API_KEY` — snippets should print their expected output shape and exit gracefully when the key is absent
- Cross-reference existing snippets in `packages/sdk/examples/` before creating new ones — each file should serve a unique user story