# Basic Design Generation

A simple, deterministic script demonstrating the most common workflow in the Stitch SDK: creating a project, generating a screen from a prompt, and retrieving the resulting HTML and image URLs.

This is a Tier 1 (Script) example. It does not require an agent or LLM — it just makes API calls.

## Prerequisites

- Set your `STITCH_API_KEY` environment variable.

## Run the Example

```bash
bun index.ts
```

## What it does

1. Calls `create_project` to get a new project ID.
2. Instantiates a domain class: `stitch.project(id)`.
3. Calls `project.generate(prompt)` to create a UI.
4. Calls `screen.getHtml()` and `screen.getImage()` to retrieve download URLs for the artifacts.
