---
name: stitch-sdk-bug-bash
description: Find bugs in the Stitch SDK using a real API key. Covers standard functional edges and tricky situations.
---

# Stitch SDK Bug Bash

This skill provides a framework and instructions for finding bugs in the Stitch SDK using a real API key. It guides you through exploring standard functional edge cases and tricky situations beyond the golden path.

---

## The Mindset: Adversarial Exploration

When using this skill, do not just verify that the SDK works. Try to break it!
-   Pass invalid or boundary parameters.
-   Attempt operations on deleted or stale handles.
-   Simulate unexpected API responses if possible or find edge cases where projection might fail.

---

## Surface Areas to Cover

### 1. Root & Initialization (`Stitch`)
-   **Zero Config**: Verify the singleton works without explicit config if `STITCH_API_KEY` is present.
-   **Invalid Config**: Pass an empty API key or invalid base URL to `StitchToolClient` and verify that the first call fails with a clear authentication or connection error, not a generic noise error.

### 2. Project Lifecycle (`Project`)
-   **Handle Creation**: Verify that `stitch.project('invalid-id')` does not throw (lazy instantiation) but the first call on it fails safely.
-   **Factory vs API**: Verify that creating a project handle via the factory doesn't trigger API calls, but methods like `project.listScreens()` do.

### 3. Screen Lifecycle (`Screen`)
-   **The Handover**: Verify that properties from `Project.generate()` are correctly populated on the returned `Screen` instances without a second fetch.
-   **Null Safety in Projections**: Test tools or scenarios that return empty arrays or missing optional fields. Verify that the SDK handle handles them as `undefined` or empty arrays rather than crashing on null property access!

### 4. Design System (`DesignSystem`)
-   **Application**: Create a design system, and apply it to a list of screens. Verify that if the list is empty or invalid, the SDK fails cleanly!
-   **Handles**: Verify that `project.designSystem('ds-id')` correctly receives the `projectId` and injects it into calls like `ds.apply(...)`.

---

## Tricky Situations Matrix (Standard Functional Edges)

| Scenario | What to try | Expected Behavior |
| --- | --- | --- |
| **Stale Handles** | Create a screen, delete the project, then try to edit the screen handle. | Clean API error indicating resource not found, wrapped in `StitchError`. |
| **Empty Prompts** | Call `project.generate('')` or with only whitespace. | Safe rejection or clear API error, no crash in codegen. |
| **Projections on null** | Force an API call that returns a response without the expected projection field (if you can simulate or find such a tool fallback case). | The SDK should use optional chaining (e.g., `raw?.prop`) and return `undefined` rather than throwing `TypeError: cannot read property of undefined`. |
| **Massive arrays** | Pass hundreds of screen IDs to `ds.apply()`. | Check if it hits payload limits gracefully or fails with a clear message. |

---

## Diagnostic Hygiene

-   Always wrap your test calls in `try/catch`.
-   Log the error and inspect `error.code` or `error.name` to see if it's a `StitchError` or a generic raw error.
-   If an execution throws a raw `TypeError` or "cannot read property of undefined", that is a **HIGH PRIORITY BUG** in the SDK's projection logic!

---

## Test Template: The Full Workflow Bash

Use this template to run a quick end-to-end bash session.

```typescript
import { stitch } from "@google/stitch-sdk";

async function bash() {
  const apiKey = process.env.STITCH_API_KEY;
  if (!apiKey) throw new Error("STITCH_API_KEY is required");

  console.log("🚀 Starting Bug Bash...");

  let project;
  try {
    // 1. Create a fresh project
    project = await stitch.createProject({
      displayName: `Bug Bash ${new Date().toISOString()}`
    });
    console.log(`✓ Created Project: ${project.id}`);

    // 2. Try to break generate with empty prompt
    try {
      await project.generate({ prompt: "" });
      console.log("✗ BUG: Generate with empty prompt should have failed!");
    } catch (e) {
      console.log("✓ Generate with empty prompt failed safely as expected.");
    }

    // 3. Create a design system
    const ds = await project.createDesignSystem({
      name: "Bash Style",
      variables: { primaryColor: "#ff0000" }
    });
    console.log(`✓ Created Design System: ${ds.id}`);

    // 4. List screens (should be empty)
    const screens = await project.listScreens();
    console.log(`✓ Listed screens: found ${screens.length}`);

    // 5. Apply design system to empty list
    try {
      await ds.apply({ selectedScreenIds: [] });
      console.log("✓ Applied design system to empty list (handled).");
    } catch (e) {
      console.log("✗ Did applying to empty list fail? Inspect error.");
    }

  } catch (error) {
    console.error("💥 Bash failed with error:", error);
  } finally {
    // 6. Cleanup
    if (project) {
      console.log(`🧹 Cleaning up project ${project.id}...`);
      // Assuming we have a deleteProject binding or we just leave it if not available
      // await project.delete(); 
    }
  }
}

bash();
```
