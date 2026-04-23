# Next.js Integration Skill

This skill teaches you how to convert Stitch HTML screens into Next.js pages.

## Goal
The goal is to take the HTML output from a Stitch UI generation and integrate it into a Next.js application framework.

## How it works

1. Use `@google/stitch-sdk` to generate a UI screen.
2. Fetch the HTML output from the screen (`screen.getHtml()`).
3. Parse the HTML to extract the Tailwind configuration block (`<script id="tailwind-config">`).
4. Extract Google Fonts links from the `<head>` of the HTML.
5. Create a `tailwind.config.ts` mapping the Stitch Tailwind CDN configuration to a local configuration.
6. Create `layout.tsx` (or `_document.tsx` depending on App or Pages router) to include the extracted Google Fonts.
7. Adapt the body of the HTML into Next.js JSX conventions (e.g., replace `<img>` with `<Image>` from `next/image` where applicable, convert `class` to `className`, replace `<a>` with `<Link>`).
8. Create a new Next.js page (e.g., `app/page.tsx` or `pages/index.tsx`) containing the adapted JSX component.

## Tools
* `scripts/scaffold-nextjs.ts` - Helper script that downloads a Stitch screen, parses the HTML, extracts assets, and writes them into a Next.js App Router structure.

## Agent Instructions

When tasked with generating a Next.js page from a design:
1. Ensure the user has provided a prompt or an existing `projectId` and `screenId`.
2. Provide standard Next.js scaffold setup or run `scaffold-nextjs.ts`.
3. If using Next.js App router, follow mapping instructions below.

### Mapping rules for Next.js

1. **`tailwind-config`:** The JSON object in `<script id="tailwind-config">tailwind.config = { theme: { ... } }</script>` should be parsed and converted into `tailwind.config.ts`. You must ensure that the output is valid TypeScript/JavaScript.

2. **Google Fonts:** Extract any `<link>` tags with `href` pointing to `fonts.googleapis.com`. Add them to the `<head>` in `app/layout.tsx`. If using Next.js 13+, ideally use `next/font/google`.

3. **JSX Conversion:**
    *   Change `class=` to `className=`.
    *   Change `for=` to `htmlFor=`.
    *   Convert inline styles from `style="color: red; margin-top: 10px;"` to React style objects `style={{ color: 'red', marginTop: '10px' }}`.
    *   Ensure all self-closing tags (e.g., `<img>`, `<input>`, `<br>`, `<hr>`) are properly closed with `/>`.
    *   Replace hardcoded `<img>` tags with Next.js `<Image>` components where appropriate (requires configuring `next.config.js` for remote patterns if images are from external URLs like `lh3.googleusercontent.com` or Unsplash). For simple icons or SVG strings, keep them as is.
    *   Replace `<a>` tags for internal navigation with `<Link>` from `next/link`.

### Using the helper script

You can execute the helper script to automate the heavy lifting:

```bash
bun scripts/scaffold-nextjs.ts --projectId <projectId> --screenId <screenId> --outDir ./my-next-app
```
