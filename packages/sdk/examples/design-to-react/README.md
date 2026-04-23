# Design to React Component

This is an **Agent Skill** example. It demonstrates how an AI agent can use the Stitch SDK to generate a UI design and then convert that raw HTML/Tailwind output into a clean, modular React component.

Converting raw design output to React requires intelligence—interpreting the semantic structure of the HTML, extracting the Tailwind configuration, and mapping it to JSX props. Because it requires judgment, this workflow is best suited for an Agent Skill rather than a static script.

## Files

- `SKILL.md` — Instructions you can give to an LLM agent to teach it this workflow.
- `scripts/extract-assets.ts` — A deterministic helper script the agent can run to extract the HTML and design tokens.

## Prerequisites

1.  A valid `STITCH_API_KEY` set in your environment.
2.  Install the required dependencies from the root directory: `bun install`.

## How to run

Since this is an Agent Skill, you don't "run" it directly. Instead, you point an agent at the `SKILL.md` file.

To test the helper script directly:

```bash
cd packages/sdk/examples/design-to-react
bun scripts/extract-assets.ts
```

This will generate a design, download the HTML, and parse out the Tailwind configuration and Google Fonts.
