# Vite + Tailwind v4 Preview App

This example demonstrates how an agent can convert a generated design into a functional, live previewable app using **Vite** and **Tailwind CSS v4**.

It focuses on **Agent Skills**: teaching an agent how to ingest the Stitch SDK output (which uses a Tailwind v3 CDN config) and bridge it into a modern Vite + Tailwind v4 project by transforming the embedded JSON tokens into `@theme` CSS syntax.

## Why this is an "Agent Skill"

Converting a static design document with inline JSON design tokens into a functional modern framework isn't a deterministic, 1:1 mapping. An agent needs to:
- Interpret the HTML component tree to chunk out semantic parts of the UI if needed
- Understand mapping JSON config block syntax (v3) to a `@theme` CSS directive (v4)
- Handle fetching Google Fonts correctly and converting `<link>` tags into the right location within the Vite entrypoint `index.html`

## Files

- `SKILL.md`: The "prompt" or instructions given to the agent.
- `scripts/extract-theme.ts`: A deterministic utility script that parses the inline `<script id="tailwind-config">` block and outputs valid `@theme` directive CSS blocks for Tailwind v4.

## How it works

1. The agent reads the `SKILL.md` to understand its instructions.
2. It generates a design via the Stitch SDK (or uses an existing one).
3. The agent uses the provided `scripts/extract-theme.ts` to convert the design tokens (from the v3 JSON object) into valid v4 `@theme` CSS mappings.
4. The agent scaffolds a fresh Vite project and integrates the converted theme and HTML structure.

## Running the extraction script

```bash
# Extract theme from a specific screen ID
bun scripts/extract-theme.ts <screen-id>
```

(Ensure you have `STITCH_API_KEY` set in your environment if running against a live screen).
