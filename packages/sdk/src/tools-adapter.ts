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

import { toolDefinitions } from "../generated/src/tool-definitions.js";
import { getOrCreateClient } from "./singleton.js";

/**
 * Well-known symbol used by the Vercel AI SDK to identify schema objects.
 * Using Symbol.for() ensures we match the exact same symbol the SDK uses
 * internally, without importing it.
 */
const schemaSymbol = Symbol.for("vercel.ai.schema");

/**
 * A Stitch tool definition compatible with the Vercel AI SDK's Tool interface.
 *
 * This type is structurally equivalent to `Tool<unknown, unknown> & { type: 'dynamic' }`
 * from the `ai` package. We define it locally to avoid a hard runtime dependency.
 * Conformance is verified by tests that pass these objects into `generateText()`.
 */
export interface StitchTool {
  type: 'dynamic';
  description: string;
  inputSchema: {
    [key: symbol]: true;
    _type: unknown;
    readonly jsonSchema: unknown;
    readonly validate?: undefined;
  };
  execute: (args: unknown) => Promise<unknown>;
}

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
}): Record<string, StitchTool> {
  const client = getOrCreateClient(options);

  const filtered = options?.include
    ? toolDefinitions.filter(t => options.include!.includes(t.name))
    : toolDefinitions;

  return Object.fromEntries(
    filtered.map(t => [
      t.name,
      {
        type: 'dynamic' as const,
        description: t.description,
        inputSchema: {
          [schemaSymbol]: true as const,
          _type: undefined as unknown,
          validate: undefined,
          get jsonSchema() { return t.inputSchema; },
        },
        execute: async (args: unknown) =>
          client.callTool(t.name, args as Record<string, any>),
      } satisfies StitchTool,
    ])
  );
}
