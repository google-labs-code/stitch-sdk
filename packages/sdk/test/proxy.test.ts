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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StitchProxy } from '../src/proxy/index.js';
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { forwardToStitch, initializeStitchConnection, type ProxyContext } from '../src/proxy/client.js';
import { registerListToolsHandler } from '../src/proxy/handlers/listTools.js';
import { registerCallToolHandler } from '../src/proxy/handlers/callTool.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { StitchProxyConfig } from '../src/spec/proxy.js';

// Mock fetch
const globalFetch = global.fetch;

type MockFetch = ReturnType<typeof vi.fn> & typeof fetch;

function makeProxyConfig(overrides?: Partial<StitchProxyConfig>): StitchProxyConfig {
  return { url: 'http://test', apiKey: 'test-key', name: 'stitch-proxy', version: '1.0.0', protocolVersion: '2024-11-05', ...overrides };
}

function makeProxyContext(overrides?: Partial<ProxyContext>): ProxyContext {
  return { config: makeProxyConfig(), remoteTools: [], ...overrides };
}

type HandlerMap = Map<unknown, (...args: unknown[]) => Promise<unknown>>;

function makeMockServer() {
  const handlers: HandlerMap = new Map();
  return {
    handlers,
    setRequestHandler(schema: unknown, handler: (...args: unknown[]) => Promise<unknown>) {
      handlers.set(schema, handler);
    },
  };
}

describe('StitchProxy', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn() as MockFetch;
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = globalFetch;
    vi.clearAllMocks();
  });

  it('should initialize with valid config', () => {
    const proxy = new StitchProxy({ apiKey: 'test-key' });
    expect(proxy).toBeDefined();
  });

  it('should throw if no auth is provided', () => {
    delete process.env.STITCH_API_KEY;
    delete process.env.STITCH_ACCESS_TOKEN;
    expect(() => new StitchProxy({})).toThrow(/apiKey.*OR.*accessToken.*projectId/i);
  });

  it('should throw if accessToken provided without projectId', () => {
    delete process.env.STITCH_API_KEY;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    expect(() => new StitchProxy({ accessToken: 'token-only' })).toThrow(/apiKey.*OR.*accessToken.*projectId/i);
  });

  it('should initialize with OAuth credentials', () => {
    delete process.env.STITCH_API_KEY;
    const proxy = new StitchProxy({ accessToken: 'ya29.token', projectId: 'my-project' });
    expect(proxy).toBeDefined();
  });

  it('should connect to stitch and fetch tools on start', async () => {
    const proxy = new StitchProxy({ apiKey: 'test-key' });

    // Mock responses for initialize, initialized, and tools/list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { protocolVersion: '2024-11-05' } })
    } as Response); // initialize

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    } as Response); // notifications/initialized

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { tools: [{ name: 'test-tool' }] } })
    } as Response); // tools/list

    const mockTransport: Pick<Transport, 'start' | 'close' | 'send'> & Partial<Transport> = {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
    };

    await proxy.start(mockTransport as Transport);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockTransport.start).toHaveBeenCalled();
  });
});

describe('Proxy Client Error Handling', () => {
  let mockFetch: MockFetch;

  beforeEach(() => {
    mockFetch = vi.fn() as MockFetch;
    global.fetch = mockFetch;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = globalFetch;
    vi.clearAllMocks();
  });

  it('forwardToStitch should send X-Goog-Api-Key header for API key auth', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: {} })
    } as Response);

    await forwardToStitch(makeProxyConfig({ apiKey: 'my-key' }), 'test');

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe('my-key');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('forwardToStitch should send Bearer header for OAuth auth', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: {} })
    } as Response);

    await forwardToStitch(makeProxyConfig({ apiKey: undefined, accessToken: 'ya29.tok', projectId: 'proj-1' }), 'test');

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer ya29.tok');
    expect(headers['X-Goog-User-Project']).toBe('proj-1');
    expect(headers['X-Goog-Api-Key']).toBeUndefined();
  });

  it('forwardToStitch should use auto-incrementing IDs', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: {} })
    } as Response);

    await forwardToStitch(makeProxyConfig(), 'method1');
    await forwardToStitch(makeProxyConfig(), 'method2');

    const body1 = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    const body2 = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
    expect(body2.id).toBeGreaterThan(body1.id);
  });

  it('forwardToStitch should throw Stitch API error on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    } as Response);

    await expect(forwardToStitch(makeProxyConfig(), 'testMethod')).rejects.toThrow('Stitch API error (500): Internal Server Error');
  });

  it('forwardToStitch should throw Stitch RPC error on JSON-RPC error payload', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: { message: 'Method not found' } })
    } as Response);

    await expect(forwardToStitch(makeProxyConfig(), 'testMethod')).rejects.toThrow('Stitch RPC error: Method not found');
  });

  it('initializeStitchConnection should catch and log rejected fetch on notifications/initialized', async () => {
    // initialize request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: {} })
    } as Response);

    // notifications/initialized (rejects)
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    // tools/list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { tools: [] } })
    } as Response);

    const ctx = makeProxyContext();
    await expect(initializeStitchConnection(ctx)).resolves.not.toThrow();

    expect(console.error).toHaveBeenCalledWith(
      '[stitch-proxy] Failed to send initialized notification:',
      expect.any(Error)
    );
  });
});

