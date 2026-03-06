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
}).refine(
  data => !(data.index !== undefined && data.each),
  { message: "Cannot use both 'index' and 'each' on the same step" }
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

// ── Class Config ──────────────────────────────────────────────

export const DomainClassConfig = z.object({
  description: z.string(),
  constructorParams: z.array(z.string()),
  isRoot: z.boolean().optional(),
  identifierField: z.string().optional(),
  fieldMapping: z.record(z.string(), FieldMappingSpec).optional(),
  parentField: z.string().optional(),
  idField: z.string().optional(),
  /** Local factory methods that create child instances without API calls */
  factories: z.array(FactorySpec).optional(),
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
