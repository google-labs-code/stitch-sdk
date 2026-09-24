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

import { StitchProxyConfig } from "../spec/proxy.js";
import type { StitchToolClient } from "../client.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Shared state for proxy handlers.
 *
 * `client` is the ONE MCP stack in the repo (D9): a real StitchToolClient
 * over the MCP SDK's StreamableHTTPClientTransport. The caller constructs
 * and injects it (see core.ts) — this module never builds transports or
 * speaks JSON-RPC itself.
 */
export interface ProxyContext {
  config: StitchProxyConfig;
  client: StitchToolClient;
  remoteTools: Tool[];
}

/**
 * Initialize the upstream Stitch connection and fetch tools.
 *
 * The MCP SDK handles the initialize handshake (protocol version,
 * session id, awaited notifications/initialized) — the hand-rolled
 * JSON-RPC machinery that used to live here is gone.
 */
export async function initializeStitchConnection(
  ctx: ProxyContext,
): Promise<void> {
  await ctx.client.connect();
  await refreshTools(ctx);
  console.error(
    `[stitch-proxy] Connected to Stitch, discovered ${ctx.remoteTools.length} tools`,
  );
}

/**
 * Refresh the cached tools list from Stitch.
 *
 * Stores schemas RAW, exactly as served. Repair (injecting missing
 * $defs) is a SERVING concern applied where schemas are consumed —
 * see handlers/listTools.ts — never at capture: the tools-manifest
 * is the pipeline's source of truth and must not be coupled to the
 * repair heuristics.
 */
export async function refreshTools(ctx: ProxyContext): Promise<void> {
  ctx.remoteTools = (await ctx.client.listToolsRaw()).tools;
}
