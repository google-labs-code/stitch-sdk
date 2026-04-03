---
milestone: "1"
---

## Add Practical Stitch SDK Examples

Add practical examples demonstrating how to use the Stitch SDK (`@google/stitch-sdk`) to generate UI designs from text prompts and integrate the resulting HTML, Tailwind CSS, images, and design tokens into real applications and frameworks.

## SDK Overview

The Stitch SDK generates AI-powered UI screens and returns:
- **HTML** with embedded Tailwind CDN (`cdn.tailwindcss.com`) + a `<script id="tailwind-config">` block containing custom theme colors, fonts, background images, and other design tokens
- **Google Fonts** as `<link>` tags in the HTML `<head>` — preconnect + stylesheet
- **Screenshot images** as CDN URLs (via `lh3.googleusercontent.com`)
- **Material Symbols** icon font referenced in some designs

The SDK has three modalities:
1. **Domain classes** — `stitch.project(id)` → `project.generate(prompt)` → `screen.getHtml()` / `screen.getImage()`
2. **Tool client** — `stitch.callTool("create_project", { title })` / `stitch.listTools()`
3. **AI SDK adapter** — `stitchTools()` returns tools compatible with Vercel AI SDK's `generateText()`

## File Structure

```
packages/sdk/examples/
├── basic-design/                # Script
│   ├── README.md
│   └── index.ts
├── browse-and-export/           # Script
│   ├── README.md
│   └── index.ts
├── batch-generation/            # Script
│   ├── README.md
│   └── index.ts
├── screenshot-gallery/          # Script
│   ├── README.md
│   └── index.ts
├── design-to-react/             # Agent Skill
│   ├── SKILL.md
│   ├── scripts/
│   │   └── extract-assets.ts
│   └── README.md
├── design-iteration/            # Agent Skill
│   ├── SKILL.md
│   └── README.md
├── nextjs-integration/          # Agent Skill
│   ├── SKILL.md
│   ├── scripts/
│   │   └── scaffold-nextjs.ts
│   └── README.md
├── vite-preview/                # Agent Skill
│   ├── SKILL.md
│   ├── scripts/
│   │   └── extract-theme.ts
│   └── README.md
├── astro-multipage/             # Agent Skill
│   ├── SKILL.md
│   └── README.md
├── design-system-extraction/    # Agent Skill
│   ├── SKILL.md
│   ├── scripts/
│   │   └── extract-tokens.ts
│   └── README.md
├── stitch-cli/                  # Agent CLI
│   ├── SKILL.md
│   ├── src/
│   │   └── cli.ts
│   └── README.md
├── html-to-email/               # Agent CLI
│   ├── SKILL.md
│   └── README.md
├── mcp-server/                  # MCP Server
│   ├── SKILL.md
│   └── README.md
├── tool-filtering/              # Custom AI Workflow
│   ├── README.md
│   └── index.ts
└── ci-visual-testing/           # Script + Agent Skill
    ├── SKILL.md
    ├── scripts/
    │   └── ci-runner.ts
    └── README.md
```

## Diagnostic Tools

These tools should be run at the beginning of the agentic process to explore the SDK's capabilities, understand current data shapes, and verify the environment before writing examples.

### SDK Environment Check

```bash
bun -e '
import { stitch } from "./packages/sdk/dist/src/index.js";
const projects = await stitch.projects();
console.log(`SDK connected. ${projects.length} projects accessible.`);
if (projects.length > 0) {
  const p = projects[0];
  console.log(`Sample project ID: ${p.id}`);
  const screens = await p.screens();
  console.log(`Screens: ${screens.length}`);
}
'
```

Purpose: Verifies `STITCH_API_KEY` is set, SDK is built, and API is reachable.

### HTML Output Shape Inspector

