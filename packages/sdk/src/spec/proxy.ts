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
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { DEFAULT_STITCH_API_URL } from '../constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. INPUT SCHEMA
// ─────────────────────────────────────────────────────────────────────────────
export const StitchProxyConfigSchema = z.object({
  /** API key for Stitch authentication. Falls back to STITCH_API_KEY. */
  apiKey: z.string().optional(),

  /** Target Stitch MCP URL. Default: https://stitch.googleapis.com/mcp */
  url: z.string().default(DEFAULT_STITCH_API_URL),

  /** Name of the local proxy server. Default: stitch-proxy */
  name: z.string().default('stitch-proxy'),

  /** Version of the local proxy server. Default: 1.0.0 */
  version: z.string().default('1.0.0'),

  /** Protocol version to use for Stitch JSON-RPC connection. Default: '2024-11-05' */
  protocolVersion: z.string().default('2024-11-05'),
});

export type StitchProxyConfig = z.infer<typeof StitchProxyConfigSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 3. BEHAVIOR INTERFACE
// ─────────────────────────────────────────────────────────────────────────────
export interface StitchProxySpec {
  /**
   * Connect to Stitch and start the proxy server on the given transport.
   * @param transport The transport to listen on (e.g. StdioServerTransport)
   */
  start(transport: Transport): Promise<void>;

  /**
   * Stop the proxy server.
   */
  close(): Promise<void>;
}
