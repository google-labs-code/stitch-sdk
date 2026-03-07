---
name: stitch-sdk-development
description: Develop the Stitch SDK. Covers the generation pipeline, dual modality (agent vs SDK), error handling, and Traffic Light (Red-Green-Yellow) implementation workflow. Use when adding features, fixing bugs, or understanding the architecture.
---

# Stitch SDK Development

This skill encodes the expertise needed to develop `@google/stitch-sdk` — the core systems, patterns, and philosophies. It does not enumerate every method (the codebase is the source of truth for that). It teaches you how to think about the system.

---

## The Generation Pipeline

The domain layer is **fully generated**. No handwritten domain classes. The pipeline has 3 stages:

```
Stage 1: Capture            Stage 2: Domain Design       Stage 3: Generate
┌──────────────────┐       ┌──────────────────┐        ┌──────────────────┐
│ capture-tools.ts │──────▶│  domain-map.json │───────▶│ generate-sdk.ts  │
│                  │       │  (the IR)        │        │                  │
│ Connects to MCP  │       │ Classes, bindings│        │ Deterministic    │
│ server, calls    │       │ arg routing,     │        │ codegen into     │
│ tools/list       │       │ cache, extraction│        │ packages/sdk/generated/  │
└──────────────────┘       └──────────────────┘        └──────────────────┘
        │                          │                           │
        ▼                          ▼                           ▼
 tools-manifest.json        domain-map.json          packages/sdk/generated/src/*.ts
 (raw MCP tool schemas)     (tool→class mapping)     (Stitch, Project, Screen)
```

**Stage 1** (`bun scripts/capture-tools.ts`): Connects to the live Stitch MCP server, calls `tools/list`, writes `tools-manifest.json`. Source of truth for what tools exist.

**Stage 2** (agent/human): Reads the manifest and produces `domain-map.json` — the intermediate representation. This is where judgment lives: which tool maps to which class, what args come from `self` vs `param` vs `computed`, how to extract the return value, and what data to cache.

**Stage 3** (`bun scripts/generate-sdk.ts`): Deterministic codegen. Reads manifest + domain-map, emits TypeScript classes in `packages/sdk/generated/src/`. No LLM involved — pure template expansion.

**Integrity**: `stitch-sdk.lock` records SHA-256 hashes of all inputs and outputs. `bun scripts/validate-generated.ts` verifies consistency. Run in CI to prevent publishing stale code.

### Supporting a New Tool

When the Stitch MCP server adds a new tool:

1. Run Stage 1 to capture the updated manifest
2. Run Stage 2: add a binding in `domain-map.json` for the new tool
3. Run Stage 3 to regenerate the SDK classes
4. Run `validate-generated.ts` to confirm consistency
5. Update tests as needed

### The Domain Map IR

`domain-map.json` expresses two things:

**Classes**: What domain objects exist and how they're constructed.
```json
{
  "Screen": {
    "constructorParams": ["projectId", "screenId"],
    "fieldMapping": {
      "projectId": { "from": "projectId" },
      "screenId": { "from": "id", "fallback": { "field": "name", "splitOn": "/screens/" } }
    },
    "parentField": "projectId",
    "idField": "screenId"
  }
}
```

**Bindings**: How MCP tools map to class methods.
```json
{
  "tool": "generate_screen_from_text",
  "class": "Project",
  "method": "generate",
  "args": {
    "projectId": { "from": "self" },
    "prompt": { "from": "param" },
    "name": { "from": "computed", "template": "projects/{projectId}/screens/{screenId}" }
  },
  "returns": {
    "class": "Screen",
    "projection": [
      { "prop": "outputComponents", "index": 0 },
      { "prop": "design" },
      { "prop": "screens", "index": 0 }
    ]
  }
}
```

**Arg routing**: `self` = injected from `this`, `param` = passed by the caller, `computed` = built from a template at call time, `selfArray` = `[this.field]` wrapped as array.

**Response projections**: Structured `ProjectionStep[]` arrays validated against `outputSchema`. Use `index` for single items, `each` for arrays. Empty `[]` = direct return.