```bash
bun -e '
import { stitch } from "./packages/sdk/dist/src/index.js";
const project = stitch.project("3574701011857029044");
const screens = await project.screens();
const screen = screens[0];
const htmlUrl = await screen.getHtml();
const resp = await fetch(htmlUrl);
const html = await resp.text();
const configMatch = html.match(/<script id="tailwind-config">([\s\S]*?)<\/script>/);
const fonts = html.match(/<link[^>]*fonts\.googleapis\.com[^>]*>/g) ?? [];
const scripts = html.match(/<script[^>]*src="([^"]+)"[^>]*>/g) ?? [];
console.log("HTML length:", html.length);
console.log("Tailwind config:", configMatch ? "present" : "MISSING");
console.log("Google Fonts links:", fonts.length);
console.log("External scripts:", scripts.length);
console.log("\nTailwind config content:");
console.log(configMatch?.[1] ?? "N/A");
console.log("\nFont links:");
fonts.forEach(f => console.log("  " + f));
'
```

Purpose: Inspects the structure of Stitch-generated HTML. Essential for understanding what design tokens, fonts, and assets are available to extract and integrate.

### Screen Data Shape Inspector

```bash
bun -e '
import { stitch } from "./packages/sdk/dist/src/index.js";
const project = stitch.project("3574701011857029044");
const screens = await project.screens();
const screen = screens[0];
console.log("Screen keys:", Object.keys(screen));
console.log("screen.id:", screen.id);
console.log("screen.projectId:", screen.projectId);
const html = await screen.getHtml();
console.log("getHtml() type:", typeof html, "length:", html?.length);
const img = await screen.getImage();
console.log("getImage() type:", typeof img, "length:", img?.length);
if (img) console.log("Image URL prefix:", img.slice(0, 60));
'
```

Purpose: Documents the Screen object shape and what `getHtml()` and `getImage()` return (download URLs vs direct content).

### Available MCP Tools Inspector

```bash
bun -e '
import { stitch } from "./packages/sdk/dist/src/index.js";
const tools = await stitch.listTools();
console.log("Available tools:", tools.length);
tools.forEach(t => console.log(`  ${t.name}: ${(t.description ?? "").slice(0, 100)}`));
'
```

Purpose: Lists all available Stitch MCP tools. Useful for understanding what operations are possible via `callTool()` and `stitchTools()`.

### AI SDK Tools Inspector

```bash
bun -e '
import { stitchTools } from "./packages/sdk/dist/src/index.js";
const tools = stitchTools();
const names = Object.keys(tools);
console.log("stitchTools() returns", names.length, "tools:");
names.forEach(n => console.log("  " + n));
'
```

Purpose: Verifies the AI SDK adapter works and shows which tools are available for `generateText()`.

## Regular Tools

These tools are for building, testing, and verifying examples during development.

### Build

```bash
npm run build
```

### Unit Tests

```bash
npm run test
```

### TypeScript Type Check

```bash
cd packages/sdk && npx tsc --noEmit
```

### Run a Single Example

```bash
cd packages/sdk/examples/<example-name> && bun index.ts
```

### Validate Lock Integrity

```bash
npm run validate:generated
```

## Prioritization

Each example is evaluated for whether it needs agent intelligence in the loop and, if so, what form factor best fits. Form factors in order of preference:

1. **Agent CLI** — A CLI tool with `--json` input, schema introspection, and agent-first ergonomics
2. **Agent Skill** — A `SKILL.md` with scripts and references that teaches an agent how to use the SDK
3. **MCP Server** — Exposes Stitch SDK operations as MCP tools for any agent
4. **Custom AI Workflow** — Direct AI SDK integration (least preferred, most brittle)

> [!IMPORTANT]
> If an example is just a linear script with no decision-making, it doesn't need an agent — it's a **Script**. Scripts are valid examples but should not be dressed up as agent workflows.

### Tier 1: Scripts (No Agent Needed)
These are deterministic — the SDK calls are fixed and the output is predictable. No intelligence required.

