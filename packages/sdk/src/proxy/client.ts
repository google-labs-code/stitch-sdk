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
import { buildAuthHeaders } from '../auth.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Shared state for proxy handlers.
 */
export interface ProxyContext {
  config: StitchProxyConfig;
  remoteTools: Tool[];
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
    id: Date.now(),
  };

  let response: Response;
  try {
    response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...buildAuthHeaders(config),
      },
      body: JSON.stringify(request),
    });
  } catch (err: any) {
    throw new Error(`Network failure connecting to Stitch API: ${err.message}`);
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

  // Send initialized notification (fire and forget)
  fetch(ctx.config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...buildAuthHeaders(ctx.config),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  }).catch((err) => {
    console.error('[stitch-proxy] Failed to send initialized notification:', err);
  });

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
