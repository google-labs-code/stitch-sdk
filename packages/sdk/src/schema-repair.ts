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

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Well-known $defs definitions that the Stitch backend may reference via
 * $ref but omit from a schema's $defs block. When the MCP SDK's AJV
 * validator tries to compile these schemas, the missing references cause a
 * hard crash (`MissingRefError`).
 *
 * These are FALLBACK stubs, used only when a referenced definition cannot
 * be harvested from another schema in the same tools/list response (see
 * collectDefPool). They were captured from the live Stitch tools/list on
 * 2026-08-21 so the fallback shape stays faithful to the backend.
 */
const WELL_KNOWN_DEFS: Record<string, object> = {
  ScreenInstance: {
    type: "object",
    description: "An instance of a screen on the project. Next ID: 18",
    properties: {
      groupId: { type: "string" },
      groupName: { type: "string" },
      height: { type: "integer", format: "int32" },
      hidden: { type: "boolean" },
      id: { type: "string" },
      isFavourite: { type: "boolean" },
      isResized: { type: "boolean" },
      label: { type: "string" },
      needsLayout: { type: "boolean" },
      sourceAsset: { type: "string" },
      sourceScreen: { type: "string" },
      textContent: { type: "string" },
      type: {
        type: "string",
        enum: [
          "SCREEN_INSTANCE_TYPE_UNSPECIFIED",
          "SCREEN_INSTANCE",
          "DESIGN_SYSTEM_INSTANCE",
          "GROUP_INSTANCE",
          "TEXT_INSTANCE",
        ],
      },
      variantScreenInstance: {
        $ref: "#/$defs/ScreenInstance",
        description: "Optional. The variant Screen Instance.",
      },
      width: { type: "integer", format: "int32" },
      x: { type: "integer", format: "int32" },
      y: { type: "integer", format: "int32" },
    },
  },

  SelectedScreenInstance: {
    type: "object",
    description:
      "A screen instance to be edited by the agent, selected by the user.",
    properties: {
      id: { type: "string" },
      sourceScreen: { type: "string" },
    },
    required: ["id", "sourceScreen"],
  },

  File: {
    type: "object",
    description: "A File resource.",
    properties: {
      downloadUrl: { type: "string" },
      fileContentBase64: { type: "string", writeOnly: true },
      mimeType: { type: "string" },
      name: { type: "string" },
      uploadBlobId: { type: "string" },
      userFeedback: {
        $ref: "#/$defs/UserFeedback",
        description: "Output only. The latest feedback submitted for the file.",
        readOnly: true,
      },
    },
  },

  UserFeedback: {
    type: "object",
    description: "User feedback for a given interaction.",
    properties: {
      comment: { type: "string" },
      designFeedbackReason: {
        type: "string",
        enum: [
          "DESIGN_FEEDBACK_REASON_UNSPECIFIED",
          "DESIGN_DOESNT_MATCH_PROMPT",
          "EDIT_DOESNT_MATCH_PROMPT",
          "DESCRIPTION_DOESNT_MATCH",
          "COMPONENT_ISSUE",
          "INCORRECT_THEME",
          "FIGMA_EXPORT_FAILED",
          "OTHER",
        ],
      },
      rating: {
        type: "string",
        enum: ["RATING_UNSPECIFIED", "POSITIVE", "NEGATIVE"],
      },
    },
  },
};

/**
 * Collect every `$ref` target of the form `#/$defs/<Name>` from a schema
 * object (recursively). Returns the set of referenced definition names.
 */
function collectRefTargets(
  obj: unknown,
  refs: Set<string> = new Set(),
): Set<string> {
  if (obj === null || typeof obj !== "object") return refs;

  if (Array.isArray(obj)) {
    for (const item of obj) collectRefTargets(item, refs);
    return refs;
  }

  const record = obj as Record<string, unknown>;
  if (typeof record.$ref === "string") {
    const match = record.$ref.match(/^#\/\$defs\/(.+)$/);
    if (match) refs.add(match[1]);
  }

  for (const value of Object.values(record)) {
    collectRefTargets(value, refs);
  }

  return refs;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Harvest every `$defs` entry found across the tools/list response into a
 * name → definition pool.
 *
 * The Stitch backend usually defines each entity (ScreenInstance, File, …)
 * under `$defs` in at least one tool's schema, even when it omits them from
 * other schemas that reference them. Pooling those real definitions lets
 * repairSchema inject the backend's actual shapes instead of the fallback
 * stubs in WELL_KNOWN_DEFS.
 */
export function collectDefPool(tools: Tool[]): Record<string, object> {
  const pool: Record<string, object> = {};

  const harvest = (schema: unknown) => {
    if (!isPlainObject(schema)) return;
    const defs = schema.$defs;
    if (!isPlainObject(defs)) return;
    for (const [name, def] of Object.entries(defs)) {
      if (!(name in pool) && isPlainObject(def)) {
        pool[name] = def;
      }
    }
  };

  for (const tool of tools) {
    harvest(tool.inputSchema);
    harvest((tool as any).outputSchema);
  }

  return pool;
}

/**
 * Bound on repair passes. Injected definitions can introduce new $refs
 * (e.g. the backend's File def references UserFeedback), so repair iterates
 * to a fixpoint; real def chains are 1–2 deep, so 8 passes is generous.
 */
const MAX_REPAIR_PASSES = 8;

/**
 * Repair a single JSON Schema by injecting any missing $defs that are
 * referenced via $ref but not present.
 *
 * Definitions are resolved from `defPool` first (the backend's real shapes,
 * harvested from sibling tool schemas), falling back to WELL_KNOWN_DEFS
 * stubs. Injected definitions are deep-cloned so schemas never share
 * mutable state, and injection iterates until every transitive reference
 * resolves.
 *
 * Mutates the schema in place and returns it for convenience.
 */
export function repairSchema(
  schema: Record<string, any>,
  defPool: Record<string, object> = {},
): Record<string, any> {
  if (!schema || typeof schema !== "object") return schema;

  const unresolved = new Set<string>();

  for (let pass = 0; pass < MAX_REPAIR_PASSES; pass++) {
    const referencedDefs = collectRefTargets(schema);
    if (referencedDefs.size === 0) return schema;

    // Ensure $defs block exists
    schema.$defs = schema.$defs || {};

    let injected = false;
    for (const defName of referencedDefs) {
      // Only inject if the def is missing and has not proven unresolvable
      if (schema.$defs[defName] || unresolved.has(defName)) continue;

      const source = defPool[defName] ?? WELL_KNOWN_DEFS[defName];
      if (!source) {
        unresolved.add(defName);
        continue;
      }

      schema.$defs[defName] = JSON.parse(JSON.stringify(source));
      injected = true;
    }

    if (!injected) return schema;
  }

  return schema;
}

/**
 * Apply schema repair to every tool's inputSchema and outputSchema.
 *
 * This MUST run before the MCP SDK's AJV validator sees the schemas.
 * Mutates tools in place.
 */
export function repairToolSchemas(tools: Tool[]): void {
  const defPool = collectDefPool(tools);

  for (const tool of tools) {
    if (tool.inputSchema && typeof tool.inputSchema === "object") {
      repairSchema(tool.inputSchema as Record<string, any>, defPool);
    }
    // outputSchema was added in MCP SDK ≥1.27 and is the primary crash vector:
    // Client.cacheToolMetadata() eagerly compiles outputSchema with AJV.
    const anyTool = tool as any;
    if (anyTool.outputSchema && typeof anyTool.outputSchema === "object") {
      repairSchema(anyTool.outputSchema, defPool);
    }
  }
}
