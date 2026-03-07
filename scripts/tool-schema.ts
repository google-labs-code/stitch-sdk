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
 * Tool Schema Types
 *
 * Minimal, purpose-built JSON Schema interface covering only the features
 * we encounter in Stitch MCP tool schemas. Replaces `any` in the Tool interface.
 *
 * This is NOT a full JSON Schema implementation — it covers:
 * properties, items, $ref, $defs, enum, type, required
 */

export interface ToolSchema {
  type?: string;
  properties?: Record<string, ToolSchema>;
  items?: ToolSchema;
  $ref?: string;
  $defs?: Record<string, ToolSchema>;
  enum?: string[];
  description?: string;
  required?: string[];
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema?: ToolSchema;
  outputSchema?: ToolSchema;
}