describe('Proxy Handlers', () => {
  let mockFetch: MockFetch;
  let mockServer: ReturnType<typeof makeMockServer>;

  beforeEach(() => {
    mockFetch = vi.fn() as MockFetch;
    global.fetch = mockFetch;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockServer = makeMockServer();
  });

  afterEach(() => {
    global.fetch = globalFetch;
    vi.clearAllMocks();
  });

  it('registerListToolsHandler should invoke refreshTools and return cached tools', async () => {
    const ctx = makeProxyContext();
    registerListToolsHandler(mockServer as unknown as Server, ctx);

    const handler = mockServer.handlers.get(ListToolsRequestSchema)!;
    expect(handler).toBeDefined();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { tools: [{ name: 'refreshed-tool' }] } })
    } as Response);

    const result = await handler({}, {});
    expect(result).toEqual({ tools: [{ name: 'refreshed-tool' }] });
    expect(ctx.remoteTools).toEqual([{ name: 'refreshed-tool' }]);
  });

  it('registerListToolsHandler should handle fetch error gracefully', async () => {
    const ctx = makeProxyContext({ remoteTools: [{ name: 'existing-tool', inputSchema: { type: 'object' as const } }] });
    registerListToolsHandler(mockServer as unknown as Server, ctx);

    const handler = mockServer.handlers.get(ListToolsRequestSchema)!;
    expect(handler).toBeDefined();

    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const result = await handler({}, {});
    expect(result).toEqual({ tools: [{ name: 'existing-tool', inputSchema: { type: 'object' } }] });
    expect(console.error).toHaveBeenCalledWith(
      '[stitch-proxy] Failed to refresh tools:',
      expect.any(Error)
    );
  });

  it('registerCallToolHandler should invoke forwardToStitch and return result', async () => {
    const ctx = makeProxyContext();
    registerCallToolHandler(mockServer as unknown as Server, ctx);

    const handler = mockServer.handlers.get(CallToolRequestSchema)!;
    expect(handler).toBeDefined();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { content: [{ type: 'text', text: 'success' }] } })
    } as Response);

    const request = { params: { name: 'test_tool', arguments: { arg1: 'value1' } } };
    const result = await handler(request, {});

    expect(result).toEqual({ content: [{ type: 'text', text: 'success' }] });
    expect(console.error).toHaveBeenCalledWith('[stitch-proxy] Calling tool: test_tool');
  });

  it('registerCallToolHandler should return isError: true on failure', async () => {
    const ctx = makeProxyContext();
    registerCallToolHandler(mockServer as unknown as Server, ctx);

    const handler = mockServer.handlers.get(CallToolRequestSchema)!;
    expect(handler).toBeDefined();

    mockFetch.mockRejectedValueOnce(new Error('RPC failed'));

    const request = { params: { name: 'test_tool', arguments: { arg1: 'value1' } } };
    const result = await handler(request, {}) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Error calling test_tool: Network failure connecting to Stitch API: RPC failed');
    expect(console.error).toHaveBeenCalledWith('[stitch-proxy] Tool call failed: Network failure connecting to Stitch API: RPC failed');
  });
});
