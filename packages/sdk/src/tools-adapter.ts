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

// `ai` is an OPTIONAL peer dependency, imported through the SDK's own
// public API (dynamicTool/jsonSchema) — never by forging internal
// symbols, which broke whenever the package's internals moved
// [V1_PLAN §3.6, D7].
let dynamicTool: typeof import("ai").dynamicTool;
let jsonSchema: typeof import("ai").jsonSchema;
try {
  ({ dynamicTool, jsonSchema } = await import("ai"));
} catch {
  throw new Error(
    `"@google/stitch-sdk/ai" requires the optional peer dependency "ai" ` +
      `(Vercel AI SDK v6+), which is not installed. Install it with:\n\n  npm install ai\n`,
  );
}

/**
 * Validate include filters LOUDLY: a misspelled tool name silently
 * vanishing from an agent's toolbox is undebuggable.
 */
export function validateIncludeFilter(include: string[] | undefined): void {
  if (!include) return;
  const known = new Set(toolDefinitions.map((t) => t.name));
  const unknown = include.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown Stitch tool name(s) in include filter: ${unknown.join(", ")}.\n` +
        `Available tools: ${[...known].join(", ")}`,
    );
  }
}

/**
 * Returns Stitch tools in Vercel AI SDK format.
 *
 * Each tool is pre-wired with `execute` → `callTool` against the Stitch MCP server.
 * Drop directly into `generateText({ tools: stitchTools(), ... })`.
 *
 * @example
 * import { generateText } from "ai";
 * import { stitchTools } from "@google/stitch-sdk/ai";
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
 * @param options.include - Only include specific tool names (unknown names THROW)
 */
export function stitchTools(options?: {
  apiKey?: string;
  include?: string[];
}): Record<string, Tool> {
  validateIncludeFilter(options?.include);
  const client = getOrCreateClient(options);

  const filtered = options?.include
    ? toolDefinitions.filter((t) => options.include!.includes(t.name))
    : toolDefinitions;

  return Object.fromEntries(
    filtered.map((t) => [
      t.name,
      dynamicTool({
        description: t.description,
        inputSchema: jsonSchema(t.inputSchema as Record<string, unknown>),
        execute: async (args: unknown) =>
          client.callTool(t.name, args as Record<string, any>),
      }) as Tool,
    ]),
  );
}