**Cache**: Methods can specify a `cache` with a structured `projection` to check `this.data` before calling the API:
```json
{
  "cache": { "projection": [{ "prop": "htmlCode" }, { "prop": "downloadUrl" }], "description": "Use cached download URL from generation response" }
}
```

---

## Dual Modality

The SDK serves two distinct consumers with different needs:

### Agent Modality — `StitchToolClient`

For AI agents and orchestration scripts. Raw tool pipe. The agent receives tool schemas, constructs JSON, sends it, gets JSON back. No domain knowledge required.

```typescript
const client = new StitchToolClient();
const tools = await client.listTools();
const result = await client.callTool("generate_screen_from_text", {
  projectId: "123", prompt: "A login page"
});
```

### SDK Modality — Generated Domain Classes

For humans writing precise, programmatic scripts. Generated domain facade over `callTool`. Typed parameters, domain objects returned, `StitchError` thrown on failure.

```typescript
const project = await stitch.createProject("My App");
const screen = await project.generate("A login page");
const html = await screen.getHtml();
```

Both modalities share `StitchToolClient` underneath. The domain classes are a typed layer over `callTool`.

### Error Handling — Throws at the Boundary

All generated methods use `throw StitchError` for error handling. No `Result<T>` pattern.

```typescript
// Generated method pattern (inside each method):
try {
  const raw = await this.client.callTool<any>("tool_name", args);
  return /* extracted result */;
} catch (error) {
  throw StitchError.fromUnknown(error);
}
```

`StitchError.fromUnknown()` ensures all errors are normalized to `StitchError` with a code, message, and recoverability hint.

### Infrastructure (Handwritten)

These components remain handwritten as they provide foundational plumbing:

- `StitchToolClient` — MCP transport, auth, tool invocation
- `StitchError` — typed error class with codes, messages, recovery hints
- `StitchProxy` — MCP proxy server for re-exposing Stitch to other agents
- `singleton.ts` — lazy proxy for `stitch` export with env var config

---

## Traffic Light Implementation (Red → Green → Yellow)

When implementing a new feature or fixing a bug, follow the Traffic Light pattern:

### 🔴 Red — Write Breaking Tests

Write the test first. It must fail. This defines the contract before any implementation exists.

```bash
# Unit tests for generated classes
npx vitest run test/unit/sdk.test.ts
# → FAIL (new method doesn't exist yet)

# E2E test for the public API
bun scripts/e2e-test.ts
# → FAIL (method doesn't exist yet)
```

### 🟢 Green — Implement

1. Add a binding to `domain-map.json` (Stage 2)
2. Run `bun scripts/generate-sdk.ts` (Stage 3)
3. Update tests to verify correct behavior

```bash
npx vitest run  # All tests pass
bun scripts/e2e-test.ts  # E2E passes
```

### 🟡 Yellow — Refactor / Refine / Revisit

With passing tests as your safety net:

- Refactor for clarity (extract helpers, simplify args)
- Add edge case tests
- Run `npx tsc` to verify type safety
- Run `bun scripts/validate-generated.ts` to verify pipeline integrity

---

## Orienting in the Codebase

Discover the current state by reading the codebase directly. The key entry points:

- **Public surface**: Start at `packages/sdk/src/index.ts` — every public export is listed here
- **Generated classes**: `packages/sdk/generated/src/` — Stitch, Project, Screen
- **Pipeline artifacts**: `packages/sdk/generated/domain-map.json`, `packages/sdk/generated/tools-manifest.json`
- **Infrastructure**: `packages/sdk/src/client.ts`, `packages/sdk/src/spec/errors.ts`, `packages/sdk/src/singleton.ts`
- **Test structure**: `packages/sdk/test/unit/` for unit tests, `packages/sdk/test/integration/` for live tests
- **Available commands**: Read the `scripts` field in `package.json`

Do not rely on cached descriptions of files or directory trees. Read the source.

## Import Convention

Use `.js` extensions for ESM compatibility:
```typescript
import { StitchError } from '../../src/spec/errors.js';  // ✓
import { StitchError } from '../../src/spec/errors';     // ✗
```