1. **Basic Design Generation** (`basic-design/`) — **Script.** `project.generate(prompt)` → `screen.getHtml()` → `screen.getImage()`. This is three SDK calls. An agent adds nothing — the inputs are known and the output is a URL. Show `callTool("create_project", ...)` for project creation.

2. **Browse and Export** (`browse-and-export/`) — **Script.** List projects, list screens, download HTML and screenshots to local files. This is iteration + filesystem writes. No decisions to make.

3. **Batch Design Generation** (`batch-generation/`) — **Script.** Read a list of prompts from a JSON/CSV file, generate screens in parallel with `Promise.allSettled`, write a report. The "intelligence" is in the prompts, not the orchestration.

4. **Screenshot Gallery** (`screenshot-gallery/`) — **Script.** Iterate screens, collect image URLs, generate an HTML page. A glorified for-loop. No agent needed.

### Tier 2: Agent Skills (Agent Reads Instructions, Runs SDK)
These require an agent to make design decisions, interpret HTML structure, or adapt output to a target framework. The best form factor is an **Agent Skill**: a `SKILL.md` that teaches the agent _how_ to use the Stitch SDK for that specific workflow, with helper scripts in `scripts/`.

5. **Design to React Component** (`design-to-react/`) — **Agent Skill.** The agent must interpret Stitch HTML (varying structure per design), extract the Tailwind config block, identify semantic sections, and produce a modular React component with a Props interface. This is fundamentally a translation task that requires intelligence. The skill should include a `scripts/extract-assets.ts` helper that handles HTML parsing (extracting `<script id="tailwind-config">`, Google Fonts links), and a `SKILL.md` that teaches the agent how to transform the HTML body into JSX with Tailwind classes.

6. **Design Iteration Workflow** (`design-iteration/`) — **Agent Skill.** Generate → evaluate the screenshot → decide what to edit → `screen.edit(prompt)` → evaluate again → optionally generate variants. The loop requires judgment about whether the design meets the user's intent. A skill teaches the agent how to use `screen.edit()` and `screen.variants()` and when to stop iterating.

7. **Next.js Page from Design** (`nextjs-integration/`) — **Agent Skill.** The agent must scaffold a Next.js project structure, map Stitch's Tailwind CDN config to a local `tailwind.config.ts`, inject Google Fonts into `_document.tsx` or `layout.tsx`, and adapt the HTML body into Next.js JSX conventions (`next/image`, `next/link`, CSS modules vs Tailwind). These are design decisions that vary per project. The skill provides the mapping rules; the agent applies them.

8. **Vite + Tailwind v4 Preview App** (`vite-preview/`) — **Agent Skill.** Similar to Next.js but targeting Vite. The agent must convert Stitch's CDN Tailwind config into Tailwind v4's `@theme` CSS syntax, set up `@tailwindcss/vite` and `@vitejs/plugin-react`, and decide how to split the HTML into components. Include a `scripts/extract-theme.ts` that converts the `tailwind.config` JS object into a Tailwind v4 `@theme` block.

9. **Astro Site from Screens** (`astro-multipage/`) — **Agent Skill.** Generate multiple screens (landing, pricing, about), map each to an Astro page route, extract a shared theme from the first screen's config, build an Astro layout with Google Fonts. The agent decides how to decompose screens into pages and which config becomes the canonical theme. The skill includes reference docs on Astro's content collections and layout patterns.

10. **Design System Extraction** (`design-system-extraction/`) — **Agent Skill.** Parse Tailwind configs from multiple screens, reconcile conflicting color names or font stacks, and output a unified design token file (CSS custom properties or W3C token JSON). The reconciliation step requires judgment — two screens may define `primary` as different colors. The skill teaches the agent how to merge and deduplicate.

### Tier 3: Agent CLI Tools (Expose SDK Operations for Agents)
These are best as CLI tools with `--json` input/output, schema introspection, and agent-first design (per the Agent CLI best practices).

