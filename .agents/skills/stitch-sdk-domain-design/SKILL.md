---
name: stitch-sdk-domain-design
description: Design the domain model for the Stitch SDK. Use when mapping MCP tools to domain classes and bindings in domain-map.json. This is Stage 2 of the generation pipeline.
---

# Stitch SDK Domain Design

This skill teaches you how to perform **Stage 2** of the generation pipeline: reading tool schemas and producing `domain-map.json` — the intermediate representation that drives codegen.

---

## Your Inputs

1. **`tools-manifest.json`** — raw MCP tool schemas captured from the server (includes `outputSchema`)
2. **`ir-schema.ts`** — Zod schema defining valid domain-map structure (the canonical contract)
3. **Existing `domain-map.json`** — the current IR (if extending, not starting fresh)
4. **The `stitch-sdk-development` skill** — for understanding the pipeline context

## Your Output

A valid `domain-map.json` with two sections: `classes` and `bindings`, validated by `ir-schema.ts`.

> [!IMPORTANT]
> Your output is validated **twice** by the codegen: structurally (Zod IR schema) and semantically (projection steps verified against `outputSchema` from the tools-manifest).

---

## Designing Classes

Each class represents a domain entity. Ask: "What noun does the user interact with?"

```json
{
  "Stitch": {
    "description": "Main entry point. Manages projects.",
    "constructorParams": [],
    "isRoot": true,
    "factories": [
      {
        "method": "project",
        "returns": "Project",
        "description": "Create a Project handle from an ID."
      }
    ]
  }
}
```

### Key decisions:

| Field               | Purpose                                                   | Example                                                                                |
| ------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `constructorParams` | Fields stored on the instance                             | `["projectId", "screenId"]`                                                            |
| `reference`         | Identity-map keys (`.id` aliases the LAST key)            | `{ "keys": ["projectId", "screenId"] }`                                                |
| `parentField`       | Which param is injected from a parent class               | `"projectId"`                                                                          |
| `factories`         | Local factory methods (no API call)                       | `[{ "method": "project", "returns": "Project" }]`                                      |
| `sideEffects`       | Handwritten extension methods (declared, never generated) | `[{ "method": "upload", "reason": "private_rest", "specPath": "src/spec/upload.ts" }]` |
| `extensionPath`     | Module re-exporting the class with handwritten methods    | `"../../src/project-ext.js"`                                                           |

> [!IMPORTANT]
> **The IR schema is STRICT.** Unknown keys are hard validation errors, not
> silently ignored. Per-field source-mapping helpers described in older docs
> were never implemented and do not exist — identity fields are populated by
> the EntityManager from `reference.keys`, resource `name` parsing, and `id`
> fallback. If validation rejects a key you expected to exist, the feature
> does not exist — do not work around it.

---

## Designing Bindings

Each binding maps one MCP tool to one class method. Ask: "Who owns this action?"

### Arg routing

| Type        | Meaning                                                         | Code generated                                             |
| ----------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `self`      | From `this.field`                                               | `projectId: this.projectId`                                |
| `param`     | From method parameter                                           | `prompt: prompt`                                           |
| `computed`  | `template` interpolation (`"template": "projects/{projectId}"`) | `name: \`projects/${this.projectId}/screens/${screenId}\`` |
| `selfArray` | Wrap self field as array                                        | `selectedScreenIds: [this.screenId]`                       |

Optional params use `"optional": true`. Renamed params use `"rename": "newName"`.
A `"default": "VALUE"` (requires `optional: true`) is sent when the caller
omits the value: `deviceType: options?.deviceType ?? "DESKTOP"`.

> [!IMPORTANT]
> **Method signature shape (D12):** required params are positional, in IR
> order; ALL optional params are emitted into a single trailing
> `options?: { ... }` object. `generate(prompt, options?)`, never
> `generate(prompt, deviceType?)`.

### Response Projections

The `returns.projection` array tells codegen how to navigate the API response. Each step is a `ProjectionStep`:

```typescript
{ prop: string; index?: number; each?: boolean; find?: string; acknowledgeSingle?: boolean }
```

| Projection                                                                                                  | Generated code                              | Use when                        |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------- |
| `[]` (empty)                                                                                                | `raw`                                       | Direct return (whole response)  |
| `[{ "prop": "projects" }]`                                                                                  | `raw.projects`                              | Array inside object             |
| `[{ "prop": "outputComponents", "index": 0 }, { "prop": "design" }, { "prop": "screens", "index": 0 }]`     | `raw.outputComponents[0].design.screens[0]` | Deeply nested single item       |
| `[{ "prop": "outputComponents", "each": true }, { "prop": "design" }, { "prop": "screens", "each": true }]` | `flatMap` chain                             | Collect all items across arrays |
| `[{ "prop": "screenshot" }, { "prop": "downloadUrl" }]`                                                     | `raw.screenshot.downloadUrl`                | Navigate nested properties      |

**Decision**: Use `"index": 0` when extracting a single item. Use `"each": true` when collecting all items (array result). You **cannot** use both on the same step. `"find": "a.b"` scans an array for the first element whose nested path is non-null.

> [!TIP]
> Every `prop` in a projection is validated against the tool's `outputSchema` at codegen time. If you typo a property name, codegen will fail with a diagnostic listing the available properties. Stepping THROUGH an array without `index`/`each`/`find` is also a codegen error — the emitted chain would be `undefined` at runtime.

> [!WARNING]
> **Truncation lint:** using `index` or `find` on an UNBOUNDED array emits a
> warning — every other element is silently dropped (this exact pattern caused
> `project.generate()` to return one screen of many). Prefer `"each": true` +
> `"array": true`. Only if the result is semantically singular, acknowledge it
> with `"acknowledgeSingle": true` on the step.

### Return class wrapping

When `returns.class` is set, the extracted data is wrapped in a domain class constructor:

```json
{
  "returns": {
    "class": "Screen",
    "projection": [{ "prop": "screens" }],
    "array": true
  }
}
```

The codegen automatically spreads `parentField` into the data if the child class declares one.

### Cache-aware methods

Add a `cache` field with a structured `projection` to check `this.data` before calling the API:

```json
{
  "cache": {
    "projection": [{ "prop": "htmlCode" }, { "prop": "downloadUrl" }],
    "description": "Use cached HTML download URL from generation response if available"
  }
}
```

When the cached property is a nested object (like `File` with a `downloadUrl`), use multiple projection steps to drill into it.

Generated code:

```typescript
if (this.data?.htmlCode?.downloadUrl) return this.data?.htmlCode?.downloadUrl;
// ... else call API
```

---

## Decision Framework

When mapping a new tool, answer these questions:

1. **Which class?** Look at which fields the tool requires. If it needs `projectId` from `self`, it belongs on `Project` or `Screen`. If it needs nothing from self, it belongs on `Stitch`.

2. **Which method name?** Use the verb from the tool name, simplified. `generate_screen_from_text` → `generate`. `edit_screens` → `edit`.

3. **Arguments from self or param?** If the caller already has the data (because they're calling a method on themselves), use `self`. If they need to provide it, use `param`.

4. **How deep is the return?** Check the tool's `outputSchema` in `tools-manifest.json`. Build the `projection` array step-by-step to navigate to the useful data.

5. **Should it cache?** If the data is available from a previous response (like generation), add a cache field with the projection path.

---

## Validation

After editing `domain-map.json`:

```bash
bun scripts/generate-sdk.ts     # Validates IR + projections, then generates
npx tsc --noEmit                 # Type check
npx vitest run                   # Unit tests
bun scripts/e2e-test.ts          # E2E tests
bun scripts/validate-generated.ts  # Lock integrity
```

If a projection is invalid, you'll see:

```
❌ Binding "Project.generate" projection step 2:
   property "screenz" not found in outputSchema.
   Available properties: screens, components, metadata
```
