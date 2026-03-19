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

import { toolDefinitions, type ToolDefinition, type ToolInputSchema } from "../generated/src/tool-definitions.js";

/** A single tool parameter, pre-parsed from JSON Schema. */
export interface ToolParam {
  /** Parameter name, e.g. "projectId" */
  name: string;
  /** JSON Schema type, e.g. "string", "array". Undefined for $ref properties. */
  type?: string;
  /** Human-readable description */
  description?: string;
  /** Whether this parameter is required */
  required: boolean;
  /** Allowed values for constrained parameters (e.g. deviceType) */
  enum?: string[];
}

/** A tool definition enriched with pre-parsed params for easy introspection. */
export interface ToolInfo extends ToolDefinition {
  /** Flat array of parameters, pre-parsed from inputSchema. */
  params: ToolParam[];
}

/** Parse inputSchema into a flat ToolParam array. */
function parseParams(schema: ToolInputSchema): ToolParam[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    type: prop.type,
    description: prop.description,
    required: required.has(name),
    ...(prop.enum ? { enum: prop.enum } : {}),
  }));
}

/** Read-only map of tool names to enriched definitions for O(1) lookup. */
export const toolMap: ReadonlyMap<string, ToolInfo> = new Map(
  toolDefinitions.map(t => [
    t.name,
    { ...t, params: parseParams(t.inputSchema) },
  ]),
);
