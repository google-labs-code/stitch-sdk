// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Binding IR Schema
 *
 * Zod schemas defining the structure of domain-map.json.
 * Used by generate-sdk.ts to validate the IR before codegen,
 * and as documentation for the Stage 2 domain design process.
 */

import { z } from "zod";

// ── Projection Steps ──────────────────────────────────────────

/**
 * A single step in a response projection path.
 * Replaces string-based extraction paths like ".outputComponents[0].design.screens[0]"
 * with structured, validatable segments.
 */
export const ProjectionStep = z
  .object({
    /** Property name to access on the current object */
    prop: z.string(),
    /** Pick nth item from an array (replaces [0], [1], etc.) */
    index: z.number().int().min(0).optional(),
    /** Flatten all items via flatMap (replaces [*] glob) */
    each: z.boolean().optional(),
    /**
     * Scan pattern: iterate the array at `prop` and find the first element
     * whose nested path (dot-separated, e.g. "design.screens") is non-null.
     * Emits: `(raw?.prop ?? []).find(c => c?.a?.b != null)`
     */
    find: z.string().optional(),
    /**
     * Escape hatch for the unbounded-array lint: declares that taking a
     * single element (index/find) from an unbounded array is INTENTIONAL
     * because the result is semantically singular. Without it, codegen
     * warns that data may be silently truncated.
     */
    acknowledgeSingle: z.boolean().optional(),
  })
  .strict()
  .refine((data) => !(data.index !== undefined && data.each), {
    message: "Cannot use both 'index' and 'each' on the same step",
  })
  .refine((data) => !(data.find && data.each), {
    message: "Cannot use both 'find' and 'each' on the same step",
  })
  .refine((data) => !(data.find && data.index !== undefined), {
    message: "Cannot use both 'find' and 'index' on the same step",
  });
export type ProjectionStep = z.infer<typeof ProjectionStep>;

// ── Arg Specs ─────────────────────────────────────────────────

const ArgSelf = z
  .object({
    from: z.literal("self"),
    field: z.string().optional(),
  })
  .strict();

const ArgSelfArray = z
  .object({
    from: z.literal("selfArray"),
    field: z.string().optional(),
  })
  .strict();

const ArgParam = z
  .object({
    from: z.literal("param"),
    rename: z.string().optional(),
    optional: z.boolean().optional(),
    /**
     * Default value sent when the caller omits the param. Emitted as
     * `options?.x ?? "<default>"`. Requires `optional: true` — a default
     * on a required param is a contradiction.
     */
    default: z.string().optional(),
  })
  .strict()
  .refine((data) => data.default === undefined || data.optional === true, {
    message: "'default' requires 'optional: true'",
  });

const ArgComputed = z
  .object({
    from: z.literal("computed"),
    template: z.string(),
  })
  .strict();

export const ArgSpec = z.discriminatedUnion("from", [
  ArgSelf,
  ArgSelfArray,
  ArgParam,
  ArgComputed,
]);
export type ArgSpec = z.infer<typeof ArgSpec>;

// ── Return Spec ───────────────────────────────────────────────

export const ReturnSpec = z
  .object({
    /** Domain class to wrap the result in */
    class: z.string().optional(),
    /** Primitive type (when not wrapping in a class) */
    type: z.string().optional(),
    /** Structured projection path into the response */
    projection: z.array(ProjectionStep),
    /** Whether the result is an array */
    array: z.boolean().optional(),
    /**
     * "generation": wrap the projected array in a Generation<Item, Raw>
     * container ({ screens, first, raw }). REQUIRED for generative tools —
     * Stitch returns many screens per generation, and a single-item
     * projection silently truncates. Requires `class`; the projection
     * must collect ALL items (at least one `each` step); `array` is
     * implied and must not be set.
     */
    kind: z.literal("generation").optional(),
  })
  .strict()
  .refine((d) => !(d.kind === "generation" && !d.class), {
    message: '"kind": "generation" requires "class"',
  })
  .refine(
    (d) => !(d.kind === "generation" && !d.projection.some((s) => s.each)),
    {
      message:
        '"kind": "generation" requires an "each" projection — collecting ' +
        "a single item from a generative response truncates data",
    },
  )
  .refine((d) => !(d.kind === "generation" && d.array !== undefined), {
    message: '"kind": "generation" implies array semantics; omit "array"',
  });
export type ReturnSpec = z.infer<typeof ReturnSpec>;

// ── Cache Spec ────────────────────────────────────────────────

