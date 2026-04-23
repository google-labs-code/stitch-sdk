# Astro Multipage Site

This example demonstrates how an agent can use the Stitch SDK to generate multiple related screens and assemble them into a cohesive Astro multi-page site, sharing a unified Tailwind theme and typography.

## Overview

This is an **Agent Skill** example. It provides instructions in `SKILL.md` that teach an agent how to:
1. Generate multiple screens (e.g., landing page, pricing, about us) in the same project.
2. Extract the Tailwind configuration from the primary screen to serve as the shared theme for the Astro site.
3. Scaffold an Astro project structure.
4. Extract HTML content from each screen and map it to Astro page routes (`src/pages/*.astro`).
5. Extract Google Fonts and apply them to a shared layout component (`src/layouts/Layout.astro`).

## Files

*   `SKILL.md`: The instructions for the agent on how to perform the workflow.

## Usage (For Agents)

An agent should read `SKILL.md` to understand the process. The agent will then write the necessary scripts to automate the generation and integration using the `@google/stitch-sdk`.
