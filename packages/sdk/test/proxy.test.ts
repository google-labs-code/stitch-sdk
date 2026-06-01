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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StitchProxy } from "../src/proxy/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  forwardToStitch,
  initializeStitchConnection,
} from "../src/proxy/client.js";
import { registerListToolsHandler } from "../src/proxy/handlers/listTools.js";
import { registerCallToolHandler } from "../src/proxy/handlers/callTool.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { downloadAssetsTool } from "../src/proxy/virtual-tools.js";

const EXPECTED_VIRTUAL_TOOLS = [downloadAssetsTool].map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.inputSchema,
}));

// Mock fetch
const globalFetch = global.fetch;

describe("StitchProxy", () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = globalFetch;
    vi.clearAllMocks();
  });

  it("should initialize with valid config", () => {
    const proxy = new StitchProxy({ apiKey: "test-key" });
    expect(proxy).toBeDefined();
  });

  it("should throw if neither API key nor access token is provided", () => {
    delete process.env.STITCH_API_KEY;
    delete process.env.STITCH_ACCESS_TOKEN;
    expect(() => new StitchProxy({})).toThrow(
      "StitchProxy requires an API key (STITCH_API_KEY) or access token (STITCH_ACCESS_TOKEN)",
    );
  });

  it("should initialize with accessToken instead of apiKey", () => {
    delete process.env.STITCH_API_KEY;
    delete process.env.STITCH_ACCESS_TOKEN;
    const proxy = new StitchProxy({ accessToken: "test-token" });
    expect(proxy).toBeDefined();
  });

  it("should initialize with STITCH_ACCESS_TOKEN env var", () => {
    delete process.env.STITCH_API_KEY;
    process.env.STITCH_ACCESS_TOKEN = "env-token";
    const proxy = new StitchProxy({});
    expect(proxy).toBeDefined();
    delete process.env.STITCH_ACCESS_TOKEN;
  });

  it("should connect to stitch and fetch tools on start", async () => {
    const proxy = new StitchProxy({ apiKey: "test-key" });

    // Mock responses for initialize, initialized, and tools/list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { protocolVersion: "2024-11-05" } }),
    } as Response); // initialize

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response); // notifications/initialized (fire and forget, might not be awaited immediately but mocked anyway if called)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { tools: [{ name: "test-tool" }] } }),
    } as Response); // tools/list

    const mockTransport = {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      onmessage: undefined,
      onclose: undefined,
      onerror: undefined,
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as Transport;

    await proxy.start(mockTransport);

    // Expect 3 calls: initialize, notifications/initialized (which might complete quickly), and tools/list
    // Since notifications/initialized is fire-and-forget but we mock fetch, it counts if called.
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockTransport.start).toHaveBeenCalled();
  });
});

describe("Proxy Client Error Handling", () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = globalFetch;
    vi.clearAllMocks();
  });

  it("forwardToStitch should send Authorization: Bearer header when accessToken is configured", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: "ok" }),
    } as Response);

    await forwardToStitch(
      {
        url: "http://test",
        accessToken: "my-token",
        quotaProjectId: "my-project",
      } as any,
      "testMethod",
    );

    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[1].headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer my-token",
        "X-Goog-User-Project": "my-project",
      }),
    );
    expect(fetchCall[1].headers).not.toHaveProperty("X-Goog-Api-Key");
  });

  it("forwardToStitch should send X-Goog-Api-Key header when only apiKey is configured", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: "ok" }),
    } as Response);

    await forwardToStitch(
      { url: "http://test", apiKey: "my-api-key" } as any,
      "testMethod",
    );

    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[1].headers).toEqual(
      expect.objectContaining({
        "X-Goog-Api-Key": "my-api-key",
      }),
    );
    expect(fetchCall[1].headers).not.toHaveProperty("Authorization");
  });

  it("forwardToStitch should throw Stitch API error on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as Response);

    await expect(
      forwardToStitch(
        { url: "http://test", apiKey: "test-key" } as any,
        "testMethod",
      ),
    ).rejects.toThrow("Stitch API error (500): Internal Server Error");
  });

  it("forwardToStitch should throw Stitch RPC error on JSON-RPC error payload", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: { message: "Method not found" } }),
    } as Response);

    await expect(
      forwardToStitch(
        { url: "http://test", apiKey: "test-key" } as any,
        "testMethod",
      ),
    ).rejects.toThrow("Stitch RPC error: Method not found");
  });

  it("initializeStitchConnection should catch and log rejected fetch on notifications/initialized", async () => {
    // initialize request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: {} }),
    } as Response);

    // notifications/initialized (rejects)
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    // tools/list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { tools: [] } }),
    } as Response);

    const ctx = {
      config: {
        url: "http://test",
        apiKey: "test-key",
        name: "test",
        version: "1.0",
      },
      remoteTools: [],
    } as any;

    await expect(initializeStitchConnection(ctx)).resolves.not.toThrow();

    // allow the fire-and-forget promise to settle
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(console.error).toHaveBeenCalledWith(
      "[stitch-proxy] Failed to send initialized notification:",
      expect.any(Error),
    );
  });
});

