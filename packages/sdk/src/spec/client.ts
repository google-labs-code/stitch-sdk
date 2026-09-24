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

import { z } from "zod";
import { DEFAULT_STITCH_API_URL } from "../constants.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. INPUT SCHEMA - What the client receives for configuration
// ─────────────────────────────────────────────────────────────────────────────
export const StitchConfigSchema = z
  .object({
    /** API key for simple API access. Falls back to STITCH_API_KEY. */
    apiKey: z.string().optional(),

    /** OAuth access token for user-authenticated requests. Falls back to STITCH_ACCESS_TOKEN. */
    accessToken: z.string().optional(),

    /** Google Cloud project ID. Required for OAuth, optional for API Key. Falls back to STITCH_PROJECT_ID, then GOOGLE_CLOUD_PROJECT (both first-class). */
    projectId: z.string().optional(),

    /** Base URL for the Stitch MCP server. Falls back to STITCH_BASE_URL (legacy alias STITCH_HOST, deprecated — removed in 2.0). */
    baseUrl: z.string().default(DEFAULT_STITCH_API_URL),

    /** Request timeout in milliseconds. Default: 300000 (5 min). */
    timeout: z.number().default(300_000),

    /**
     * Identity-map toggle. Default true: resolving the same entity
     * yields the same instance (with data merged on refresh). Set false
     * for value-object behavior — every resolve returns a fresh,
     * never-cached instance.
     */
    entityCache: z.boolean().default(true),

    /**
     * Retry policy for RATE_LIMITED failures on idempotent reads
     * (`get_*` / `list_*` tools only — generative/mutating tools are
     * never auto-retried). Set to `false` to disable retries entirely.
     */
    retry: z
      .union([
        z.literal(false),
        z
          .object({
            /** Total attempts including the first call. */
            attempts: z.number().int().min(1).max(10).default(3),
            /** Base delay in ms for exponential backoff. */
            baseMs: z.number().default(250),
            /** Upper bound on a single backoff delay in ms. */
            maxMs: z.number().default(4000),
          })
          .strict(),
      ])
      .default({ attempts: 3, baseMs: 250, maxMs: 4000 }),
  })
  .refine(
    (data) => {
      const hasApiKey = !!data.apiKey;
      const hasOAuth = !!data.accessToken && !!data.projectId;
      return hasApiKey || hasOAuth;
    },
    {
      message:
        "Invalid configuration: provide either 'apiKey' OR ('accessToken' + 'projectId').",
    },
  );

export type StitchConfig = z.infer<typeof StitchConfigSchema>;
/** Input type for StitchConfig - fields with defaults are optional */
export type StitchConfigInput = z.input<typeof StitchConfigSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 2. OUTPUT SCHEMAS - What the client produces
// ─────────────────────────────────────────────────────────────────────────────
export const ToolResultSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

export const ToolsSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      inputSchema: z.unknown().optional(),
    }),
  ),
});
export type Tools = z.infer<typeof ToolsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 3. BEHAVIOR INTERFACE - The contract
// ─────────────────────────────────────────────────────────────────────────────
export interface StitchToolClientSpec {
  name: "stitch-tool-client";
  description: "Authenticated tool pipe for Stitch MCP Server";

  /**
   * Identity-map manager. ALL entity instances (Project, Screen, ...)
   * must be obtained through entities.resolve — never constructed
   * directly — so reference keys are hydrated and instances deduplicated.
   */
  entities: import("../entity-manager.js").EntityManager;

  /**
   * Validate configuration and establish connection.
   * MUST handle auth header injection based on config.
   * - API Key: Inject `X-Goog-Api-Key` header.
   * - OAuth: Inject `Authorization: Bearer` and `X-Goog-User-Project` headers.
   */
  connect: () => Promise<void>;

  /**
   * Call a tool on the MCP server.
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Parsed tool result
   */
  callTool: <T>(name: string, args: Record<string, unknown>) => Promise<T>;

  /**
   * Get available tools from the server.
   */
  listTools: () => Promise<Tools>;

  /**
   * Make a direct REST POST to the Stitch API.
   * Used for endpoints not available as MCP tools (e.g. BatchCreateScreens).
   * Throws StitchError on HTTP error responses.
   */
  httpPost: <T>(path: string, body: unknown) => Promise<T>;

  /**
   * Close the connection.
   */
  close: () => Promise<void>;
}

export interface VirtualToolDefinition {
  name: string;
  description: string;
  source?: string;
  inputSchema: any;
  execute: (client: StitchToolClientSpec, args: any) => Promise<any>;
}
