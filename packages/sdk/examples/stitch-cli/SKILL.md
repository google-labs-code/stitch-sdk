# Stitch CLI Skill

This skill teaches you how to use the `stitch-cli` to interact with the Stitch API. The CLI is designed to take structured JSON input and output JSON, making it ideal for agentic usage.

## Available Commands

### 1. `schema <command>`
Outputs the expected JSON schema for a command.
- `command`: `generate`, `export`, or `extract-theme`

Example:
```bash
bun src/cli.ts schema generate
```

### 2. `generate --json '<json>'`
Generates a new screen in a project.
- Input JSON shape: `{"projectId": "string", "prompt": "string", "deviceType": "MOBILE" | "DESKTOP" | "TABLET" | "AGNOSTIC" (optional)}`
- Returns: JSON object containing the new `screenId`.

Example:
```bash
bun src/cli.ts generate --json '{"projectId": "123", "prompt": "A simple login form"}'
```

### 3. `export --json '<json>'`
Gets the download URL for a screen's HTML or screenshot image.
- Input JSON shape: `{"projectId": "string", "screenId": "string", "format": "html" | "image"}`
- Returns: JSON object containing the download `url`.

Example:
```bash
bun src/cli.ts export --json '{"projectId": "123", "screenId": "abc", "format": "html"}'
```

### 4. `extract-theme --json '<json>'`
Extracts the Tailwind config from a screen's HTML.
- Input JSON shape: `{"projectId": "string", "screenId": "string"}`
- Returns: JSON object containing the `theme` string.

Example:
```bash
bun src/cli.ts extract-theme --json '{"projectId": "123", "screenId": "abc"}'
```

## Agent Best Practices
- Always check the schema using `schema <command>` if you are unsure of the required fields.
- Make sure to properly escape your JSON input string on the command line.
