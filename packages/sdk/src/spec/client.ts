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

import { z } from 'zod';
import { DEFAULT_STITCH_API_URL } from '../constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. INPUT SCHEMA - What the client receives for configuration
// ─────────────────────────────────────────────────────────────────────────────
export const StitchConfigSchema = z.object({
  /** API key for simple API access. Falls back to STITCH_API_KEY. */
  apiKey: z.string().optional(),

  /** OAuth access token for user-authenticated requests. Falls back to STITCH_ACCESS_TOKEN. */
  accessToken: z.string().optional(),

  /** Google Cloud project ID. Required for OAuth, optional for API Key. Falls back to GOOGLE_CLOUD_PROJECT. */
  projectId: z.string().optional(),

  /** Base URL for the Stitch MCP server. */
  baseUrl: z.string().default(DEFAULT_STITCH_API_URL),

  /** Request timeout in milliseconds. Default: 300000 (5 min). */
  timeout: z.number().default(300_000),
}).refine(data => {
  const hasApiKey = !!data.apiKey;
  const hasOAuth = !!data.accessToken && !!data.projectId;
  return hasApiKey || hasOAuth;
}, {
  message: "Authentication failed. Provide either 'apiKey' OR ('accessToken' + 'projectId')."
});

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
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    inputSchema: z.unknown().optional(),
  })),
});
export type Tools = z.infer<typeof ToolsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 3. BEHAVIOR INTERFACE - The contract
// ─────────────────────────────────────────────────────────────────────────────
export interface StitchToolClientSpec {
  name: 'stitch-tool-client';
  description: 'Authenticated tool pipe for Stitch MCP Server';

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
   * Close the connection.
   */
  close: () => Promise<void>;
}
