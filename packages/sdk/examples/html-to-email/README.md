# HTML Email from Design

This example demonstrates an Agent CLI tool that generates an email design and processes its HTML into an email-ready format with inlined CSS.

## Form Factor
**Agent CLI (Tier 3)**

## Overview
The Stitch SDK generates designs using modern CSS features. Email clients, however, have limited CSS support and often require inline styles. This example provides a CLI tool that agents can use to:

1.  Generate an email design from a prompt.
2.  Fetch the resulting HTML.
3.  Process the HTML to inline CSS (e.g., using a tool like `juice`), making it compatible with most email clients.

## Usage (Agent)
Agents should read `SKILL.md` to learn how to structure prompts for email generation (e.g., single column layouts, simple styling).

```bash
# Example usage by an agent:
# stitch email --json '{"projectId": "...", "screenId": "...", "to": "user@example.com"}'
```
