# Astro Site from Screens

This skill teaches an agent how to use the `@google/stitch-sdk` to generate multiple related UI screens and integrate them into a multipage Astro site, sharing a unified Tailwind theme and typography.

## The Workflow

1.  **Generate Screens:** Use the Stitch SDK to generate screens for each required page (e.g., Landing, Pricing, About).
2.  **Extract Shared Theme:** Pick the primary screen (usually the landing page) and extract its `<script id="tailwind-config">` block to serve as the canonical `tailwind.config.mjs` for the entire Astro project.
3.  **Extract Shared Layout Assets:** Extract the Google Fonts `<link>` tags and Material Symbols imports to include in a shared Astro layout component (`src/layouts/Layout.astro`).
4.  **Map Screens to Pages:** For each generated screen, extract the inner `<body>` HTML and map it to an Astro page route (e.g., `src/pages/index.astro`, `src/pages/pricing.astro`).
5.  **Remove Inline SDK Scripts:** Strip out the inline Tailwind CDN scripts and font configurations from individual screen HTML before injecting them into Astro pages, relying instead on the global Astro layout and Tailwind build process.

## Stitch SDK Reference

```typescript
import { stitch } from "@google/stitch-sdk";

// 1. Generate screens in a project
const project = await stitch.createProject("My Multipage Site");
const landingScreen = await project.generate("A landing page for a SaaS product");
const pricingScreen = await project.generate("A pricing page with 3 tiers");

// 2. Fetch HTML to parse
const landingHtmlUrl = await landingScreen.getHtml();
const landingHtmlStr = await (await fetch(landingHtmlUrl)).text();
```

## Astro Reference Docs

### 1. Shared Layout (`src/layouts/Layout.astro`)
Use a shared layout to inject global dependencies like Google Fonts extracted from the Stitch HTML.

```astro
---
interface Props {
  title: string;
}
const { title } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>{title}</title>
    <!-- Inject Google Fonts extracted from Stitch HTML here -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body>
    <slot />
  </body>
</html>
```

### 2. Page Routes (`src/pages/*.astro`)
Map the `<body>` content of individual Stitch screens to page routes, wrapping them in the shared layout.

```astro
---
// src/pages/index.astro
import Layout from '../layouts/Layout.astro';
---
<Layout title="Landing Page">
  <!-- Inject the inner body HTML from the Stitch screen here -->
  <main class="min-h-screen bg-white">
    <nav class="flex items-center justify-between p-6">...</nav>
    <header class="text-center py-20">...</header>
  </main>
</Layout>
```

### 3. Tailwind Configuration (`tailwind.config.mjs`)
Extract the JS object from `<script id="tailwind-config">` in the Stitch HTML and export it for Astro's Tailwind integration.

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      // Inject theme config from Stitch here
      colors: {
        primary: '#4f46e5',
        // ...
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
```

### 4. Content Collections (Optional for dynamic content)
If generating structural templates, you can map content from `src/content/` to populate the designs dynamically.
```typescript
// src/content/config.ts
import { z, defineCollection } from 'astro:content';
const featureCollection = defineCollection({
  type: 'data',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    icon: z.string()
  })
});
export const collections = { 'features': featureCollection };
```
