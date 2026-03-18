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

import { StitchProxyConfig } from '../spec/proxy.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Shared state for proxy handlers.
 */
export interface ProxyContext {
  config: StitchProxyConfig;
  remoteTools: Tool[];
}

let nextRequestId = 1;

/**
 * Build auth headers based on proxy config (API key or OAuth).
 */
function buildProxyAuthHeaders(config: StitchProxyConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (config.apiKey) {
    headers['X-Goog-Api-Key'] = config.apiKey;
  } else if (config.accessToken) {
    headers['Authorization'] = `Bearer ${config.accessToken}`;
    if (config.projectId) {
      headers['X-Goog-User-Project'] = config.projectId;
    }
  }

  return headers;
}

/**
 * Forward a JSON-RPC request to Stitch.
 */
export async function forwardToStitch(
  config: StitchProxyConfig,
  method: string,
  params?: unknown
): Promise<unknown> {
  const request = {
    jsonrpc: '2.0',
    method,
    params: params ?? {},
    id: nextRequestId++,
  };

  let response: Response;
  try {
    response = await fetch(config.url, {
      method: 'POST',
      headers: buildProxyAuthHeaders(config),
      body: JSON.stringify(request),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Network failure connecting to Stitch API: ${msg}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stitch API error (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as {
    error?: { message: string };
    result?: unknown;
  };

  if (result.error) {
    throw new Error(`Stitch RPC error: ${result.error.message}`);
  }

  return result.result;
}

/**
 * Initialize connection to Stitch and fetch tools.
 */
export async function initializeStitchConnection(
  ctx: ProxyContext
): Promise<void> {
  // Send initialize request
  await forwardToStitch(ctx.config, 'initialize', {
    protocolVersion: ctx.config.protocolVersion || '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: ctx.config.name,
      version: ctx.config.version,
    },
  });

  // Send initialized notification and await it before proceeding
  try {
    await fetch(ctx.config.url, {
      method: 'POST',
      headers: buildProxyAuthHeaders(ctx.config),
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });
  } catch (err) {
    console.error('[stitch-proxy] Failed to send initialized notification:', err);
  }

  await refreshTools(ctx);
  console.error(
    `[stitch-proxy] Connected to Stitch, discovered ${ctx.remoteTools.length} tools`
  );
}

/**
 * Refresh the cached tools list from Stitch.
 */
export async function refreshTools(ctx: ProxyContext): Promise<void> {
  const toolsResult = (await forwardToStitch(ctx.config, 'tools/list', {})) as {
    tools: Tool[];
  };
  ctx.remoteTools = toolsResult.tools || [];
}
