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

import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { readdirSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { Project as TsProject, Scope, type SourceFile, type ClassDeclaration } from "ts-morph";
import { DomainMap, type ProjectionStep, type Binding, type ArgSpec } from "./ir-schema.js";
import type { Tool, ToolSchema } from "./tool-schema.js";

const ROOT_DIR = resolve(import.meta.dir, "..");
const MANIFEST_PATH = resolve(ROOT_DIR, "packages/sdk/generated/tools-manifest.json");
const DOMAIN_MAP_PATH = resolve(ROOT_DIR, "packages/sdk/generated/domain-map.json");
const GENERATED_DIR = resolve(ROOT_DIR, "packages/sdk/generated/src");
const LOCK_PATH = resolve(ROOT_DIR, "packages/sdk/generated/stitch-sdk.lock");

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function hashDirectory(dir: string): string {
  if (!existsSync(dir)) return sha256("");
  const hash = createHash("sha256");
  const files = getAllFiles(dir).sort();
  for (const file of files) {
    hash.update(file);
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
export function resolveRef(schema: ToolSchema, ref: string): ToolSchema | undefined {
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
 * Returns the schema node at the end of the projection, or throws
 * with a diagnostic error if a property doesn't exist.
 */
export function validateProjection(
  projection: ProjectionStep[],
  outputSchema: ToolSchema | null | undefined,
  bindingLabel: string,
): void {
  if (!outputSchema) return; // No schema to validate against

  let currentSchema: ToolSchema | undefined = outputSchema;
  const rootSchema = outputSchema;

  for (let i = 0; i < projection.length; i++) {
    const step = projection[i];

    // Resolve $ref if present
    if (currentSchema?.$ref) {
      currentSchema = resolveRef(rootSchema, currentSchema.$ref);
    }

    // If current is an array schema and we're using each/index, unwrap items
    if (currentSchema?.type === "array" && currentSchema?.items) {
      currentSchema = currentSchema.items;
      if (currentSchema?.$ref) {
        currentSchema = resolveRef(rootSchema, currentSchema.$ref);
      }
    }

    const props = currentSchema?.properties;
    if (!props) {
      // Can't validate further (schema is too loose)
      return;
    }

    if (!(step.prop in props)) {
      const available = Object.keys(props).join(", ");
      throw new Error(
        `❌ Binding "${bindingLabel}" projection step ${i + 1}: ` +
        `property "${step.prop}" not found in outputSchema.\n` +
        `   Available properties: ${available}\n` +
        `   Fix: check the projection in domain-map.json for this binding.`
      );
    }

    // Advance to the property's schema
    currentSchema = props[step.prop];

    // Resolve $ref
    if (currentSchema?.$ref) {
      currentSchema = resolveRef(rootSchema, currentSchema.$ref);
    }

    // If accessing array items (index or each), unwrap to items schema
    if ((step.index !== undefined || step.each) && currentSchema?.type === "array" && currentSchema?.items) {
      currentSchema = currentSchema.items;
      if (currentSchema?.$ref) {
        currentSchema = resolveRef(rootSchema, currentSchema.$ref);
      }
    }
  }
}

// ── Projection Code Emission ──────────────────────────────────

/**
 * Emit TypeScript code for a projection path.
 *
 * Walks the ProjectionStep[] array and emits property access,
 * [index], or .flatMap() for each step.
 */
export function emitProjection(steps: ProjectionStep[], rawVar: string = "raw"): string {
  if (steps.length === 0) return rawVar;

  // Check if any step uses 'each' (flatMap pattern)
  const hasEach = steps.some(s => s.each);

  if (hasEach) {
    return emitFlatMapProjection(steps, rawVar);
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
 * Emit flatMap chain for projections with 'each' steps.
 * e.g. [each:outputComponents, prop:design, each:screens] →
 *   (raw.outputComponents || []).flatMap((a: any) => a.design.screens || [])
 */
function emitFlatMapProjection(steps: ProjectionStep[], rawVar: string): string {
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
          innerSteps.push(`[${steps[i].index}]`);
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
      code += `[${step.index}]`;
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
 */
export function emitCacheProjection(steps: ProjectionStep[]): string {
  let code = "this.data";
  for (const step of steps) {
    code += `?.${step.prop}`;
  }
  return code;
}

// ── Param Type Generation ─────────────────────────────────────

/**
 * Convert JSON Schema type to TypeScript type.
 */
export function jsonSchemaToTs(prop: ToolSchema | null | undefined): string {
  if (!prop) return "any";
  if (prop.enum) {
    return prop.enum.map((v: string) => `"${v}"`).join(" | ");
  }
  switch (prop.type) {
    case "string": return "string";
    case "integer":
    case "number": return "number";
    case "boolean": return "boolean";
    case "array":
      if (prop.items) return `${jsonSchemaToTs(prop.items)}[]`;
      return "any[]";
    case "object": return "any";
    default: return "any";
  }
}

/**
 * Convert a tool's inputSchema properties to TypeScript param types.
 * Types are derived from the manifest inputSchema, not hardcoded in domain-map.
 */
function generateParamType(tool: Tool, args: Record<string, ArgSpec>): string {
  const params: string[] = [];
  for (const [name, spec] of Object.entries(args)) {
    if (spec.from !== "param") continue;
    const paramName = spec.rename || name;
    const toolProp = tool.inputSchema?.properties?.[name];
    const tsType = jsonSchemaToTs(toolProp);
    const optional = spec.optional ? "?" : "";
    params.push(`${paramName}${optional}: ${tsType}`);
  }
  return params.join(", ");
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
      entries.push(name === paramName ? name : `${name}: ${paramName}`);
    } else if (spec.from === "computed") {
      const templateStr = spec.template || "";
      const interpolated = templateStr.replace(
        /\{(\w+)\}/g,
        (_, key) => {
          const argSpec = args[key];
          if (argSpec?.from === "self" || argSpec?.from === "selfArray") return `\${this.${key}}`;
          return `\${${argSpec?.from === "param" && argSpec?.rename ? argSpec.rename : key}}`;
        }
      );
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

  if (binding.returns.class) {
    const childClass = domainMap.classes[binding.returns.class];
    const parentField = childClass?.parentField;

    if (binding.returns.array) {
      const itemExpr = parentField
        ? `{ ...item, ${parentField}: this.${parentField} }`
        : "item";
      // Null-safe: default to empty array if projection yields undefined
      return `(${projectionExpr} || []).map((item: any) => new ${binding.returns.class}(this.client, ${itemExpr}))`;
    }

    // Only emit guard when projection has actual steps (not just `raw`)
    if (projection.length > 0) {
      const guardVar = "_projected";
      const dataExpr = parentField
        ? `{ ...${guardVar}, ${parentField}: this.${parentField} }`
        : guardVar;
      const toolName = binding.tool;
      return `const ${guardVar} = ${projectionExpr};\n` +
        `  if (!${guardVar}) throw new StitchError({ code: "UNKNOWN_ERROR", message: "Incomplete API response from ${toolName}: expected object at projection path", recoverable: false });\n` +
        `  return new ${binding.returns.class}(this.client, ${dataExpr})`;
    }

    // Direct return — projection is empty, raw is the result itself
    const dataExpr = parentField
      ? `{ ...${projectionExpr}, ${parentField}: this.${parentField} }`
      : projectionExpr;
    return `new ${binding.returns.class}(this.client, ${dataExpr})`;
  }

  return `${projectionExpr} || ""`;
}

// ── Constructor Body Builder ──────────────────────────────────

function buildConstructorBody(
  config: ReturnType<typeof DomainMap.parse>["classes"][string],
): string[] {
  const statements: string[] = [];
  const ctorParams = config.constructorParams;

  for (const p of ctorParams) {
    const fm = config.fieldMapping?.[p];
    if (fm) {
      if (fm.stripPrefix) {
        const prefix = fm.stripPrefix;
        statements.push(`{`);
        statements.push(`  let _v = typeof data === "string" ? data : data.${fm.from};`);
        statements.push(`  if (typeof _v === "string" && _v.startsWith("${prefix}")) _v = _v.slice(${prefix.length});`);
        statements.push(`  this.${p} = _v;`);
        statements.push(`}`);
      } else {
        statements.push(`this.${p} = typeof data === "string" ? data : data.${fm.from};`);
      }
      if (fm.fallback) {
        statements.push(`if (!this.${p} && typeof data === "object" && data.${fm.fallback.field}) {`);
        statements.push(`  const parts = data.${fm.fallback.field}.split("${fm.fallback.splitOn}");`);
        statements.push(`  if (parts.length === 2) this.${p} = parts[1];`);
        statements.push(`}`);
      }
    } else if (config.identifierField && p === ctorParams[0]) {
      statements.push(`this.${p} = typeof data === "string" ? data : data.${config.identifierField};`);
    } else {
      statements.push(`this.${p} = typeof data === "string" ? data : data.${p};`);
    }
  }

  statements.push(`this.data = typeof data === "object" ? data : undefined;`);
  return statements;
}

// ── Method Body Builder ───────────────────────────────────────

function buildMethodBody(
  binding: Binding,
  className: string,
  domainMap: ReturnType<typeof DomainMap.parse>,
): string[] {
  const statements: string[] = [];

  // Cache check
  if (binding.cache) {
    const cacheExpr = emitCacheProjection(binding.cache.projection);
    statements.push(`// ${binding.cache.description}`);
    statements.push(`if (${cacheExpr}) return ${cacheExpr};`);
    statements.push(``);
  }

  statements.push(`try {`);
  statements.push(`  const raw = await this.client.callTool<any>("${binding.tool}", ${generateArgsObject(binding.args)});`);
  const retExpr = generateReturnExpression(binding, className, domainMap);
  // If retExpr contains newlines, it has guard statements — don't wrap in return
  if (retExpr.includes("\n")) {
    statements.push(`  ${retExpr}`);
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
  const domainMap = DomainMap.parse(JSON.parse(domainMapContent));

  console.log("🔍 Validating binding IR...");
  console.log("  ✓ IR schema valid");

  // Validate projections against output schemas
  console.log("🔍 Validating projections against output schemas...");
  for (const binding of domainMap.bindings) {
    const tool = manifest.find(t => t.name === binding.tool);
    if (!tool?.outputSchema) continue;

    validateProjection(
      binding.returns.projection,
      tool.outputSchema,
      `${binding.class}.${binding.method}`,
    );
  }
  console.log("  ✓ All projections valid against output schemas");

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

  const headerComment = [
    `AUTO-GENERATED by scripts/generate-sdk.ts`,
    `DO NOT EDIT — changes will be overwritten.`,
    ``,
    `Source: tools-manifest.json (sha256:${manifestHash.slice(0, 12)}...)`,
    `        domain-map.json     (sha256:${domainMapHash.slice(0, 12)}...)`,
    `Generated: ${new Date().toISOString()}`,
  ].join("\n");

  let fileCount = 0;

  // Generate a class file for each domain class
  for (const [className, config] of Object.entries(domainMap.classes)) {
    const classBindings = domainMap.bindings.filter(b => b.class === className);
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
    sourceFile.addImportDeclaration({
      moduleSpecifier: "../../src/client.js",
      namedImports: [{ name: "StitchToolClient", isTypeOnly: true }],
    });
    sourceFile.addImportDeclaration({
      moduleSpecifier: "../../src/spec/errors.js",
      namedImports: ["StitchError"],
    });
    for (const rc of returnClasses) {
      sourceFile.addImportDeclaration({
        moduleSpecifier: `./${rc.toLowerCase()}.js`,
        namedImports: [rc],
      });
    }

    // Class
    const cls = sourceFile.addClass({
      name: className,
      isExported: true,
      docs: [{ description: config.description }],
    });

    // Constructor
    if (config.isRoot) {
      cls.addConstructor({
        parameters: [{ name: "client", type: "StitchToolClient", scope: Scope.Private }],
      });
    } else {
      // Declare fields
      for (const p of config.constructorParams) {
        cls.addProperty({ name: p, type: "string", scope: Scope.Public, isReadonly: true });
      }
      cls.addProperty({ name: "data", type: "any", scope: Scope.Public });

      cls.addConstructor({
        parameters: [
          { name: "client", type: "StitchToolClient", scope: Scope.Private },
          { name: "data", type: "any" },
        ],
        statements: buildConstructorBody(config),
      });

      // ID getter
      const idParam = config.idField || config.constructorParams[0];
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
      const tool = manifest.find(t => t.name === binding.tool);
      if (!tool) {
        console.warn(`  ⚠️  Tool "${binding.tool}" not found in manifest, skipping.`);
        continue;
      }

      const paramTypes = generateParamType(tool, binding.args);
      const returnTypeStr = binding.returns.class
        ? (binding.returns.array ? `${binding.returns.class}[]` : binding.returns.class)
        : (binding.returns.type || "any");

      cls.addMethod({
        name: binding.method,
        isAsync: true,
        returnType: `Promise<${returnTypeStr}>`,
        docs: [{
          description: `${tool.description?.split("\n")[0].trim() || binding.method}\nTool: ${binding.tool}`,
        }],
        // Parameters as raw string (ts-morph doesn't easily support "prompt: string, opts?: Enum" inline)
        statements: buildMethodBody(binding, className, domainMap),
      });

      // Add parameters manually (from the paramTypes string) by editing the method
      const method = cls.getMethods().find(m => m.getName() === binding.method);
      if (method && paramTypes) {
        // Parse paramTypes string into individual params
        const paramParts = paramTypes.split(", ").filter(Boolean);
        for (const part of paramParts) {
          const match = part.match(/^(\w+)(\?)?:\s*(.+)$/);
          if (match) {
            method.addParameter({
              name: match[1],
              type: match[3],
              hasQuestionToken: !!match[2],
            });
          }
        }
      }
    }

    // Factory methods
    if (config.factories) {
      for (const factory of config.factories) {
        const factoryClass = domainMap.classes[factory.returns];
        if (!factoryClass) {
          console.warn(`  ⚠️  Factory returns "${factory.returns}" but class not found, skipping.`);
          continue;
        }

        cls.addMethod({
          name: factory.method,
          returnType: factory.returns,
          parameters: [{ name: "id", type: "string" }],
          docs: [{ description: factory.description || `Create a ${factory.returns} from an ID.` }],
          statements: [`return new ${factory.returns}(this.client, id);`],
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
      { name: "type", type: "string", hasQuestionToken: true, docs: ["JSON Schema type (string, integer, array, etc.)"] },
      { name: "description", type: "string", hasQuestionToken: true, docs: ["Human-readable parameter description"] },
      { name: "enum", type: "string[]", hasQuestionToken: true, docs: ["Allowed values for constrained parameters"] },
      { name: "items", type: "ToolPropertySchema", hasQuestionToken: true, docs: ["Schema for array items"] },
      { name: "deprecated", type: "boolean", hasQuestionToken: true, docs: ["Whether the parameter is deprecated"] },
    ],
    indexSignatures: [{ keyName: "key", keyType: "string", returnType: "unknown", docs: ["Additional JSON Schema properties"] }],
  });
  toolDefsFile.addInterface({
    name: "ToolInputSchema",
    isExported: true,
    docs: ["Typed JSON Schema for a tool's input parameters."],
    properties: [
      { name: "type", type: '"object"', docs: ["Always 'object' for tool inputs"] },
      { name: "description", type: "string", hasQuestionToken: true, docs: ["Schema-level description"] },
      { name: "properties", type: "Record<string, ToolPropertySchema>", docs: ["Map of parameter names to their schemas"] },
      { name: "required", type: "string[]", hasQuestionToken: true, docs: ["Names of required parameters"] },
    ],
    indexSignatures: [{ keyName: "key", keyType: "string", returnType: "unknown", docs: ["Additional JSON Schema properties"] }],
  });
  toolDefsFile.addInterface({
    name: "ToolDefinition",
    isExported: true,
    docs: ["Static tool definition from the Stitch MCP server manifest."],
    properties: [
      { name: "name", type: "string", docs: ['MCP tool name, e.g. "create_project"'] },
      { name: "description", type: "string", docs: ["Human-readable description of what the tool does"] },
      { name: "inputSchema", type: "ToolInputSchema", docs: ["Typed JSON Schema for the tool's input parameters"] },
    ],
  });
  // Use ts-morph for the declaration, but inject the JSON data directly.
  // (addStatements chokes on very large JSON literals, so we build the output string.)
  const toolDefsJson = JSON.stringify(
    manifest.map(t => ({
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
  await Bun.write(resolve(GENERATED_DIR, "tool-definitions.ts"), toolDefsOutput);
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
  await Bun.write(resolve(GENERATED_DIR, "index.ts"), indexFile.getFullText());
  fileCount++;

  console.log(`\n📦 Generated ${fileCount} files in packages/sdk/generated/src/`);

  // Update stitch-sdk.lock
  const generatedHash = hashDirectory(GENERATED_DIR);
  let lock: any = {};
  try {
    lock = JSON.parse(await Bun.file(LOCK_PATH).text());
  } catch {
    lock = { schemaVersion: 1 };
  }

  lock.generated = {
    generatedAt: new Date().toISOString(),
    sourceHash: `sha256:${generatedHash}`,
    manifestHash: `sha256:${manifestHash}`,
    domainMapHash: `sha256:${domainMapHash}`,
    fileCount,
  };

  lock.domainMap = {
    generatedAt: new Date().toISOString(),
    sourceHash: `sha256:${domainMapHash}`,
    manifestHash: lock.manifest?.sourceHash || "unknown",
    classCount: Object.keys(domainMap.classes).length,
    bindingCount: domainMap.bindings.length,
  };

  await Bun.write(LOCK_PATH, JSON.stringify(lock, null, 2) + "\n");
  console.log(`🔒 Updated ${LOCK_PATH} (generated section)`);
  console.log(`\n✅ Stage 3 complete.`);
}

main().catch((err) => {
  console.error("❌ Generation failed:", err);
  process.exit(1);
});
