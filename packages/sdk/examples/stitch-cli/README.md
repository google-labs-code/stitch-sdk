# Stitch CLI (Agent CLI)

This example demonstrates how to build an Agent CLI around the Stitch SDK. The CLI provides `--json` inputs and outputs, making it ideal for LLM-driven agents to use programmatically.

## Prerequisites

Set your Stitch API key:

```bash
export STITCH_API_KEY="your-api-key"
```

## Running the CLI

You can run the CLI directly with `bun`:

```bash
bun src/cli.ts --help
```

### Supported Commands

- `generate`: Generate a new screen in an existing project.
- `export`: Export the HTML or screenshot URL of an existing screen.
- `extract-theme`: Extract the Tailwind CSS theme config from a screen.
- `schema`: Output the expected JSON input schema for agents to read.

### Agentic Usage (`--json`)

The CLI is designed to take structured JSON input from agents and return structured JSON output.

**Schema Introspection:**
An agent can ask for the schema to understand what arguments are expected.
```bash
bun src/cli.ts schema generate
```

**Execution:**
```bash
bun src/cli.ts generate --json '{"projectId": "...", "prompt": "A modern dashboard"}'
```

**Extracting Theme:**
```bash
bun src/cli.ts extract-theme --json '{"projectId": "...", "screenId": "..."}'
```

**Exporting Results:**
```bash
bun src/cli.ts export --json '{"projectId": "...", "screenId": "...", "format": "html"}'
```
