---
name: stitch-sdk-pipeline
description: Run the full Stitch SDK generation pipeline. Use when a new tool is added, or the SDK needs to be regenerated end-to-end.
---

# Stitch SDK Pipeline

This skill orchestrates the full SDK generation pipeline — from capturing MCP tool schemas to publishing a tested, validated package. Use this when:

- The Stitch MCP server adds or changes tools
- You need to regenerate the SDK from scratch
- You want to verify the pipeline is healthy

> [!IMPORTANT]
> **Stage 2 is the only step requiring agent intelligence.** All other stages are deterministic scripts. For Stage 2, use the `stitch-sdk-domain-design` skill.

---

## Prerequisites

- `STITCH_API_KEY` environment variable set
- `bun` installed
- Working directory: project root (`stitch-sdk/`)

---

## Pipeline Stages

### Stage 1: Capture Tool Schemas 🤖

```bash
// turbo
npm run capture
```

Connects to the Stitch MCP server, calls `tools/list`, and writes the raw schemas to `packages/sdk/generated/tools-manifest.json`. Updates the manifest section of `stitch-sdk.lock`.

**Output**: `packages/sdk/generated/tools-manifest.json` (includes `inputSchema` + `outputSchema` for every tool)

**When to skip**: If `tools-manifest.json` is already up to date and no server-side changes occurred.

---

### Stage 2: Domain Design 🧠 (Agent)

**Use the `stitch-sdk-domain-design` skill for this stage.**

Read `tools-manifest.json` and edit `packages/sdk/generated/domain-map.json` to map tools → classes → methods.

Key decisions at this stage:
- Which class owns each tool?
- What are the arg routing rules (self, param, computed, selfArray)?
- What is the response projection path?
- Should the method cache data from the construction response?

**Input**: `tools-manifest.json` + `scripts/ir-schema.ts` (the canonical IR contract)
**Output**: `packages/sdk/generated/domain-map.json`

**When to skip**: If `domain-map.json` already has the correct bindings and you only changed `ir-schema.ts` or `generate-sdk.ts`.

---

### Stage 3: Generate TypeScript 🤖

```bash
// turbo
npm run generate
```

Validates the IR (Zod schema) and every projection (against `outputSchema`), then emits TypeScript files via ts-morph into `packages/sdk/generated/src/`.

**Output**: `packages/sdk/generated/src/*.ts` + updated `stitch-sdk.lock`

If this fails with a projection error, go back to Stage 2 and fix `domain-map.json`.

---

### Stage 4: Build 🤖

```bash
// turbo
npm run build
```

TypeScript compilation: `packages/sdk/` → `packages/sdk/dist/`.

---

### Stage 5: Unit Tests 🤖

```bash
// turbo
npm run test
```

Runs core unit tests (vitest) — mocked `callTool`, verifying generated method signatures, caching, and error handling.

---

### Stage 6: Script Tests 🤖

```bash
// turbo
npm run test:scripts
```

Runs contract tests (IR schema acceptance/rejection) and logic tests (expression builders) using `bun:test`.

---

### Stage 7: E2E Tests 🤖

```bash
npm run test:e2e
```

Live API tests against the built package. Requires `STITCH_API_KEY` (and `GEMINI_API_KEY` for AI SDK tests). Two test suites:

- **`live.test.ts`** — Direct SDK calls: create projects, generate screens, verify responses.
- **`ai-sdk-e2e.test.ts`** — AI SDK integration via `stitchTools()`: Gemini autonomously calls Stitch tools, generates designs, extracts HTML + Tailwind config, produces modular React components, validates via SWC, and scaffolds a Vite preview app at `.stitch/preview/`.

---

### Stage 8: Lock Validation 🤖

```bash
// turbo
npm run validate:generated
```

Verifies that `stitch-sdk.lock` hashes match the actual generated files. Catches drift (someone edited generated files manually or forgot to regenerate).

> [!IMPORTANT]
> Always run **after** Stage 3 (Generate). If you run Capture (Stage 1) then Validate without re-generating, the hashes will mismatch because the manifest hash changed.

---

### Stage 9: Skill Audit 🧠 (Agent)

After the pipeline passes, audit agent skills for freshness. Read the current source of truth and update any skills that reference stale methods, args, or examples.

**Inputs**:
- `packages/sdk/src/index.ts` (public surface)
- Generated class files in `packages/sdk/generated/src/`
- `packages/sdk/src/spec/errors.ts` (error codes)
- `packages/sdk/src/spec/client.ts` (config schema)

**Skills to audit** (in priority order):
1. `stitch-sdk-usage` — highest churn, references specific methods and constructor signatures
2. `stitch-sdk-readme` — must document `stitchTools()` API and AI SDK integration examples
3. `stitch-sdk-development` — check cache examples match current domain-map patterns
4. `stitch-sdk-domain-design` — check code examples in the cache section

**Skills to skip**: `stitch-sdk-pipeline` (self-referential), `red-green-yellow` (generic methodology).

**What to check**:
- Every method name in a code example exists on its class
- Every import in an example matches an export in `index.ts`
- Constructor signatures match the actual constructors
- Config fields match `StitchConfigSchema`
- Error codes match `StitchErrorCode`

**When to skip**: If only infrastructure code changed (`packages/sdk/src/client.ts`, `packages/sdk/src/proxy/`) and no public API surface changed.

---

## Quick Reference

### Full pipeline (script stages only)

```bash
npm run pipeline
```

Runs Stage 1 → 3 → 4 → 5 in sequence. Does **not** include Stage 2 (agent), Stage 7 (e2e), or Stage 9 (skill audit).

### Starting from a specific stage

| Scenario | Start from |
|---|---|
| New tool added to MCP server | Stage 1 |
| Need to change how a tool maps to a method | Stage 2 |
| Changed `ir-schema.ts` or `generate-sdk.ts` | Stage 3 |
| Changed code in `packages/sdk/src/` (client, errors) | Stage 4 |
| Just want to verify everything works | Stage 5 |
| Changed AI SDK tools adapter or tool definitions | Stage 5 |
| Public API surface changed | Stage 9 |

### Key files

| File | Location | Role |
|---|---|---|
| `tools-manifest.json` | `packages/sdk/generated/` | Raw MCP tool schemas (Stage 1 output) |
| `domain-map.json` | `packages/sdk/generated/` | IR: tool → class → method mappings (Stage 2 output) |
| `tool-definitions.ts` | `packages/sdk/generated/src/` | Generated JSON Schema tool definitions for AI SDK |
| `tools-adapter.ts` | `packages/sdk/src/` | `stitchTools()` — AI SDK v6 adapter (imported via `@google/stitch-sdk/ai`) |
| `ir-schema.ts` | `scripts/` | Zod schema defining valid IR structure |
| `tool-schema.ts` | `scripts/` | TypeScript types for JSON Schema |
| `generate-sdk.ts` | `scripts/` | ts-morph codegen (Stage 3) |
| `stitch-sdk.lock` | `packages/sdk/generated/` | Integrity hashes for drift detection |
| `stitch-html.ts` | `packages/sdk/test/helpers/` | Stitch HTML parser (Tailwind config + font extraction) |
| `component-validator.ts` | `packages/sdk/test/helpers/` | SWC AST validator for generated React components |
