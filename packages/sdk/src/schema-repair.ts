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

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Well-known $defs definitions that the Stitch backend may reference via
 * $ref but omit from the schema's $defs block. When the MCP SDK's
 * AJV validator tries to compile these schemas, the missing references
 * cause a hard crash (`MissingRefError`).
 *
 * This registry lets us inject stub definitions *before* AJV ever sees
 * the schema, making the repair order-independent of the MCP SDK version.
 */
const WELL_KNOWN_DEFS: Record<string, object> = {
  ScreenInstance: {
    type: 'object',
    description: 'An instance of a screen on the project.',
    properties: {
      groupId: { type: 'string' },
      groupName: { type: 'string' },
      height: { type: 'integer', format: 'int32' },
      hidden: { type: 'boolean' },
      id: { type: 'string' },
      isFavourite: { type: 'boolean' },
      label: { type: 'string' },
      sourceAsset: { type: 'string' },
      sourceScreen: { type: 'string' },
      type: {
        type: 'string',
        enum: [
          'SCREEN_INSTANCE_TYPE_UNSPECIFIED',
          'SCREEN_INSTANCE',
          'DESIGN_SYSTEM_INSTANCE',
          'GROUP_INSTANCE',
        ],
      },
      width: { type: 'integer', format: 'int32' },
      x: { type: 'integer', format: 'int32' },
      y: { type: 'integer', format: 'int32' },
    },
  },

  SelectedScreenInstance: {
    type: 'object',
    description: 'A selected screen instance reference.',
    properties: {
      screenId: { type: 'string' },
      instanceId: { type: 'string' },
    },
  },

  File: {
    type: 'object',
    description: 'A File resource.',
    properties: {
      downloadUrl: { type: 'string' },
      fileContentBase64: { type: 'string' },
      mimeType: { type: 'string' },
      name: { type: 'string' },
      uploadBlobId: { type: 'string' },
    },
  },
};

/**
 * Collect every `$ref` target of the form `#/$defs/<Name>` from a schema
 * object (recursively). Returns the set of referenced definition names.
 */
function collectRefTargets(obj: unknown, refs: Set<string> = new Set()): Set<string> {
  if (obj === null || typeof obj !== 'object') return refs;

  if (Array.isArray(obj)) {
    for (const item of obj) collectRefTargets(item, refs);
    return refs;
  }

  const record = obj as Record<string, unknown>;
  if (typeof record.$ref === 'string') {
    const match = record.$ref.match(/^#\/\$defs\/(.+)$/);
    if (match) refs.add(match[1]);
  }

  for (const value of Object.values(record)) {
    collectRefTargets(value, refs);
  }

  return refs;
}

/**
 * Repair a single JSON Schema by injecting any missing well-known $defs
 * that are referenced via $ref but not present.
 *
 * Mutates the schema in place and returns it for convenience.
 */
export function repairSchema(schema: Record<string, any>): Record<string, any> {
  if (!schema || typeof schema !== 'object') return schema;

  const referencedDefs = collectRefTargets(schema);
  if (referencedDefs.size === 0) return schema;

  // Ensure $defs block exists
  schema.$defs = schema.$defs || {};

  for (const defName of referencedDefs) {
    // Only inject if: (a) the def is missing, and (b) we have a well-known stub
    if (!schema.$defs[defName] && WELL_KNOWN_DEFS[defName]) {
      schema.$defs[defName] = { ...WELL_KNOWN_DEFS[defName] };
    }
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
  for (const tool of tools) {
    if (tool.inputSchema && typeof tool.inputSchema === 'object') {
      repairSchema(tool.inputSchema as Record<string, any>);
    }
    // outputSchema was added in MCP SDK ≥1.27 and is the primary crash vector:
    // Client.cacheToolMetadata() eagerly compiles outputSchema with AJV.
    const anyTool = tool as any;
    if (anyTool.outputSchema && typeof anyTool.outputSchema === 'object') {
      repairSchema(anyTool.outputSchema);
    }
  }
}
