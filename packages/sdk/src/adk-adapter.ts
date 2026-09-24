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

import type { FunctionTool as FunctionToolType } from "@google/adk";
import type { Schema } from "@google/genai";
import { toolDefinitions } from "../generated/src/tool-definitions.js";
import { getOrCreateClient } from "./singleton.js";

// @google/adk is an OPTIONAL peer dependency: it must not be required to
// install or import the core SDK. Guarded dynamic import gives consumers an
// actionable error instead of a bare ERR_MODULE_NOT_FOUND.
let FunctionTool: typeof FunctionToolType;
try {
  ({ FunctionTool } = await import("@google/adk"));
} catch {
  throw new Error(
    `"@google/stitch-sdk/adk" requires the optional peer dependency "@google/adk", ` +
      `which is not installed. Install it with:\n\n  npm install @google/adk\n`,
  );
}

/**
 * Recursively cleans and flattens a JSON Schema to make it compatible with the Google ADK/Gemini API.
 * It resolves internal `#/$defs/` references directly into the object, and removes
 * keys that the Gemini API validator rejects, such as `$defs`, `$ref`, `deprecated`,
 * and custom `x-google-` extensions.
 *
 * @param schema - The JSON Schema object to clean.
 * @returns The cleaned, flattened JSON schema object.
 */
function cleanSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return schema;
  const defs = schema.$defs || {};
  // Defs currently being resolved. A self-recursive $def cannot be
  // expressed in the Gemini schema dialect — break the cycle with {}
  // instead of embedding an in-progress object by reference (which
  // produced circular output that exploded on JSON serialization).
  const inProgress = new Set<string>();

  function stripAndResolve(node: any, seen = new Map()): any {
    if (!node || typeof node !== "object") return node;
    if (seen.has(node)) return seen.get(node);

    if (Array.isArray(node)) {
      const arr: any[] = [];
      seen.set(node, arr);
      for (const val of node) {
        arr.push(stripAndResolve(val, seen));
      }
      return arr;
    }

    if (
      node.$ref &&
      typeof node.$ref === "string" &&
      node.$ref.startsWith("#/$defs/")
    ) {
      const defName = node.$ref.replace("#/$defs/", "");
      if (defs[defName]) {
        if (inProgress.has(defName)) {
          return {}; // recursive $def — cycle broken
        }
        inProgress.add(defName);
        const target = stripAndResolve(defs[defName], seen);
        inProgress.delete(defName);
        const resolved = { ...target };
        for (const [k, v] of Object.entries(node)) {
          if (
            k !== "$ref" &&
            k !== "x-google-identifier" &&
            k !== "deprecated" &&
            !k.startsWith("x-google-")
          ) {
            resolved[k] = stripAndResolve(v, seen);
          }
        }
        return resolved;
      }
    }

    const result: any = {};
    seen.set(node, result);

    for (const [key, value] of Object.entries(node)) {
      if (
        key === "$defs" ||
        key === "$ref" ||
        key === "deprecated" ||
        key.startsWith("x-google-")
      ) {
        continue;
      }
      result[key] = stripAndResolve(value, seen);
    }
    return result;
  }

  return stripAndResolve(schema);
}

/**
 * Returns Stitch tools in Google ADK format.
 *
 * Each tool is pre-wired with `execute` → `callTool` against the Stitch MCP server.
 * Drop directly into an ADK Agent configuration.
 *
 * @example
 * import { stitchAdkTools } from "@google/stitch-sdk/adk";
 *
 * const agent = new LLMAgent({
 *   name: "Stitch Agent",
 *   instruction: "Create a login page",
 *   tools: stitchAdkTools(),
 * });
 *
 * @param options - Optional config
 * @param options.apiKey - Override STITCH_API_KEY env var
 * @param options.include - Only include specific tool names
 */
export function stitchAdkTools(options?: {
  apiKey?: string;
  include?: string[];
}): FunctionToolType<Schema>[] {
  // A misspelled tool name silently vanishing from an agent's toolbox
  // is undebuggable — validate loudly [V1_PLAN §3.6].
  if (options?.include) {
    const known = new Set(toolDefinitions.map((t) => t.name));
    const unknown = options.include.filter((name) => !known.has(name));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown Stitch tool name(s) in include filter: ${unknown.join(", ")}.\n` +
          `Available tools: ${[...known].join(", ")}`,
      );
    }
  }

  const client = getOrCreateClient(options);

  const filtered = options?.include
    ? toolDefinitions.filter((t) => options.include!.includes(t.name))
    : toolDefinitions;

  return filtered.map(
    (t) =>
      new FunctionTool({
        name: t.name,
        description: t.description,
        parameters: cleanSchema(t.inputSchema) as Schema,
        execute: async (args: unknown) =>
          client.callTool(t.name, args as Record<string, any>),
      }),
  );
}
