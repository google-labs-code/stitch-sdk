#!/usr/bin/env bun
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
 * Stage 3: Generate SDK
 *
 * Reads tools-manifest.json + domain-map.json and emits TypeScript
 * files into packages/sdk/generated/src/. Deterministic — no LLM involved.
 *
 * Validates the binding IR (domain-map) against its Zod schema and
 * verifies response projections against the tool output schemas.
 *
 * Updates the generated section of stitch-sdk.lock.
 *
 * Usage: bun scripts/generate-sdk.ts
 */

import { resolve, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import {
  readdirSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import {
  Project as TsProject,
  Scope,
  type SourceFile,
  type ClassDeclaration,
} from "ts-morph";
import {
  DomainMap,
  type ProjectionStep,
  type Binding,
  type ArgSpec,
} from "./ir-schema.js";
import type { Tool, ToolSchema } from "./tool-schema.js";
import { repairToolSchemas } from "../packages/sdk/src/schema-repair.js";

const ROOT_DIR = resolve(import.meta.dir, "..");
// Env overrides exist so tests can run the REAL pipeline against fixture
// inputs into a sandbox directory (see scripts/test/codegen-snapshot.test.ts).
const MANIFEST_PATH =
  process.env.STITCH_CODEGEN_MANIFEST ??
  resolve(ROOT_DIR, "packages/sdk/generated/tools-manifest.json");
const DOMAIN_MAP_PATH =
  process.env.STITCH_CODEGEN_DOMAIN_MAP ??
  resolve(ROOT_DIR, "packages/sdk/generated/domain-map.json");
const GENERATED_DIR =
  process.env.STITCH_CODEGEN_OUT ??
  resolve(ROOT_DIR, "packages/sdk/generated/src");
// When output is sandboxed, the lock is sandboxed alongside it.
const LOCK_PATH = process.env.STITCH_CODEGEN_OUT
  ? resolve(process.env.STITCH_CODEGEN_OUT, "..", "stitch-sdk.lock")
  : resolve(ROOT_DIR, "packages/sdk/generated/stitch-sdk.lock");

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function hashDirectory(dir: string): string {
  if (!existsSync(dir)) return sha256("");
  const hash = createHash("sha256");
  // Hash paths RELATIVE to dir (posix-normalized) so the hash is
  // machine-portable — absolute paths differ across checkouts.
  const files = getAllFiles(dir).sort();
  for (const file of files) {
    hash.update(relative(dir, file).split(sep).join("/"));
    hash.update(readFileSync(file));
  }
  return hash.digest("hex");
}

function getAllFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

// ── Output Schema Validation ──────────────────────────────────

/**
 * Resolve a $ref in a JSON Schema, returning the referenced schema.
 */
export function resolveRef(
  schema: ToolSchema,
  ref: string,
): ToolSchema | undefined {
  // $ref format: "#/$defs/Foo"
  const parts = ref.replace("#/", "").split("/");
  let node: any = schema;
  for (const p of parts) {
    node = node?.[p];
  }
  return node;
}

/**
 * Validate that a projection path resolves against a JSON Schema.
 *
 * Semantics MATCH EMISSION exactly:
 *  - plain prop access on an array schema is an ERROR (the emitted
 *    `?.prop` chain would yield undefined at runtime) — use index/each/find
 *  - `find` dot-paths are validated against the array item schema
 *  - `index`/`each` on a non-array property is an ERROR
 *
 * Returns lint warnings: applying index/find to an UNBOUNDED array
 * silently truncates data unless the step sets acknowledgeSingle
 * (this is the exact shape of the generate() multi-screen bug).
 */
export function validateProjection(
  projection: ProjectionStep[],
  outputSchema: ToolSchema | null | undefined,
  bindingLabel: string,
): string[] {
  if (!outputSchema) return []; // No schema to validate against

  const warnings: string[] = [];
  let currentSchema: ToolSchema | undefined = outputSchema;
  const rootSchema = outputSchema;
  const deref = (s: ToolSchema | undefined): ToolSchema | undefined =>
    s?.$ref ? resolveRef(rootSchema, s.$ref) : s;

  for (let i = 0; i < projection.length; i++) {
    const step = projection[i];
    currentSchema = deref(currentSchema);

    if (currentSchema?.type === "array") {
      throw new Error(
        `❌ Binding "${bindingLabel}" projection step ${i + 1}: ` +
          `cannot access property "${step.prop}" on an ARRAY schema.\n` +
          `   The emitted optional chain would be undefined at runtime.\n` +
          `   Fix: add "index", "each", or "find" to the previous step.`,
      );
    }

    const props = currentSchema?.properties;
    if (!props) {
      // Can't validate further (schema is too loose)
      return warnings;
    }

    if (!(step.prop in props)) {
      const available = Object.keys(props).join(", ");
      throw new Error(
        `❌ Binding "${bindingLabel}" projection step ${i + 1}: ` +
          `property "${step.prop}" not found in outputSchema.\n` +
          `   Available properties: ${available}\n` +
          `   Fix: check the projection in domain-map.json for this binding.`,
      );
    }

    // Advance to the property's schema
    currentSchema = deref(props[step.prop]);

    if (step.find) {
      if (currentSchema?.type !== "array") {
        throw new Error(
          `❌ Binding "${bindingLabel}" projection step ${i + 1}: ` +
            `"find" requires an array property, but "${step.prop}" is not an array.`,
        );
      }
      lintUnbounded(currentSchema, step, bindingLabel, i, warnings, "find");
      const itemSchema = deref(currentSchema.items);
      // Validate the dot-path against the item schema
      let node: ToolSchema | undefined = itemSchema;
      for (const part of step.find.split(".")) {
        node = deref(node);
        if (node?.type === "array") node = deref(node.items);
        const nodeProps = node?.properties;
        if (!nodeProps) break; // loose — stop validating the path
        if (!(part in nodeProps)) {
          throw new Error(
            `❌ Binding "${bindingLabel}" projection step ${i + 1}: ` +
              `find path "${step.find}": property "${part}" not found in item schema.\n` +
              `   Available properties: ${Object.keys(nodeProps).join(", ")}`,
          );
        }
        node = nodeProps[part];
      }
      // After find we are positioned ON the found element
      currentSchema = itemSchema;
      continue;
    }

    if (step.index !== undefined || step.each) {
      if (currentSchema?.type !== "array" || !currentSchema.items) {
        throw new Error(
          `❌ Binding "${bindingLabel}" projection step ${i + 1}: ` +
            `"${step.index !== undefined ? "index" : "each"}" used on ` +
            `non-array property "${step.prop}".`,
        );
      }
      if (step.index !== undefined) {
        lintUnbounded(currentSchema, step, bindingLabel, i, warnings, "index");
      }
      currentSchema = deref(currentSchema.items);
    }
    // Plain prop access: if this left us on an array and another step
    // follows, the array check at the top of the next iteration throws.
  }

  return warnings;
}

function lintUnbounded(
  arraySchema: ToolSchema,
  step: ProjectionStep,
  bindingLabel: string,
  stepIndex: number,
  warnings: string[],
  kind: "index" | "find",
): void {
  if ((arraySchema as any).maxItems === undefined && !step.acknowledgeSingle) {
    warnings.push(
      `⚠️  Binding "${bindingLabel}" step ${stepIndex + 1}: "${kind}" takes ` +
        `a single element from the UNBOUNDED array "${step.prop}" — other ` +
        `elements are silently dropped. If intentional, set ` +
        `"acknowledgeSingle": true on the step; otherwise use "each".`,
    );
  }
}

// ── Projection Code Emission ──────────────────────────────────

/**
 * Emit TypeScript code for a projection path.
 *
 * Walks the ProjectionStep[] array and emits property access,
 * [index], .flatMap() for each step, or .map().find() for find steps.
 */
export function emitProjection(
  steps: ProjectionStep[],
  rawVar: string = "raw",
): string {
  if (steps.length === 0) return rawVar;

  // Check if any step uses 'each' (flatMap pattern)
  const hasEach = steps.some((s) => s.each);

  if (hasEach) {
    return emitFlatMapProjection(steps, rawVar);
  }

  // Check if any step uses 'find' (scan pattern)
  const findIndex = steps.findIndex((s) => s.find);
  if (findIndex !== -1) {
    return emitFindProjection(steps, findIndex, rawVar);
  }

  // Simple chain with optional chaining: raw.outputComponents?.[0]?.design?.screens?.[0]
  let code = rawVar;
  for (const step of steps) {
    code += `?.${step.prop}`;
    if (step.index !== undefined) {
      code += `?.[${step.index}]`;
    }
  }
  return code;
}

/**
 * Emit a scan-based projection for steps with 'find'.
 *
 * e.g. [{ prop: "outputComponents", find: "design.screens" }, { prop: "design" }, { prop: "screens", index: 0 }]
 * emits: (raw?.outputComponents ?? []).find((c: any) => c?.design?.screens != null)?.design?.screens?.[0]
 *
 * The find step scans the array at `prop` and returns the first element
 * whose nested path (dot-separated) is non-null. Remaining steps
 * after the find step continue as a normal optional chain on that element.
 */
function emitFindProjection(
  steps: ProjectionStep[],
  findIdx: number,
  rawVar: string,
): string {
  const findStep = steps[findIdx];
  const findPath = findStep.find!;

  // Build prefix chain for steps before the find step
  let prefix = rawVar;
  for (let i = 0; i < findIdx; i++) {
    prefix += `?.${steps[i].prop}`;
    if (steps[i].index !== undefined) {
      prefix += `?.[${steps[i].index}]`;
    }
  }

  // Build the find-scan expression
  // (prefix?.prop ?? []).find((c: any) => c?.a?.b != null)
  const innerChain = findPath
    .split(".")
    .map((p) => `?.${p}`)
    .join("");
  let code = `(${prefix}?.${findStep.prop} ?? []).find((c: any) => c${innerChain} != null)`;

  // Chain remaining steps after the find step
  for (let i = findIdx + 1; i < steps.length; i++) {
    code += `?.${steps[i].prop}`;
    if (steps[i].index !== undefined) {
      code += `?.[${steps[i].index}]`;
    }
  }

  return code;
}

/**
 * Emit flatMap chain for projections with 'each' steps.
 * e.g. [each:outputComponents, prop:design, each:screens] →
 *   (raw.outputComponents || []).flatMap((a: any) => a.design.screens || [])
 */
function emitFlatMapProjection(
  steps: ProjectionStep[],
  rawVar: string,
): string {
  let code = rawVar;
  let tempVar = "a";
  let i = 0;

  while (i < steps.length) {
    const step = steps[i];
    code += `.${step.prop}`;

    if (step.each) {
      // Collect subsequent non-each steps to chain onto the flatMap var
      code = `(${code} || [])`;
      const innerSteps: string[] = [];
      i++;
      while (i < steps.length && !steps[i].each) {
        innerSteps.push(`?.${steps[i].prop}`);
        if (steps[i].index !== undefined) {
          // Optional index: guard against a missing intermediate so the
          // flatMap callback returns undefined (→ [] via `|| []`) instead
          // of throwing on `undefined[i]`. Matches the simple-chain emitter.
          innerSteps.push(`?.[${steps[i].index}]`);
        }
        i++;
      }

      // If there are more 'each' steps after inner steps, continue flatMap chain
      if (i < steps.length && steps[i].each) {
        const innerPath = innerSteps.join("") + `?.${steps[i].prop}`;
        code = `${code}.flatMap((${tempVar}: any) => ${tempVar}${innerPath} || [])`;
        tempVar = String.fromCharCode(tempVar.charCodeAt(0) + 1);
        i++;
      } else if (innerSteps.length > 0) {
        // Terminal: flatMap with inner path
        const innerPath = innerSteps.join("");
        code = `${code}.flatMap((${tempVar}: any) => ${tempVar}${innerPath} || [])`;
        tempVar = String.fromCharCode(tempVar.charCodeAt(0) + 1);
      }
    } else if (step.index !== undefined) {
      code += `?.[${step.index}]`;
      i++;
    } else {
      i++;
    }
  }

  return code;
}

/**
 * Emit TypeScript code for a cache check projection.
 * e.g. [screenshot, downloadUrl] → this.data?.screenshot?.downloadUrl
 * Supports `index` ([{cards, index: 0}] → this.data?.cards?.[0]);
 * `each`/`find` are rejected by the IR schema (no cache semantics).
 */
export function emitCacheProjection(steps: ProjectionStep[]): string {
  let code = "(this.data as any)";
  for (const step of steps) {
    code += `?.${step.prop}`;
    if (step.index !== undefined) {
      code += `?.[${step.index}]`;
    }
  }
  return code;
}

/**
 * Convert JSON Schema type to TypeScript type.
 * Supports primitives, enums, arrays, objects with properties, and $ref.
 */
export function jsonSchemaToTs(
  prop: ToolSchema | null | undefined,
  defs?: Record<string, ToolSchema>,
  namedTypes?: Map<string, string>,
): string {
  if (!prop) return "any";

  // Resolve $ref before anything else
  if (prop.$ref) {
    const refName = prop.$ref.replace("#/$defs/", "");
    const mappedName = namedTypes?.get(refName);
    if (mappedName) return mappedName;
    console.log(
      `[DEBUG] Resolving $ref "${refName}" recursively because it was not in namedTypes.`,
    );
    const resolved = defs?.[refName];
    return resolved ? jsonSchemaToTs(resolved, defs, namedTypes) : "any";
  }

  // Merge $defs from current schema into the defs context
  const allDefs = { ...defs, ...prop.$defs };

  if (prop.enum) {
    return prop.enum.map((v: string) => `"${v}"`).join(" | ");
  }
  switch (prop.type) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      if (prop.items) {
        const itemType = jsonSchemaToTs(prop.items, allDefs, namedTypes);
        // Parenthesize union/intersection item types: `"A" | "B"` must
        // become `("A" | "B")[]`, not `"A" | "B"[]` (which TS parses as
        // `"A" | ("B"[])` — the VariantOptions.aspects precedence bug).
        return /[|&]/.test(itemType) ? `(${itemType})[]` : `${itemType}[]`;
      }
      return "any[]";
    case "object":
      if (prop.properties) {
        return emitObjectLiteral(prop, allDefs, namedTypes);
      }
      if (prop.additionalProperties) {
        return `Record<string, ${jsonSchemaToTs(prop.additionalProperties, allDefs, namedTypes)}>`;
      }
      return "Record<string, unknown>";
    default:
      return "any";
  }
}

/**
 * Emit an inline TypeScript object literal type from a JSON Schema with properties.
 * e.g. { name: string; count?: number }
 */
function emitObjectLiteral(
  schema: ToolSchema,
  defs?: Record<string, ToolSchema>,
  namedTypes?: Map<string, string>,
): string {
  const props = schema.properties!;
  const required = new Set(schema.required || []);
  const fields = Object.entries(props).map(([name, fieldSchema]) => {
    const opt = required.has(name) ? "" : "?";
    const type = jsonSchemaToTs(fieldSchema, defs, namedTypes);
    return `${name}${opt}: ${type}`;
  });
  return `{ ${fields.join("; ")} }`;
}

/**
 * Emit TypeScript interfaces from JSON Schema $defs.
 */
export function emitNamedInterfaces(
  defs: Record<string, ToolSchema>,
  namedTypes: Map<string, string>,
): string {
  const interfaces: string[] = [];
  for (const [name, schema] of Object.entries(defs)) {
    const desc = schema.description ? `/** ${schema.description} */\n` : "";
    const typeLit = emitObjectLiteral(schema, defs, namedTypes);
    // Convert `{ a: string; b: string }` -> `{\n  a: string;\n  b: string;\n}`
    const intf =
      typeLit === "{  }"
        ? "{}"
        : typeLit
            .replace(/^{ /, "{\n  ")
            .replace(/ }$/, ";\n}")
            .replace(/; /g, ";\n  ");
    interfaces.push(`${desc}export interface ${name} ${intf}`);
  }
  return interfaces.join("\n\n");
}

/**
 * Convert a snake_case tool name to a PascalCase response name.
 * e.g. "list_screens" -> "ListScreensResponse"
 */
function toResponseName(toolName: string): string {
  return (
    toolName
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") + "Response"
  );
}

/**
 * Emit TypeScript interfaces for a tool's outputSchema.
 */
export function emitResponseType(
  tool: Tool,
  namedTypes?: Map<string, string>,
): string {
  const schema = tool.outputSchema;
  if (!schema || schema.type !== "object" || !schema.properties) {
    return `export interface ${toResponseName(tool.name)} {}`;
  }
  const desc = tool.description
    ? `/** Response message for ${tool.name}. */\n`
    : "";
  const typeLit = emitObjectLiteral(
    schema,
    tool.outputSchema?.$defs,
    namedTypes,
  );
  const intf =
    typeLit === "{  }"
      ? "{}"
      : typeLit
          .replace(/^{ /, "{\n  ")
          .replace(/ }$/, ";\n}")
          .replace(/; /g, ";\n  ");
  return `${desc}export interface ${toResponseName(tool.name)} ${intf}`;
}

/**
 * A method parameter ready for ts-morph's addMethod({ parameters }).
 */
export interface MethodParam {
  name: string;
  type: string;
  hasQuestionToken: boolean;
}

/**
 * Convert a tool's inputSchema properties to method parameters.
 * Types are derived from the manifest inputSchema, not hardcoded in domain-map.
 *
 * Signature shape (D12): required params are positional, in IR order.
 * All optional params are collected into a single trailing
 * `options?: { ... }` object so future fields (onProgress, signal,
 * new server-side params) can be added without breaking signatures.
 */
export function generateMethodParams(
  tool: Tool,
  args: Record<string, ArgSpec>,
  namedTypes?: Map<string, string>,
  bindingLabel?: string,
): MethodParam[] {
  const positional: MethodParam[] = [];
  const optional: { name: string; type: string }[] = [];
  for (const [name, spec] of Object.entries(args)) {
    if (spec.from !== "param") continue;
    const paramName = spec.rename || name;
    const toolProp = tool.inputSchema?.properties?.[name];
    const defs = tool.inputSchema?.$defs;
    const tsType = toolProp
      ? jsonSchemaToTs(toolProp, defs, namedTypes)
      : name.endsWith("Id")
        ? "string"
        : "any";
    if (spec.optional) {
      optional.push({ name: paramName, type: tsType });
    } else {
      positional.push({
        name: paramName,
        type: tsType,
        hasQuestionToken: false,
      });
    }
  }
  if (optional.length > 0) {
    if (positional.some((p) => p.name === "options")) {
      throw new Error(
        `❌ Binding "${bindingLabel}": a required param is named "options", ` +
          `which collides with the generated options object. ` +
          `Use "rename" in domain-map.json to rename it.`,
      );
    }
    const primaryOpt = optional[0];
    const optionsObjType = `{ ${optional.map((o) => `${o.name}?: ${o.type}`).join("; ")} }`;
    positional.push({
      name: `${primaryOpt.name}OrOptions`,
      type: `${primaryOpt.type} | ${optionsObjType}`,
      hasQuestionToken: true,
    });
    for (let i = 1; i < optional.length; i++) {
      positional.push({
        name: optional[i].name,
        type: optional[i].type,
        hasQuestionToken: true,
      });
    }
  }
  return positional;
}

// ── Arg Object Generation ─────────────────────────────────────

export function generateArgsObject(args: Record<string, ArgSpec>): string {
  const entries: string[] = [];
  for (const [name, spec] of Object.entries(args)) {
    if (spec.from === "self") {
      entries.push(`${name}: this.${name}`);
    } else if (spec.from === "selfArray") {
      const field = spec.field || name;
      entries.push(`${name}: [this.${field}]`);
    } else if (spec.from === "param") {
      const paramName = spec.rename || name;
      // Optional params live on the trailing options object (D12);
      // a declared default is applied when the caller omits the value.
      if (spec.optional) {
        const defaultSuffix =
          spec.default !== undefined
            ? ` ?? ${JSON.stringify(spec.default)}`
            : "";
        entries.push(`${name}: options?.${paramName}${defaultSuffix}`);
      } else {
        entries.push(name === paramName ? name : `${name}: ${paramName}`);
      }
    } else if (spec.from === "computed") {
      const templateStr = spec.template || "";
      const interpolated = templateStr.replace(/\{(\w+)\}/g, (_, key) => {
        const argSpec = args[key];
        if (argSpec?.from === "self" || argSpec?.from === "selfArray")
          return `\${this.${key}}`;
        if (!argSpec) return `\${this.${key}}`; // Assume it's a field on the class if not in args
        if (argSpec.from === "param") {
          const paramName = argSpec.rename || key;
          return argSpec.optional
            ? `\${options?.${paramName}}`
            : `\${${paramName}}`;
        }
        return `\${${key}}`;
      });
      entries.push(`${name}: \`${interpolated}\``);
    }
  }
  return `{ ${entries.join(", ")} }`;
}

// ── Return Expression Generation ──────────────────────────────

function generateReturnExpression(
  binding: Binding,
  className: string,
  domainMap: ReturnType<typeof DomainMap.parse>,
): string {
  const projection = binding.returns.projection;
  const projectionExpr = emitProjection(projection);

  if (binding.returns.kind === "generation") {
    const childClass = domainMap.classes[binding.returns.class!];
    const parentField = childClass?.parentField;
    const keys = childClass?.reference?.keys
      ? JSON.stringify(childClass.reference.keys)
      : "[]";
    const itemExpr = parentField
      ? `{ ...item, ${parentField}: this.${parentField} }`
      : "item";
    return (
      `const _screens = (${projectionExpr} || []).map((item) => this.client.entities.resolve(${binding.returns.class}, ${keys}, ${itemExpr}));\n` +
      `  if (_screens.length === 0) throw new StitchError({ code: "UNKNOWN_ERROR", message: "Incomplete API response from ${binding.tool}: no screens in response", recoverable: false });\n` +
      `  return new Generation(_screens, raw)`
    );
  }

  if (binding.returns.class) {
    const childClass = domainMap.classes[binding.returns.class];
    const parentField = childClass?.parentField;
    const keys = childClass?.reference?.keys
      ? JSON.stringify(childClass.reference.keys)
      : "[]";

    if (binding.returns.array) {
      const itemExpr = parentField
        ? `{ ...item, ${parentField}: this.${parentField} }`
        : "item";
      // Null-safe: default to empty array if projection yields undefined
      return `(${projectionExpr} || []).map((item) => this.client.entities.resolve(${binding.returns.class}, ${keys}, ${itemExpr}))`;
    }

    // Only emit guard when projection has actual steps (not just `raw`)
    if (projection.length > 0) {
      const guardVar = "_projected";
      const dataExpr = parentField
        ? `{ ...${guardVar}, ${parentField}: this.${parentField} }`
        : guardVar;
      const toolName = binding.tool;
      return (
        `const ${guardVar} = ${projectionExpr};\n` +
        `  if (!${guardVar}) throw new StitchError({ code: "UNKNOWN_ERROR", message: "Incomplete API response from ${toolName}: expected object at projection path", recoverable: false });\n` +
        `  return this.client.entities.resolve(${binding.returns.class}, ${keys}, ${dataExpr})`
      );
    }

    // Direct return — projection is empty, raw is the result itself
    const dataExpr = parentField
      ? `{ ...${projectionExpr}, ${parentField}: this.${parentField} }`
      : projectionExpr;
    return `this.client.entities.resolve(${binding.returns.class}, ${keys}, ${dataExpr})`;
  }

  // Typed primitive returns with a real projection: a missing value is a
  // NOT_FOUND error, never a silent empty string (the old `|| ""`).
  if (projection.length > 0) {
    const pathDesc = projection.map((s) => s.prop).join(".");
    return (
      `const _value = ${projectionExpr};\n` +
      `  if (_value == null || _value === "") throw new StitchError({ code: "NOT_FOUND", message: "${binding.tool} response has no ${pathDesc} for this resource", recoverable: false });\n` +
      `  return _value`
    );
  }

  // Direct return — the raw response itself
  return projectionExpr;
}

// ── Constructor Body Builder ──────────────────────────────────

function buildConstructorBody(
  config: ReturnType<typeof DomainMap.parse>["classes"][string],
): string[] {
  const statements: string[] = [];
  const params = config.constructorParams || [];
  const lastParam = params[params.length - 1];
  statements.push(
    `this.data = typeof data === "object" && data !== null ? data : undefined;`,
  );
  if (params.length > 0) {
    statements.push(
      `const _rawName = typeof data === "string" ? data : (typeof data?.name === "string" ? data.name : "");`,
    );
    statements.push(`if (_rawName.includes("/")) {`);
    statements.push(`  const _parts = _rawName.split("/");`);
    statements.push(`  for (let _i = 0; _i < _parts.length - 1; _i += 2) {`);
    statements.push(
      `    const _k = (_parts[_i].endsWith("s") ? _parts[_i].slice(0, -1) : _parts[_i]) + "Id";`,
    );
    statements.push(`    (this as any)[_k] = _parts[_i + 1];`);
    statements.push(`  }`);
    statements.push(`}`);
    statements.push(`if (typeof data === "string") {`);
    statements.push(
      `  if (!(this as any).${lastParam}) (this as any).${lastParam} = data.includes("/") ? data.split("/").pop()! : data;`,
    );
    statements.push(`} else if (typeof data === "object" && data !== null) {`);
    for (const p of params) {
      statements.push(`  if (data.${p}) (this as any).${p} = data.${p};`);
    }
    statements.push(
      `  if (!(this as any).${lastParam} && data.id) (this as any).${lastParam} = data.id;`,
    );
    statements.push(
      `  if (!(this as any).${lastParam} && typeof data.name === "string") (this as any).${lastParam} = data.name.includes("/") ? data.name.split("/").pop()! : data.name;`,
    );
    statements.push(`}`);
  }
  return statements;
}

// ── Method Body Builder ───────────────────────────────────────

function buildMethodBody(
  binding: Binding,
  className: string,
  domainMap: ReturnType<typeof DomainMap.parse>,
): string[] {
  const statements: string[] = [];

  const optionalParams: string[] = [];
  for (const [name, spec] of Object.entries(binding.args)) {
    if (spec.from === "param" && spec.optional) {
      optionalParams.push(spec.rename || name);
    }
  }
  if (optionalParams.length > 0) {
    const primary = optionalParams[0];
    const subsequent = optionalParams.slice(1);
    const subsequentFields = subsequent.map((p) => `${p}: ${p}`).join(", ");
    const subsequentPart = subsequentFields ? `, ${subsequentFields}` : "";
    statements.push(
      `const options = typeof ${primary}OrOptions === "object" && ${primary}OrOptions !== null && !Array.isArray(${primary}OrOptions) ? ${primary}OrOptions : { ${primary}: ${primary}OrOptions${subsequentPart} };`,
    );
  }

  // Cache check
  if (binding.cache) {
    const cacheExpr = emitCacheProjection(binding.cache.projection);
    statements.push(`// ${binding.cache.description}`);
    statements.push(`if (${cacheExpr}) return ${cacheExpr};`);
    statements.push(``);
  }

  statements.push(`try {`);
  const responseName = toResponseName(binding.tool);
  statements.push(
    `  const raw = await this.client.callTool<${responseName}>("${binding.tool}", ${generateArgsObject(binding.args)});`,
  );
  if (binding.cache?.writeBack) {
    statements.push(
      `  // writeBack: merge the response into this.data so the next call hits the cache`,
    );
    statements.push(
      `  if (raw && typeof raw === "object") this.data = { ...(this.data as object | undefined), ...raw };`,
    );
  }
  const retExpr = generateReturnExpression(binding, className, domainMap);
  // If retExpr contains newlines, it has guard statements — don't wrap in return
  if (retExpr.includes("\n")) {
    statements.push(`  ${retExpr.endsWith(";") ? retExpr : retExpr + ";"}`);
  } else {
    statements.push(`  return ${retExpr};`);
  }
  statements.push(`} catch (error) {`);
  statements.push(`  throw StitchError.fromUnknown(error);`);
  statements.push(`}`);

  return statements;
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log("📖 Reading inputs...");

  const manifestContent = await Bun.file(MANIFEST_PATH).text();
  const domainMapContent = await Bun.file(DOMAIN_MAP_PATH).text();

  const manifest: Tool[] = JSON.parse(manifestContent);

  // The manifest stores schemas RAW as captured. Repair (injecting
  // missing $defs) happens at LOAD time so codegen sees resolvable
  // schemas without coupling the captured source of truth to the
  // repair heuristics. Repairs are recorded in the lock for visibility.
  const preRepair = new Map(
    manifest.map((t) => [t.name, JSON.stringify(t)] as const),
  );
  repairToolSchemas(manifest as any);
  const repairedTools = manifest
    .filter((t) => preRepair.get(t.name) !== JSON.stringify(t))
    .map((t) => t.name);
  if (repairedTools.length > 0) {
    console.log(`🩹 Schema repair applied to: ${repairedTools.join(", ")}`);
  }

  const domainMap = DomainMap.parse(JSON.parse(domainMapContent));

  console.log("🔍 Validating binding IR...");
  console.log("  ✓ IR schema valid");

  // Validate projections against output schemas
  console.log("🔍 Validating projections against output schemas...");
  const lintWarnings: string[] = [];
  // Generative tools MUST NOT truncate: for these, the unbounded-array
  // lint escalates from warning to hard error unless the binding uses
  // kind:"generation" (which requires `each` by IR schema) or explicitly
  // acknowledges single-item semantics on the step.
  const GENERATIVE_TOOL = /^(generate_|edit_|apply_)/;
  for (const binding of domainMap.bindings) {
    const tool = manifest.find((t) => t.name === binding.tool);
    if (!tool?.outputSchema) continue;

    const warnings = validateProjection(
      binding.returns.projection,
      tool.outputSchema,
      `${binding.class}.${binding.method}`,
    );
    if (warnings.length > 0 && GENERATIVE_TOOL.test(binding.tool)) {
      throw new Error(
        `❌ Generative tool binding truncates data:\n` +
          warnings.join("\n") +
          `\n   Fix: use "kind": "generation" with an "each" projection.`,
      );
    }
    lintWarnings.push(...warnings);
  }
  console.log("  ✓ All projections valid against output schemas");
  for (const warning of lintWarnings) {
    console.warn(warning);
  }

  // ── Side-effect validation ───────────────────────────────────
  // Ensure handwritten extension methods don't shadow generated methods,
  // and that each spec file exists.
  for (const [className, config] of Object.entries(domainMap.classes)) {
    if (!config.sideEffects?.length) continue;

    // Collect generated method names for this class
    const generatedMethods = new Set(
      domainMap.bindings
        .filter((b) => b.class === className)
        .map((b) => b.method),
    );

    for (const se of config.sideEffects) {
      // Check for method name collision
      if (generatedMethods.has(se.method)) {
        throw new Error(
          `❌ Side-effect collision: ${className}.${se.method} is declared as both a ` +
            `generated binding and a handwritten sideEffect. Extension methods must NOT ` +
            `shadow generated methods.`,
        );
      }

      // Check that spec file exists
      const specAbsPath = resolve(ROOT_DIR, "packages/sdk", se.specPath);
      if (!existsSync(specAbsPath)) {
        throw new Error(
          `❌ Missing spec file: ${className}.${se.method} declares specPath ` +
            `"${se.specPath}" but file does not exist at ${specAbsPath}`,
        );
      }
    }
  }
  console.log("  ✓ Side-effect declarations valid");

  const manifestHash = sha256(manifestContent);
  const domainMapHash = sha256(domainMapContent);

  // Clean and recreate generated directory
  if (existsSync(GENERATED_DIR)) {
    rmSync(GENERATED_DIR, { recursive: true });
  }
  mkdirSync(GENERATED_DIR, { recursive: true });

  // Create ts-morph project
  const tsProject = new TsProject({
    compilerOptions: {
      target: 1, // ES5 — doesn't affect output, just AST construction
      module: 99, // ESNext
      declaration: false,
    },
    useInMemoryFileSystem: true,
  });

  // No timestamp in emitted headers: output must be byte-reproducible
  // so regeneration is idempotent and lock hashes are stable. Provenance
  // is fully identified by the source hashes; generatedAt lives in the lock.
  const headerComment = [
    `AUTO-GENERATED by scripts/generate-sdk.ts`,
    `DO NOT EDIT — changes will be overwritten.`,
    ``,
    `Source: tools-manifest.json (sha256:${manifestHash.slice(0, 12)}...)`,
    `        domain-map.json     (sha256:${domainMapHash.slice(0, 12)}...)`,
  ].join("\n");

  // ── Phase A: Generate named input types ─────────────────────
  const allDefs: Record<string, ToolSchema> = {};
  for (const tool of manifest) {
    if (tool.inputSchema?.$defs) {
      Object.assign(allDefs, tool.inputSchema.$defs);
    }
    if (tool.outputSchema?.$defs) {
      Object.assign(allDefs, tool.outputSchema.$defs);
    }
  }
  // Map original def name -> emitted TS name (handles collisions)
  const namedTypes = new Map<string, string>();
  const renamedDefs: Record<string, ToolSchema> = {};
  for (const [name, def] of Object.entries(allDefs)) {
    // If it collides with a domain class, append "Input"
    const newName = domainMap.classes[name] ? `${name}Input` : name;
    namedTypes.set(name, newName);
    renamedDefs[newName] = def;
  }

  function emitEntityDataInterfaces(
    domainMap: ReturnType<typeof DomainMap.parse>,
  ): string {
    const chunks: string[] = [];
    chunks.push(
      `export interface ThumbnailScreenshot {\n` +
        `  name: string;\n` +
        `  downloadUrl: string;\n` +
        `}`,
    );
    for (const [className, config] of Object.entries(domainMap.classes)) {
      if (config.isRoot) continue;
      if (className === "Project") {
        chunks.push(
          `/** Cached data interface for Project [V1_PLAN D4]. */\n` +
            `export interface ProjectData {\n` +
            `  name?: string;\n` +
            `  title?: string;\n` +
            `  visibility?: string;\n` +
            `  createTime?: string;\n` +
            `  updateTime?: string;\n` +
            `  projectType?: string;\n` +
            `  origin?: string;\n` +
            `  deviceType?: string;\n` +
            `  thumbnailScreenshot?: ThumbnailScreenshot;\n` +
            `  designTheme?: DesignTheme;\n` +
            `  screenInstances?: ScreenInstance[];\n` +
            `  [key: string]: any;\n` +
            `}`,
        );
      } else if (className === "Screen") {
        chunks.push(
          `/** Cached data interface for Screen [V1_PLAN D4]. */\n` +
            `export interface ScreenData {\n` +
            `  name?: string;\n` +
            `  title?: string;\n` +
            `  htmlCode?: File;\n` +
            `  screenshot?: File;\n` +
            `  [key: string]: any;\n` +
            `}`,
        );
      } else {
        chunks.push(
          `/** Cached data interface for ${className} [V1_PLAN D4]. */\n` +
            `export interface ${className}Data {\n` +
            `  name?: string;\n` +
            `  title?: string;\n` +
            `  displayName?: string;\n` +
            `  [key: string]: any;\n` +
            `}`,
        );
      }
    }
    return chunks.join("\n\n");
  }

  let fileCount = 0;
  const typesFile = tsProject.createSourceFile("types.generated.ts");
  typesFile.addStatements(
    `/**\n * ${headerComment}\n */\n\n${emitNamedInterfaces(renamedDefs, namedTypes)}\n\n${emitEntityDataInterfaces(domainMap)}`,
  );
  await Bun.write(
    resolve(GENERATED_DIR, "types.generated.ts"),
    typesFile.getFullText(),
  );
  fileCount++;

  // ── Phase B: Generate named response types ────────────────────
  const responsesFile = tsProject.createSourceFile("responses.generated.ts");
  const responseTypes: string[] = [];
  if (namedTypes.size > 0) {
    responsesFile.addImportDeclaration({
      moduleSpecifier: "./types.generated.js",
      namedImports: Array.from(namedTypes.values()),
    });
  }
  for (const tool of manifest) {
    responseTypes.push(emitResponseType(tool, namedTypes));
  }
  responsesFile.addStatements(
    `/**\n * ${headerComment}\n */\n\n${responseTypes.join("\n\n")}`,
  );
  await Bun.write(
    resolve(GENERATED_DIR, "responses.generated.ts"),
    responsesFile.getFullText(),
  );
  fileCount++;

  let fileCountTotal = fileCount;

  // Generate a class file for each domain class
  for (const [className, config] of Object.entries(domainMap.classes)) {
    const classBindings = domainMap.bindings.filter(
      (b) => b.class === className,
    );
    const classFileName = className.toLowerCase();

    console.log(`  📄 ${classFileName}.ts (${classBindings.length} methods)`);

    // Collect return classes for imports (from bindings + factories)
    const returnClasses = new Set<string>();
    for (const b of classBindings) {
      if (b.returns.class && b.returns.class !== className) {
        returnClasses.add(b.returns.class);
      }
    }
    if (config.factories) {
      for (const f of config.factories) {
        if (f.returns !== className) {
          returnClasses.add(f.returns);
        }
      }
    }

    // Create source file
    const sourceFile = tsProject.createSourceFile(`${classFileName}.ts`);

    // Header comment
    sourceFile.addStatements(`/**\n * ${headerComment}\n */\n`);

    // Imports
    // Depend on the SPEC interface, not the concrete client: tests and
    // alternative transports inject spec-conforming fakes without
    // vi.mock'ing the class [V1_PLAN §4.1].
    sourceFile.addImportDeclaration({
      moduleSpecifier: "../../src/spec/client.js",
      namedImports: [{ name: "StitchToolClientSpec", isTypeOnly: true }],
    });
    sourceFile.addImportDeclaration({
      moduleSpecifier: "../../src/spec/errors.js",
      namedImports: ["StitchError"],
    });
    if (classBindings.some((b) => b.returns.kind === "generation")) {
      sourceFile.addImportDeclaration({
        moduleSpecifier: "../../src/generation.js",
        namedImports: ["Generation"],
      });
    }
    const typesToImport = new Set(namedTypes.values());
    if (!config.isRoot) {
      typesToImport.add(`${className}Data`);
    }
    if (typesToImport.size > 0) {
      sourceFile.addImportDeclaration({
        moduleSpecifier: "./types.generated.js",
        namedImports: Array.from(typesToImport),
      });
    }

    // Import response types used by bindings in this class
    const requiredResponses = new Set<string>();
    for (const b of classBindings) {
      requiredResponses.add(toResponseName(b.tool));
    }
    if (requiredResponses.size > 0) {
      sourceFile.addImportDeclaration({
        moduleSpecifier: "./responses.generated.js",
        namedImports: Array.from(requiredResponses),
      });
    }

    for (const rc of returnClasses) {
      const targetClassConfig = domainMap.classes[rc];
      if (targetClassConfig?.extensionPath) {
        sourceFile.addImportDeclaration({
          moduleSpecifier: targetClassConfig.extensionPath,
          namedImports: [rc],
        });
      } else {
        sourceFile.addImportDeclaration({
          moduleSpecifier: `./${rc.toLowerCase()}.js`,
          namedImports: [rc],
        });
      }
    }

    // Class
    const cls = sourceFile.addClass({
      name: className,
      isExported: true,
      docs: [{ description: config.description }],
    });

    // Public-interface merge: an extension class adds handwritten methods
    // (e.g. Screen.getHtml/getImage) that the EntityManager registry
    // returns at runtime. Declaration-merge their signatures onto the
    // generated class TYPE so self-referential returns (edit()/variants()
    // → Generation<Screen>) expose them to consumers, without a runtime
    // import cycle. Type-only import + interface merge are both erased.
    if (config.publicInterface) {
      sourceFile.addImportDeclaration({
        moduleSpecifier: config.publicInterface.importPath,
        namedImports: [{ name: config.publicInterface.name, isTypeOnly: true }],
      });
      sourceFile.addInterface({
        name: className,
        isExported: true,
        extends: [config.publicInterface.name],
        docs: [
          {
            description:
              `Declaration-merged so the generated ${className} type includes ` +
              `the handwritten extension methods provided at runtime.`,
          },
        ],
      });
    }

    // Constructor
    const clientScope = config.extensionPath ? Scope.Protected : Scope.Private;
    if (config.isRoot) {
      cls.addConstructor({
        parameters: [
          { name: "client", type: "StitchToolClientSpec", scope: clientScope },
        ],
      });
    } else {
      // Stable identity key for the EntityManager — class names are
      // mangled by consumer minifiers, so never rely on EntityClass.name.
      cls.addProperty({
        name: "entityKey",
        isStatic: true,
        isReadonly: true,
        initializer: `"${className}"`,
        docs: [{ description: "Stable identity-map key (minification-safe)." }],
      });
      // Declare fields
      for (const p of config.constructorParams) {
        cls.addProperty({
          name: p,
          type: "string",
          scope: Scope.Public,
          isReadonly: true,
          hasExclamationToken: true,
        });
      }
      cls.addProperty({
        name: "data",
        type: `${className}Data`,
        hasQuestionToken: true,
        scope: Scope.Public,
      });

      cls.addGetAccessor({
        name: "title",
        returnType: "string | undefined",
        scope: Scope.Public,
        statements: ["return this.data?.title;"],
        docs: [
          { description: "Typed accessor for the entity's display title." },
        ],
      });

      cls.addConstructor({
        scope: Scope.Public,
        docs: [
          {
            description:
              "@deprecated Use factory methods (e.g. stitch.project(id), project.screen(id)), which return identity-mapped instances.",
          },
        ],
        parameters: [
          { name: "client", type: "StitchToolClientSpec", scope: clientScope },
          { name: "data", type: "any" },
        ],
        statements: buildConstructorBody(config),
      });

      // ID getter
      const idParam =
        config.reference?.keys && config.reference.keys.length > 0
          ? config.reference.keys[config.reference.keys.length - 1]
          : config.constructorParams[0];
      if (idParam && idParam !== "id") {
        cls.addGetAccessor({
          name: "id",
          returnType: "string",
          statements: [`return this.${idParam};`],
          docs: [{ description: `Convenience alias for ${idParam}` }],
        });
      }
    }

    // Methods from bindings
    for (const binding of classBindings) {
      const tool = manifest.find((t) => t.name === binding.tool);
      if (!tool) {
        console.warn(
          `  ⚠️  Tool "${binding.tool}" not found in manifest, skipping.`,
        );
        continue;
      }

      const methodParams = generateMethodParams(
        tool,
        binding.args,
        namedTypes,
        `${binding.class}.${binding.method}`,
      );
      const returnTypeStr =
        binding.returns.kind === "generation"
          ? `Generation<${binding.returns.class}, ${toResponseName(binding.tool)}>`
          : binding.returns.class
            ? binding.returns.array
              ? `${binding.returns.class}[]`
              : binding.returns.class
            : binding.returns.type || "any";

      cls.addMethod({
        name: binding.method,
        isAsync: true,
        returnType: `Promise<${returnTypeStr}>`,
        parameters: methodParams,
        docs: [
          {
            description: `${binding.description ?? (tool.description?.split("\n")[0].trim() || binding.method)}\nTool: ${binding.tool}`,
          },
        ],
        statements: buildMethodBody(binding, className, domainMap),
      });
    }

    // Factory methods
    if (config.factories) {
      for (const factory of config.factories) {
        const factoryClass = domainMap.classes[factory.returns];
        if (!factoryClass) {
          console.warn(
            `  ⚠️  Factory returns "${factory.returns}" but class not found, skipping.`,
          );
          continue;
        }

        const parentField = factoryClass.parentField;
        let idKey =
          factoryClass.reference?.keys && factoryClass.reference.keys.length > 0
            ? factoryClass.reference.keys[
                factoryClass.reference.keys.length - 1
              ]
            : "id";

        const factoryDataExpr = parentField
          ? `{ ${idKey}: id, ${parentField}: this.${parentField} }`
          : "id";
        cls.addMethod({
          name: factory.method,
          returnType: factory.returns,
          parameters: [{ name: "id", type: "string" }],
          docs: [
            {
              description:
                factory.description ||
                `Create a ${factory.returns} from an ID.`,
            },
          ],
          statements: [
            `return this.client.entities.resolve(${factory.returns}, ${JSON.stringify(factoryClass.reference?.keys || [])}, ${factoryDataExpr});`,
          ],
        });
      }
    }

    // Write file
    const output = sourceFile.getFullText();
    await Bun.write(resolve(GENERATED_DIR, `${classFileName}.ts`), output);
    fileCount++;
  }

  // Generate tool definitions (for stitchTools() adapter)
  console.log(`  📄 tool-definitions.ts (${manifest.length} tools)`);
  const toolDefsFile = tsProject.createSourceFile("tool-definitions.ts");
  toolDefsFile.addStatements(`/**\n * ${headerComment}\n */\n`);
  toolDefsFile.addInterface({
    name: "ToolPropertySchema",
    isExported: true,
    docs: ["JSON Schema property descriptor for a tool parameter."],
    properties: [
      {
        name: "type",
        type: "string",
        hasQuestionToken: true,
        docs: ["JSON Schema type (string, integer, array, etc.)"],
      },
      {
        name: "description",
        type: "string",
        hasQuestionToken: true,
        docs: ["Human-readable parameter description"],
      },
      {
        name: "enum",
        type: "string[]",
        hasQuestionToken: true,
        docs: ["Allowed values for constrained parameters"],
      },
      {
        name: "items",
        type: "ToolPropertySchema",
        hasQuestionToken: true,
        docs: ["Schema for array items"],
      },
      {
        name: "deprecated",
        type: "boolean",
        hasQuestionToken: true,
        docs: ["Whether the parameter is deprecated"],
      },
    ],
    indexSignatures: [
      {
        keyName: "key",
        keyType: "string",
        returnType: "unknown",
        docs: ["Additional JSON Schema properties"],
      },
    ],
  });
  toolDefsFile.addInterface({
    name: "ToolInputSchema",
    isExported: true,
    docs: ["Typed JSON Schema for a tool's input parameters."],
    properties: [
      {
        name: "type",
        type: '"object"',
        docs: ["Always 'object' for tool inputs"],
      },
      {
        name: "description",
        type: "string",
        hasQuestionToken: true,
        docs: ["Schema-level description"],
      },
      {
        name: "properties",
        type: "Record<string, ToolPropertySchema>",
        docs: ["Map of parameter names to their schemas"],
      },
      {
        name: "required",
        type: "string[]",
        hasQuestionToken: true,
        docs: ["Names of required parameters"],
      },
    ],
    indexSignatures: [
      {
        keyName: "key",
        keyType: "string",
        returnType: "unknown",
        docs: ["Additional JSON Schema properties"],
      },
    ],
  });
  toolDefsFile.addInterface({
    name: "ToolDefinition",
    isExported: true,
    docs: ["Static tool definition from the Stitch MCP server manifest."],
    properties: [
      {
        name: "name",
        type: "string",
        docs: ['MCP tool name, e.g. "create_project"'],
      },
      {
        name: "description",
        type: "string",
        docs: ["Human-readable description of what the tool does"],
      },
      {
        name: "inputSchema",
        type: "ToolInputSchema",
        docs: ["Typed JSON Schema for the tool's input parameters"],
      },
    ],
  });
  // Use ts-morph for the declaration, but inject the JSON data directly.
  // (addStatements chokes on very large JSON literals, so we build the output string.)
  const toolDefsJson = JSON.stringify(
    manifest.map((t) => ({
      name: t.name,
      description: t.description || "",
      inputSchema: t.inputSchema || {},
    })),
    null,
    2,
  );
  const toolDefsOutput =
    toolDefsFile.getFullText() +
    `\n/** All tools available on the Stitch MCP server, generated from tools-manifest.json. */\n` +
    `export const toolDefinitions: ToolDefinition[] = ${toolDefsJson};\n`;
  await Bun.write(
    resolve(GENERATED_DIR, "tool-definitions.ts"),
    toolDefsOutput,
  );
  fileCount++;

  // Generate barrel export
  const indexFile = tsProject.createSourceFile("index.ts");
  indexFile.addStatements(`/**\n * ${headerComment}\n */\n`);
  for (const className of Object.keys(domainMap.classes)) {
    indexFile.addExportDeclaration({
      moduleSpecifier: `./${className.toLowerCase()}.js`,
      namedExports: [className],
    });
  }
  indexFile.addExportDeclaration({
    moduleSpecifier: "./tool-definitions.js",
    namedExports: [
      "toolDefinitions",
      { name: "ToolDefinition", isTypeOnly: true },
      { name: "ToolInputSchema", isTypeOnly: true },
      { name: "ToolPropertySchema", isTypeOnly: true },
    ],
  });
  if (namedTypes.size > 0) {
    indexFile.addExportDeclaration({
      moduleSpecifier: "./types.generated.js",
      isTypeOnly: true,
    });
  }
  indexFile.addExportDeclaration({
    moduleSpecifier: "./responses.generated.js",
    isTypeOnly: true,
  });
  await Bun.write(resolve(GENERATED_DIR, "index.ts"), indexFile.getFullText());
  fileCount++;

  console.log(
    `\n📦 Generated ${fileCount} files in packages/sdk/generated/src/`,
  );

  // Format generated files before hashing so `npm run format:check` and
  // lockfile validation remain in lockstep.
  console.log("🎨 Formatting generated files...");
  Bun.spawnSync(["npx", "prettier", "--write", GENERATED_DIR]);

  // Update stitch-sdk.lock
  const generatedHash = hashDirectory(GENERATED_DIR);
  let lock: any = {};
  if (existsSync(LOCK_PATH)) {
    try {
      lock = JSON.parse(await Bun.file(LOCK_PATH).text());
    } catch (err) {
      // A corrupt lock is a pipeline integrity failure — never silently
      // reset it (that would discard the manifest section without warning).
      throw new Error(
        `stitch-sdk.lock exists but is not valid JSON: ${err}. ` +
          `Inspect or delete ${LOCK_PATH} manually, then re-run.`,
      );
    }
  } else {
    lock = { schemaVersion: 1 };
  }

  // Idempotent lock: only bump generatedAt when content actually changed,
  // so back-to-back generation runs produce zero diff.
  const newGenerated = {
    sourceHash: `sha256:${generatedHash}`,
    manifestHash: `sha256:${manifestHash}`,
    domainMapHash: `sha256:${domainMapHash}`,
    fileCount,
    // Tools whose schemas needed load-time repair — a server-side schema
    // fix should make entries disappear from this list (visible as a diff).
    repairedTools,
  };
  const generatedUnchanged =
    lock.generated &&
    lock.generated.sourceHash === newGenerated.sourceHash &&
    lock.generated.manifestHash === newGenerated.manifestHash &&
    lock.generated.domainMapHash === newGenerated.domainMapHash &&
    lock.generated.fileCount === newGenerated.fileCount &&
    // Include repairedTools so a change in repair behavior (with unchanged
    // raw inputs) bumps generatedAt and shows as a diff — the lock's stated
    // drift-signal can't silently no-op.
    JSON.stringify(lock.generated.repairedTools ?? []) ===
      JSON.stringify(newGenerated.repairedTools ?? []);
  lock.generated = {
    generatedAt: generatedUnchanged
      ? lock.generated.generatedAt
      : new Date().toISOString(),
    ...newGenerated,
  };

  const newDomainMap = {
    sourceHash: `sha256:${domainMapHash}`,
    manifestHash: lock.manifest?.sourceHash || "unknown",
    classCount: Object.keys(domainMap.classes).length,
    bindingCount: domainMap.bindings.length,
  };
  const domainMapUnchanged =
    lock.domainMap &&
    lock.domainMap.sourceHash === newDomainMap.sourceHash &&
    lock.domainMap.manifestHash === newDomainMap.manifestHash &&
    lock.domainMap.classCount === newDomainMap.classCount &&
    lock.domainMap.bindingCount === newDomainMap.bindingCount;
  lock.domainMap = {
    generatedAt: domainMapUnchanged
      ? lock.domainMap.generatedAt
      : new Date().toISOString(),
    ...newDomainMap,
  };

  await Bun.write(LOCK_PATH, JSON.stringify(lock, null, 2) + "\n");
  console.log(`🔒 Updated ${LOCK_PATH} (generated section)`);
  console.log(`\n✅ Stage 3 complete.`);
}

// Only run the pipeline when executed as a script — NOT when imported.
// Importing this module (e.g. from scripts/test) must not rm -rf and
// regenerate the committed SDK as a side effect [V1_REVIEW_FIXES M6].
if (import.meta.main) {
  main().catch((err) => {
    console.error("❌ Generation failed:", err);
    process.exit(1);
  });
}
