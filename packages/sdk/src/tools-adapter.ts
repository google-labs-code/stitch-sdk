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

import type { Tool } from "ai";
import { toolDefinitions } from "../generated/src/tool-definitions.js";
import { getOrCreateClient } from "./singleton.js";

/**
 * Well-known symbol used by the Vercel AI SDK to identify schema objects.
 * Using Symbol.for() ensures we match the exact same symbol the SDK uses
 * internally, without importing any runtime code from `ai`.
 */
const schemaSymbol = Symbol.for("vercel.ai.schema");

/**
 * Returns Stitch tools in Vercel AI SDK format.
 *
 * Each tool is pre-wired with `execute` → `callTool` against the Stitch MCP server.
 * Drop directly into `generateText({ tools: stitchTools(), ... })`.
 *
 * @example
 * import { generateText } from "ai";
 * import { stitchTools } from "@google/stitch-sdk";
 *
 * const { text } = await generateText({
 *   model: "google/gemini-2.5-pro",
 *   tools: stitchTools(),
 *   prompt: "Create a login page",
 *   maxSteps: 5,
 * });
 *
 * @param options - Optional config
 * @param options.apiKey - Override STITCH_API_KEY env var
 * @param options.include - Only include specific tool names
 */
export function stitchTools(options?: {
  apiKey?: string;
  include?: string[];
}): Record<string, Tool> {
  const client = getOrCreateClient(options);

  const filtered = options?.include
    ? toolDefinitions.filter(t => options.include!.includes(t.name))
    : toolDefinitions;

  return Object.fromEntries(
    filtered.map(t => [
      t.name,
      // Construct a plain object that is runtime-identical to what
      // dynamicTool() + jsonSchema() would produce. The `ai` package
      // is NOT imported at runtime — only the type is used above.
      {
        type: 'dynamic' as const,
        description: t.description,
        inputSchema: {
          [schemaSymbol]: true,
          _type: undefined as unknown,
          validate: undefined,
          get jsonSchema() { return t.inputSchema; },
        },
        execute: async (args: unknown) =>
          client.callTool(t.name, args as Record<string, any>),
      } as unknown as Tool,
    ])
  );
}

