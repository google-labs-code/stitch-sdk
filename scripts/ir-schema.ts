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
export const ProjectionStep = z.object({
  /** Property name to access on the current object */
  prop: z.string(),
  /** Pick nth item from an array (replaces [0], [1], etc.) */
  index: z.number().int().min(0).optional(),
  /** Flatten all items via flatMap (replaces [*] glob) */
  each: z.boolean().optional(),
  /** Alternate property name if primary is missing */
  fallback: z.string().optional(),
  /**
   * Scan pattern: iterate the array at `prop` and find the first element
   * whose nested path (dot-separated, e.g. "design.screens") is non-null.
   * Emits: `(raw?.prop ?? []).map(c => c?.a?.b).find(s => s != null)`
   */
  find: z.string().optional(),
}).refine(
  data => !(data.index !== undefined && data.each),
  { message: "Cannot use both 'index' and 'each' on the same step" }
).refine(
  data => !(data.find && data.each),
  { message: "Cannot use both 'find' and 'each' on the same step" }
).refine(
  data => !(data.find && data.index !== undefined),
  { message: "Cannot use both 'find' and 'index' on the same step" }
);
export type ProjectionStep = z.infer<typeof ProjectionStep>;

// ── Field Mapping ─────────────────────────────────────────────

export const FieldMappingSpec = z.object({
  /** Which data property to read from */
  from: z.string(),
  /** Strip this prefix from the value (e.g., "projects/" strips resource name prefix) */
  stripPrefix: z.string().optional(),
  /** Fallback: parse from alternate field if primary is missing */
  fallback: z.object({
    field: z.string(),
    splitOn: z.string(),
  }).optional(),
});
export type FieldMappingSpec = z.infer<typeof FieldMappingSpec>;

// ── Arg Specs ─────────────────────────────────────────────────

const ArgSelf = z.object({
  from: z.literal("self"),
  field: z.string().optional(),
});

const ArgSelfArray = z.object({
  from: z.literal("selfArray"),
  field: z.string().optional(),
});

const ArgParam = z.object({
  from: z.literal("param"),
  rename: z.string().optional(),
  optional: z.boolean().optional(),
  default: z.string().optional(),
});

const ArgComputed = z.object({
  from: z.literal("computed"),
  template: z.string(),
});

export const ArgSpec = z.discriminatedUnion("from", [
  ArgSelf,
  ArgSelfArray,
  ArgParam,
  ArgComputed,
]);
export type ArgSpec = z.infer<typeof ArgSpec>;

// ── Return Spec ───────────────────────────────────────────────

export const ReturnSpec = z.object({
  /** Domain class to wrap the result in */
  class: z.string().optional(),
  /** Primitive type (when not wrapping in a class) */
  type: z.string().optional(),
  /** Structured projection path into the response */
  projection: z.array(ProjectionStep),
  /** Whether the result is an array */
  array: z.boolean().optional(),
});
export type ReturnSpec = z.infer<typeof ReturnSpec>;

// ── Cache Spec ────────────────────────────────────────────────

export const CacheSpec = z.object({
  /** Structured projection path to the cached field on this.data */
  projection: z.array(ProjectionStep),
  /** Human-readable description of why this field is cached */
  description: z.string(),
});
export type CacheSpec = z.infer<typeof CacheSpec>;

// ── Factory Spec ──────────────────────────────────────────────

/** A local factory method that creates a child instance without an API call. */
export const FactorySpec = z.object({
  /** Method name on the parent class */
  method: z.string(),
  /** Domain class to instantiate */
  returns: z.string(),
  /** Description for JSDoc */
  description: z.string().optional(),
});
export type FactorySpec = z.infer<typeof FactorySpec>;

// ── Side-Effect Spec ──────────────────────────────────────────

/**
 * Declares a handwritten method on an extension class.
 * Each side effect must justify WHY it can't be generated and
 * point to its typed service contract (Spec file).
 */
export const SideEffectSpec = z.object({
  /** Method name added by the extension */
  method: z.string(),
  /** Why this method cannot be generated by the domain-map pipeline */
  reason: z.enum([
    "filesystem_io",        // reads/writes local files
    "binary_data",          // base64, streams, multipart
    "private_rest",         // no MCP tool exists
    "complex_orchestration" // multi-step with retries/rollback
  ]),
  /** Path to the Spec file relative to packages/sdk/ */
  specPath: z.string(),
});
export type SideEffectSpec = z.infer<typeof SideEffectSpec>;

// ── Class Config ──────────────────────────────────────────────

export const DomainClassConfig = z.object({
  description: z.string(),
  extensionPath: z.string().optional(),
  constructorParams: z.array(z.string()),
  isRoot: z.boolean().optional(),
  identifierField: z.string().optional(),
  fieldMapping: z.record(z.string(), FieldMappingSpec).optional(),
  parentField: z.string().optional(),
  idField: z.string().optional(),
  /** Local factory methods that create child instances without API calls */
  factories: z.array(FactorySpec).optional(),
  /**
   * Side-effect methods provided by the handwritten extension.
   * Each entry declares a method, its reason for being handwritten,
   * and the path to its typed service contract.
   */
  sideEffects: z.array(SideEffectSpec).optional(),
});
export type DomainClassConfig = z.infer<typeof DomainClassConfig>;

// ── Binding ───────────────────────────────────────────────────

export const Binding = z.object({
  /** MCP tool name */
  tool: z.string(),
  /** Domain class this method belongs to */
  class: z.string(),
  /** Method name on the class */
  method: z.string(),
  /** Argument routing specs */
  args: z.record(z.string(), ArgSpec),
  /** Return value spec with projection */
  returns: ReturnSpec,
  /** Optional cache spec for methods that check this.data first */
  cache: CacheSpec.optional(),
});
export type Binding = z.infer<typeof Binding>;

// ── Domain Map (top-level) ────────────────────────────────────

export const DomainMap = z.object({
  classes: z.record(z.string(), DomainClassConfig),
  bindings: z.array(Binding),
});
export type DomainMap = z.infer<typeof DomainMap>;