describe("Proxy Handlers", () => {
  let mockFetch: any;
  let mockServer: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Mock for Server.setRequestHandler
    mockServer = {
      handlers: new Map(),
      setRequestHandler(schema: any, handler: any) {
        this.handlers.set(schema, handler);
      },
    };
  });

  afterEach(() => {
    global.fetch = globalFetch;
    vi.clearAllMocks();
  });

  it("registerListToolsHandler should invoke refreshTools and return cached tools", async () => {
    const ctx = {
      config: { url: "http://test", apiKey: "test-key" },
      remoteTools: [],
    } as any;

    registerListToolsHandler(mockServer as any, ctx);

    const handler = mockServer.handlers.get(ListToolsRequestSchema);
    expect(handler).toBeDefined();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { tools: [{ name: "refreshed-tool" }] } }),
    } as Response);

    const result = await handler({} as any, {} as any);

    expect(result).toEqual({
      tools: [{ name: "refreshed-tool" }, ...EXPECTED_VIRTUAL_TOOLS],
    });
    expect(ctx.remoteTools).toEqual([{ name: "refreshed-tool" }]);
  });

  it("registerListToolsHandler should handle fetch error gracefully", async () => {
    const ctx = {
      config: { url: "http://test", apiKey: "test-key" },
      remoteTools: [{ name: "existing-tool" }],
    } as any;

    registerListToolsHandler(mockServer as any, ctx);

    const handler = mockServer.handlers.get(ListToolsRequestSchema);
    expect(handler).toBeDefined();

    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const result = await handler({} as any, {} as any);

    // Should return existing tools if refresh fails
    expect(result).toEqual({
      tools: [{ name: "existing-tool" }, ...EXPECTED_VIRTUAL_TOOLS],
    });
    expect(console.error).toHaveBeenCalledWith(
      "[stitch-proxy] Failed to refresh tools:",
      expect.any(Error),
    );
  });

  it("registerCallToolHandler should invoke forwardToStitch and return result", async () => {
    const ctx = {
      config: { url: "http://test", apiKey: "test-key" },
      remoteTools: [],
    } as any;

    registerCallToolHandler(mockServer as any, ctx);

    const handler = mockServer.handlers.get(CallToolRequestSchema);
    expect(handler).toBeDefined();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { content: [{ type: "text", text: "success" }] },
      }),
    } as Response);

    const request = {
      params: { name: "test_tool", arguments: { arg1: "value1" } },
    };

    const result = await handler(request as any, {} as any);

    expect(result).toEqual({ content: [{ type: "text", text: "success" }] });
    expect(console.error).toHaveBeenCalledWith(
      "[stitch-proxy] Calling tool: test_tool",
    );
  });

  it("registerCallToolHandler should return isError: true on failure", async () => {
    const ctx = {
      config: { url: "http://test", apiKey: "test-key" },
      remoteTools: [],
    } as any;

    registerCallToolHandler(mockServer as any, ctx);

    const handler = mockServer.handlers.get(CallToolRequestSchema);
    expect(handler).toBeDefined();

    mockFetch.mockRejectedValueOnce(new Error("RPC failed"));

    const request = {
      params: { name: "test_tool", arguments: { arg1: "value1" } },
    };

    const result = await handler(request as any, {} as any);

    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain(
      "Error calling test_tool: Network failure connecting to Stitch API: RPC failed",
    );
    expect(console.error).toHaveBeenCalledWith(
      "[stitch-proxy] Tool call failed: Network failure connecting to Stitch API: RPC failed",
    );
  });
});
