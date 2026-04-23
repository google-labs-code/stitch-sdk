# Skill: Extract a Design System from Multiple Screens

This skill teaches an agent how to parse Tailwind configurations from multiple Stitch SDK generated screens, reconcile conflicting design tokens (colors, fonts), and output a unified design token file.

## Why this is useful

When you generate multiple screens for a single application, each screen may produce a slightly different `<script id="tailwind-config">` block. To maintain visual consistency across your application, you need to extract the common design tokens, merge them, and resolve any conflicts (e.g., if one screen defines `primary` as `#3B82F6` and another as `#2563EB`).

## How to extract the design system

1.  **Generate multiple screens.**
    Generate several screens that represent different parts of your application (e.g., a landing page, a dashboard, a settings page).

2.  **Extract the Tailwind configuration from each screen.**
    Use the `getHtml()` method to get the screen's HTML, fetch the content, and parse out the `<script id="tailwind-config">` block. You can also extract Google Fonts links. See `scripts/extract-tokens.ts` for an example of this parsing.

3.  **Merge and Reconcile.**
    Parse the extracted Tailwind configurations into Javascript objects.
    You will need to reconcile conflicting tokens:
    *   **Colors:** If multiple screens define a color with the same name but different hex values, you must choose one (e.g., the one that appears most frequently, or the one from the "primary" screen) or rename them (e.g., `primary-landing`, `primary-dashboard`).
    *   **Fonts:** Merge font families. Ensure that all necessary Google Fonts are included.

4.  **Output the unified tokens.**
    Output the reconciled tokens in a format suitable for your project (e.g., a shared `tailwind.config.ts`, a CSS file with custom properties, or a JSON file for a design token system).

## Example Workflow

The `scripts/extract-tokens.ts` script demonstrates this workflow by:
1. Creating a project.
2. Generating a landing page and a dashboard page.
3. Extracting the Tailwind configs and Google Fonts from both.
4. Parsing the configs to find color and font definitions.
5. (Placeholder logic) Merging the configs and reporting conflicts.

## Instructions for Agents

When tasked with generating a consistent design system from multiple screens:
*   Always extract the Tailwind configuration from the HTML of each generated screen.
*   Compare the `theme.extend.colors` and `theme.extend.fontFamily` objects from each screen's configuration.
*   Implement a reconciliation strategy (e.g., prioritize the first screen's values, or ask the user to resolve conflicts).
*   Generate a unified configuration file that can be shared across all screens in the project.
