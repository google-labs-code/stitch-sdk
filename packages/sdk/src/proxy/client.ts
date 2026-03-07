import { StitchProxyConfig } from '../spec/proxy.js';
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

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Goog-Api-Key': config.apiKey!,
    },
    body: JSON.stringify(request),
  });

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
    protocolVersion: '2024-11-05',
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
      'X-Goog-Api-Key': ctx.config.apiKey!,
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