11. **Stitch CLI** (`stitch-cli/`) — **Agent CLI.** A CLI wrapper around the Stitch SDK with agent-first ergonomics: `stitch generate --json '{"projectId": "...", "prompt": "..."}'`, `stitch export --json '{"projectId": "...", "format": "html"}'`, `stitch extract-theme --json '{"projectId": "...", "screenId": "..."}'`. Include `--output json` for machine-readable output, schema introspection via `stitch schema generate`, and input hardening against hallucinated project/screen IDs. Ship with `SKILL.md` files so agents discover it naturally.

12. **HTML Email from Design** (`html-to-email/`) — **Agent CLI.** `stitch email --json '{"projectId": "...", "screenId": "...", "to": "user@example.com"}'`. The CLI generates the design, fetches the HTML, inlines CSS via `juice`, and outputs email-ready HTML. An agent is needed to adjust the design prompt for email constraints (single column, inline styles, no Tailwind CDN) but the CSS inlining is deterministic. The CLI handles the deterministic part; the agent handles prompt crafting.

### Tier 4: MCP Servers (Expose SDK to Any Agent Framework)
These expose Stitch SDK operations as MCP tools, making them available to any agent that speaks MCP.

13. **Stitch Design MCP Server** (`mcp-server/`) — **MCP Server.** Wrap the Stitch SDK as an MCP server with tools like `generate_and_extract` (generates a screen and returns extracted theme + HTML body + screenshot URL in one call), `compare_themes` (generates variants and diffs their configs), and `scaffold_project` (generates multiple screens and returns them as a page manifest). These compound tools reduce agent round-trips compared to calling raw Stitch MCP tools individually.

### Tier 5: Custom AI Workflows (Least Preferred)
Only use when the AI SDK adapter is the _point_ of the example, not when an agent skill or CLI would work equally well.

14. **Tool Filtering** (`tool-filtering/`) — **Custom AI Workflow.** This is specifically demonstrating `stitchTools({ include: [...] })`, which is an AI SDK feature. The example's purpose is showing how to restrict which tools an LLM can call. This is the one case where AI SDK integration is the subject, not just a means.

15. **CI Visual Testing** (`ci-visual-testing/`) — **Script + Agent Skill hybrid.** The CI script is deterministic (regenerate design, capture screenshot URL). But comparing the screenshot to a baseline and deciding if the visual diff is acceptable requires judgment. Provide a `SKILL.md` that teaches an agent how to evaluate visual diffs from Stitch screenshot URLs, with the actual CI runner as a script in `scripts/`.

## Key Integration Points

When creating examples, leverage these specific characteristics of Stitch output:

| Stitch Output | Integration Opportunity |
|---|---|
| `<script id="tailwind-config">` block | Extract as `tailwind.config.ts` for any Tailwind project |
| Google Fonts `<link>` tags | Include in any HTML `<head>`, Next.js `_document`, or Astro layout |
| Tailwind CDN (`cdn.tailwindcss.com`) | Replace with local Tailwind v4 via `@tailwindcss/vite` or `postcss` |
| Material Symbols Outlined font | Import in component libraries |
| Screenshot CDN URLs | Use as preview images, OG images, or visual regression baselines |
| Full HTML documents | Embed in iframes, parse into JSX, or serve as static pages |
| Color palette in config | Extract for CSS custom properties, Figma tokens, or style dictionaries |
| Custom font families | Map to Google Fonts API downloads for self-hosting |

## Steps

1. Run the **Diagnostic Tools** to verify the environment and understand current HTML output shapes.
2. Inventory any existing examples in `packages/sdk/examples/` and identify gaps against the prioritization above.
3. For each new example:
   a. Create the directory and files following the file structure convention.
   b. Write a self-contained `index.ts` that imports from `@google/stitch-sdk`.
   c. Verify it builds and runs: `cd packages/sdk/examples/<name> && bun index.ts`.
   d. Write a `README.md` documenting what the example does, prerequisites, and how to run it.
4. Run **Regular Tools** (build, test, typecheck) to verify nothing is broken.
5. Add links to new examples in the SDK README's examples section.
