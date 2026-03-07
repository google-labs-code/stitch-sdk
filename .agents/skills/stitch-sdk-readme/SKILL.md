---
name: stitch-sdk-readme
description: Generate or update the README for the Stitch SDK. Use the Bookstore Test structure and source the current API from the codebase. Use when the README needs to be written or updated.
---

# Stitch SDK README Generator

This skill produces the README for `@google/stitch-sdk`. It combines a structural strategy (the Bookstore Test) with instructions for sourcing the current API from the codebase — so the README stays accurate as the SDK evolves.

---

## How to Source the Current API

Do not hard-code the API surface. Read it from the codebase at invocation time:

| What you need | Where to find it |
|---|---|
| Public exports (full surface) | `packages/sdk/src/index.ts` |
| Domain class methods + signatures | Source files for each exported class (`sdk.ts`, `project.ts`, `screen.ts`) |
| Generated method bindings | `packages/sdk/generated/domain-map.json` → `bindings[]` array |
| Handwritten methods | Methods in class source files that aren't in domain-map bindings (e.g. `Screen.edit`, `Screen.variants`) |
| AI SDK tools adapter | `packages/sdk/src/tools-adapter.ts` → `stitchTools()` function |
| Generated tool definitions | `packages/sdk/generated/src/tool-definitions.ts` → JSON Schema for each tool |
| Tool client methods | `packages/sdk/src/client.ts` |
| Error codes | `packages/sdk/src/spec/errors.ts` → `StitchErrorCode` |
| Config options | `packages/sdk/src/spec/client.ts` → `StitchConfigSchema` |
| Proxy config | `packages/sdk/src/proxy/core.ts` |

After reading these files, you have the complete API surface. Structure it using the Bookstore Test template below.

---

## The Bookstore Test

A reader decides whether to use a library the same way a person decides to buy a book: they glance at the **cover**, read the **inner flap**, then commit to **reading the book**. The README must earn the reader's attention at each stage.

### The Cover

A single sentence stating what problem this library solves — not what the library *is*. The reader should recognize their own situation. No taglines, no badges, no logos.

**For this SDK**, the cover is about generating UI from text and extracting HTML/screenshots programmatically.

**Good:** "Generate UI screens from text prompts and extract their HTML and screenshots programmatically."
**Bad:** "The official TypeScript SDK for Google Stitch, a powerful AI-powered UI generation platform."

### The Inner Flap

Immediately show the library in use. Code first, not setup.

**Primary workflow** — the punchline everything in the SDK exists to produce:
```
createProject → generate → getHtml
```
Show this as the first code block, with one line noting the env var requirement. Do not show installation, imports, or config before this.

**Secondary workflows** — reveal depth progressively:
1. Listing and iterating over existing projects/screens
2. Editing a screen and generating variants
3. Tool access via singleton (`stitch.listTools()`, `stitch.callTool()`) — zero setup
4. Explicit configuration via `StitchToolClient` (custom API key, base URL)
5. AI SDK integration via `stitchTools()` — show `generateText` with `tools: stitchTools()` and `stepCountIs`

Rules for this section:
- **No setup first.** One line mentioning `STITCH_API_KEY` is enough before the first example.
- **Straightforward language.** No "powerful", "seamless", "robust", "enterprise-grade".
- **Working examples.** Every code block must be valid, runnable code — not fragments with `// ...` elisions.
- **Progressive complexity.** Simplest invocation first, then deeper capabilities.

### Reading the Book

The reader is committed. Document the full API as a reference.

Structure by class in this order: `Stitch` → `Project` → `Screen` → `StitchToolClient` → `stitchTools()` (AI SDK) → `StitchProxy` → `stitch` singleton.

Each entry should have:
- What it does (one line)
- Usage example (minimal, runnable)
- Parameters (table)
- Return type and error behavior

Setup, authentication, and configuration go here — after the reader has already decided the library is worth using.

### Tone

Write like a colleague explaining their work to another engineer. Be direct. Be specific. Don't sell — inform. If a feature has limitations, state them. If setup is complex, say so.

---

## Validation

After generating the README, verify:

- [ ] Can a reader understand what the library does in under 10 seconds?
- [ ] Is there a runnable code example within the first scroll?
- [ ] Does setup/config appear *after* the first code example?
- [ ] Is every code block valid, copy-pasteable code?
- [ ] Is the language descriptive rather than promotional?
- [ ] Does the reference section cover every public export from `index.ts`?
- [ ] Every method name in examples exists in its class source file
- [ ] Every import in examples matches an export in `index.ts`
- [ ] All three modalities are documented: domain classes (scripts), `StitchToolClient` (agents), `stitchTools()` (AI SDK)

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Leading with badges, logos, or status shields | Visual noise before the reader knows what the library does |
| "Getting Started" as the first section | Forces setup before demonstrating value |
| Feature bullet lists without code | Tells instead of shows |
| "Easy to use", "simple", "just works" | Self-congratulatory claims that invite skepticism |
| Long install/config blocks before any usage | Asks for investment before demonstrating return |
| Collapsible sections hiding core API docs | Buries the content committed readers came for |
| Hard-coding the API in docs without sourcing | Goes stale when tools are added |