export const CacheSpec = z
  .object({
    /** Structured projection path to the cached field on this.data */
    projection: z.array(ProjectionStep),
    /** Human-readable description of why this field is cached */
    description: z.string(),
    /**
     * Merge the API response back into this.data after a cache miss,
     * so subsequent calls hit the cache instead of refetching.
     */
    writeBack: z.boolean().optional(),
  })
  .strict()
  .refine((data) => data.projection.every((s) => !s.each && !s.find), {
    message:
      "Cache projections support 'prop' and 'index' only — 'each'/'find' " +
      "have no single-value cache semantics",
  });
export type CacheSpec = z.infer<typeof CacheSpec>;

// ── Factory Spec ──────────────────────────────────────────────

/** A local factory method that creates a child instance without an API call. */
export const FactorySpec = z
  .object({
    /** Method name on the parent class */
    method: z.string(),
    /** Domain class to instantiate */
    returns: z.string(),
    /** Description for JSDoc */
    description: z.string().optional(),
  })
  .strict();
export type FactorySpec = z.infer<typeof FactorySpec>;

// ── Side-Effect Spec ──────────────────────────────────────────

/**
 * Declares a handwritten method on an extension class.
 * Each side effect must justify WHY it can't be generated and
 * point to its typed service contract (Spec file).
 */
export const SideEffectSpec = z
  .object({
    /** Method name added by the extension */
    method: z.string(),
    /** Why this method cannot be generated by the domain-map pipeline */
    reason: z.enum([
      "filesystem_io", // reads/writes local files
      "binary_data", // base64, streams, multipart
      "private_rest", // no MCP tool exists
      "complex_orchestration", // multi-step with retries/rollback
    ]),
    /** Path to the Spec file relative to packages/sdk/ */
    specPath: z.string(),
  })
  .strict();
export type SideEffectSpec = z.infer<typeof SideEffectSpec>;

// ── Class Config ──────────────────────────────────────────────

export const ReferenceSpec = z
  .object({
    keys: z.array(z.string()),
  })
  .strict();
export type ReferenceSpec = z.infer<typeof ReferenceSpec>;

export const DomainClassConfig = z
  .object({
    description: z.string(),
    extensionPath: z.string().optional(),
    constructorParams: z.array(z.string()),
    isRoot: z.boolean().optional(),
    reference: ReferenceSpec.optional(),
    parentField: z.string().optional(),
    /** Local factory methods that create child instances without API calls */
    factories: z.array(FactorySpec).optional(),
    /**
     * Side-effect methods provided by the handwritten extension.
     * Each entry declares a method, its reason for being handwritten,
     * and the path to its typed service contract.
     */
    sideEffects: z.array(SideEffectSpec).optional(),
    /**
     * Declaration-merge a TS interface onto the generated class type so
     * handwritten extension methods (returned at runtime via the
     * EntityManager registry) are visible on self-referential returns
     * (e.g. Screen.edit() → Generation<Screen>). Type-only; no runtime effect.
     */
    publicInterface: z
      .object({
        /** Exported interface name to extend (e.g. "ScreenContentSpec"). */
        name: z.string(),
        /** Module specifier the generated file imports it from (type-only). */
        importPath: z.string(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type DomainClassConfig = z.infer<typeof DomainClassConfig>;

// ── Error Spec ────────────────────────────────────────────────

export const ErrorSpec = z.object({
  name: z.string(),
  match: z.string(),
  schema: z.any(), // JSON Schema object for the error payload
});
export type ErrorSpec = z.infer<typeof ErrorSpec>;

// ── Binding ───────────────────────────────────────────────────

export const Binding = z
  .object({
    /** MCP tool name */
    tool: z.string(),
    /** Domain class this method belongs to */
    class: z.string(),
    /** Method name on the class */
    method: z.string(),
    /**
     * JSDoc override. Without it the tool's description is used, which
     * is wrong for bindings whose semantics differ from the raw tool
     * (e.g. getHtmlUrl wraps get_screen).
     */
    description: z.string().optional(),
    /** Argument routing specs */
    args: z.record(z.string(), ArgSpec),
    /** Return value spec with projection */
    returns: ReturnSpec,
    /** Optional cache spec for methods that check this.data first */
    cache: CacheSpec.optional(),
    /** Custom typed errors to throw when a specific match condition is met */
    errors: z.array(ErrorSpec).optional(),
  })
  .strict();
export type Binding = z.infer<typeof Binding>;

// ── Domain Map (top-level) ────────────────────────────────────
//
// NOTE: every object schema in this file is .strict(). The IR is authored
// by an agent (Stage 2); a silently-stripped unknown key means the agent
// believed a feature was applied when it was discarded. Unknown keys are
// hard errors by design.

export const DomainMap = z
  .object({
    classes: z.record(z.string(), DomainClassConfig),
    bindings: z.array(Binding),
  })
  .strict();
export type DomainMap = z.infer<typeof DomainMap>;
