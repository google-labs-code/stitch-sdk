# Migrating to @google/stitch-sdk 1.0

1.0 is a single coordinated breaking release. Every break below ships together; after 1.0, method signatures are stable (additive options only).

## TL;DR — the five changes most code hits

```ts
// 1. Generative methods return a Generation (ALL screens, not one)
- const screen = await project.generate("A login page");
+ const generation = await project.generate("A login page");
+ const screen = generation.first;      // generation.screens has every screen

// 2. Optional params moved into a trailing options object
- await project.generate(prompt, "MOBILE");
+ await project.generate(prompt, { deviceType: "MOBILE" });
- await stitch.createProject("My App");
+ await stitch.createProject({ title: "My App" });

// 3. getHtml()/getImage() now return CONTENT; URLs have their own accessors
- const url = await screen.getHtml();          // was a URL
+ const html = await screen.getHtml();         // HTML string, fetched for you
+ const url = await screen.getHtmlUrl();       // the signed URL
+ const png = await screen.getImage();         // Uint8Array screenshot bytes
+ const pngUrl = await screen.getImageUrl();

// 4. Entities are constructed only via factories / returns
- const project = new Project(client, "project-id");
+ const project = stitch.project("project-id"); // or sdk.project(id)

// 5. Tool catalog moved off the root entry
- import { toolDefinitions, toolMap } from "@google/stitch-sdk";
+ import { toolDefinitions, toolMap } from "@google/stitch-sdk/tools";
```

## Why `generate()` changed (the headline fix)

Stitch returns **many screens per generation**. 0.x silently truncated the response to the first screen of the first output component — screens were generated, billed, and dropped. A `Generation<Screen, RawResponse>` carries everything:

```ts
const gen = await project.generate("Onboarding flow with 3 steps");
gen.screens;   // Screen[] — every screen, across all output components
gen.first;     // the first screen (response order; convenience, not "primary")
gen.raw;       // the full typed tool response (sessionId, feedback, …)
gen.length;    // number of screens
for (const screen of gen) { ... }  // iterable
```

`edit()`, `variants()`, and `designSystem.apply()` return the same shape. An empty generation throws `StitchError` instead of returning `undefined`.

## Full breaking-change list

| Area                                                                                                      | 0.x                                              | 1.0                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project.generate`, `screen.edit`                                                                         | `Promise<Screen>` (truncated!)                   | `Promise<Generation<Screen, …>>`                                                                                                                         |
| `screen.variants`, `designSystem.apply`                                                                   | `Promise<Screen[]>`                              | `Promise<Generation<Screen, …>>`                                                                                                                         |
| Optional params                                                                                           | positional (`generate(p, deviceType?)`)          | trailing `options` object — future fields (e.g. `onProgress`, `signal`) land here non-breakingly                                                         |
| `createProject(title?)`                                                                                   | positional                                       | `createProject({ title })`                                                                                                                               |
| `generate` deviceType default                                                                             | not sent                                         | sends `"DESKTOP"` when omitted (per tool contract)                                                                                                       |
| `screen.getHtml()`                                                                                        | returned a download URL                          | returns **HTML content**; URL via `getHtmlUrl()`                                                                                                         |
| `screen.getImage()`                                                                                       | returned a download URL                          | returns **`Uint8Array` bytes**; URL via `getImageUrl()`                                                                                                  |
| Missing artifact                                                                                          | silent `""`                                      | throws `StitchError` `NOT_FOUND`                                                                                                                         |
| `new Project/Screen/DesignSystem(...)`                                                                    | compiled, silently broken IDs                    | `protected` constructor (compile error) — use `stitch.project(id)`, `project.screen(id)`, `project.designSystem(id)`                                     |
| Identity map                                                                                              | same ID aliased ACROSS projects (bug)            | composite keys; same instance only for the same fully-qualified identity. Opt out: `new StitchToolClient({ entityCache: false })`                        |
| `entity.data`                                                                                             | `any`                                            | `unknown` — narrow it, or use typed accessors (`.title`)                                                                                                 |
| `toolDefinitions`, `toolMap`                                                                              | root export + `stitch.toolMap`                   | `@google/stitch-sdk/tools`                                                                                                                               |
| `DesignTheme`, `ScreenInstance` types from root                                                           | handwritten, WRONG shapes                        | the real generated shapes (same names, correct fields)                                                                                                   |
| `GenerateScreenParams`, `buildFifeSuffix`, `repairToolSchemas`, `repairSchema`, `StitchProxyConfigSchema` | exported                                         | removed / type-only                                                                                                                                      |
| `@google/stitch-sdk/ai`                                                                                   | worked without `ai` installed (forged internals) | requires the optional peer `ai` (v6+); actionable error otherwise                                                                                        |
| `@google/stitch-sdk/adk`                                                                                  | crashed with bare `ERR_MODULE_NOT_FOUND`         | requires optional peer `@google/adk`; actionable error                                                                                                   |
| Adapter `include:` filters                                                                                | unknown names silently dropped                   | unknown names **throw**, listing available tools                                                                                                         |
| `client.close()`                                                                                          | connection silently resurrected                  | terminal; further calls throw `CLIENT_CLOSED`                                                                                                            |
| Retry                                                                                                     | none                                             | automatic backoff for `RATE_LIMITED` on `get_*`/`list_*` **only** (generative calls are never auto-retried); `retry: false` disables                     |
| Errors                                                                                                    | message-only                                     | `StitchError.status` (HTTP) and `.toolName` (MCP) populated                                                                                              |
| Env vars                                                                                                  | `STITCH_HOST`, `STITCH_MCP_URL` ad hoc           | `STITCH_BASE_URL` (aliases accepted; `STITCH_HOST` warns, removed in 2.0). `GOOGLE_CLOUD_PROJECT` remains first-class; `STITCH_PROJECT_ID` also accepted |

## New capabilities (non-breaking)

- `Generation.raw` exposes response fields the SDK doesn't model yet.
- URL accessors are cache-aware and **write back** fetched responses (repeat calls don't refetch).
- `STITCH_DEBUG=1` logs tool calls (names + arg keys only), retries, and connection lifecycle, with credentials redacted.
- `resetStitchSingleton()` for tests.
- All generated argument/response types are exported from the root (`VariantOptions`, `DesignSystemInput`, `SelectedScreenInstance`, every `*Response`).
