# Skill: Design to React Component

This skill teaches you how to use the Stitch SDK to generate a UI design from a prompt, and then convert that raw HTML and Tailwind output into a clean, reusable React component.

## Context

The Stitch SDK outputs raw HTML that includes:
-   Inline Tailwind CSS classes.
-   A Tailwind configuration object embedded in a `<script id="tailwind-config">` tag.
-   Google Fonts linked in the `<head>`.

To use this design in a React application, you must intelligently parse the HTML, extract the relevant configuration, and rewrite the markup as JSX.

## Workflow

When tasked with creating a React component from a design prompt, follow these steps:

1.  **Generate the Design and Extract Assets:**
    Use the provided `scripts/extract-assets.ts` helper script to generate the design and parse the output.

    ```bash
    # You may need to specify the prompt depending on how the script is built
    bun packages/sdk/examples/design-to-react/scripts/extract-assets.ts
    ```

    *Note: If the script is hardcoded for a specific prompt, you can use the MCP tools directly (`create_project` then `generate_screen`), fetch the HTML URL, and parse it manually.*

2.  **Review the Output:**
    The script (or your manual parsing) will output the raw HTML, the Tailwind configuration object, and any required Google Fonts links. Review these assets carefully.

3.  **Create the React Component:**
    Translate the raw HTML into a functional React component (`.tsx` or `.jsx`).

    *   **Convert HTML to JSX:** Change `class` to `className`, `for` to `htmlFor`, and self-close tags like `<img>` and `<input>`.
    *   **Identify Props:** Look at the content (text, image URLs, button labels) and extract them into a standard React `Props` interface. Do not hardcode content if it should be dynamic.
    *   **Modularize:** If the design is complex, break it down into smaller, logical sub-components.

4.  **Integrate Design Tokens:**
    *   Take the extracted Tailwind configuration and instruct the user on how to merge it into their project's `tailwind.config.ts` (or equivalent Tailwind v4 `@theme` block).
    *   Ensure the required Google Fonts are added to the project (e.g., in `index.html`, `_document.tsx`, or `layout.tsx`).

## Example Transformation

**Input (Raw HTML Snippet):**

```html
<div class="bg-[#1a1a1a] text-white p-6 rounded-lg font-['Inter']">
  <img src="https://lh3.googleusercontent.com/.../img.png" alt="Profile" class="w-16 h-16 rounded-full">
  <h2 class="text-xl font-bold mt-4">John Doe</h2>
  <p class="text-gray-400">Software Engineer</p>
</div>
```

**Output (React Component):**

```tsx
import React from 'react';

interface ProfileCardProps {
  name: string;
  role: string;
  imageUrl: string;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({ name, role, imageUrl }) => {
  return (
    <div className="bg-[#1a1a1a] text-white p-6 rounded-lg font-['Inter']">
      <img src={imageUrl} alt={`Profile for ${name}`} className="w-16 h-16 rounded-full" />
      <h2 className="text-xl font-bold mt-4">{name}</h2>
      <p className="text-gray-400">{role}</p>
    </div>
  );
};
```
