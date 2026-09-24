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

// The proxy's upstream connection is a real StitchToolClient (one MCP
// stack, D9). For StitchProxy lifecycle tests we substitute a fake
// instance; the client's own wire behavior (headers, handshake, session
// id) is covered by the MCP SDK and unit/client.test.ts.
const { fakeUpstreamClient, StitchToolClientMock } = vi.hoisted(() => {
  const fakeUpstreamClient = {
    connect: vi.fn(),
    listToolsRaw: vi.fn(),
    callToolRaw: vi.fn(),
    close: vi.fn(),
  };
  return {
    fakeUpstreamClient,
    StitchToolClientMock: vi.fn(() => fakeUpstreamClient),
  };
});

vi.mock("../src/client.js", async (importOriginal) => {
  const actual = await importOriginal<object>();
  return { ...actual, StitchToolClient: StitchToolClientMock };
});

describe("StitchProxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeUpstreamClient.connect.mockResolvedValue(undefined);
    fakeUpstreamClient.listToolsRaw.mockResolvedValue({ tools: [] });
    fakeUpstreamClient.close.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with valid config", () => {
    const proxy = new StitchProxy({ apiKey: "test-key" });
    expect(proxy).toBeDefined();
  });

  it("should map proxy config onto the StitchToolClient config", () => {
    new StitchProxy({
      apiKey: "test-key",
      url: "https://example.com/mcp",
    });
    expect(StitchToolClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-key",
        baseUrl: "https://example.com/mcp",
      }),
    );
  });

  it("should map accessToken + quotaProjectId onto the client's projectId", () => {
    delete process.env.STITCH_API_KEY;
    delete process.env.STITCH_ACCESS_TOKEN;
    new StitchProxy({
      accessToken: "test-token",
      quotaProjectId: "test-project",
      url: "https://example.com/mcp",
    });
    expect(StitchToolClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "test-token",
        projectId: "test-project",
        baseUrl: "https://example.com/mcp",
      }),
    );
  });

  it("should throw if neither API key nor access token is provided", () => {
    delete process.env.STITCH_API_KEY;
    delete process.env.STITCH_ACCESS_TOKEN;
    expect(() => new StitchProxy({})).toThrow(
      "StitchProxy requires an API key (STITCH_API_KEY) or access token (STITCH_ACCESS_TOKEN)",
    );
  });

  it("should initialize with accessToken + quotaProjectId instead of apiKey", () => {
    delete process.env.STITCH_API_KEY;
    delete process.env.STITCH_ACCESS_TOKEN;
    const proxy = new StitchProxy({
      accessToken: "test-token",
      quotaProjectId: "test-project",
    });
    expect(proxy).toBeDefined();
  });

  it("should throw if accessToken is provided without a project (aligned with client)", () => {
    delete process.env.STITCH_API_KEY;
    delete process.env.STITCH_ACCESS_TOKEN;
    delete process.env.STITCH_PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    expect(() => new StitchProxy({ accessToken: "test-token" })).toThrow(
      "Invalid configuration: provide either 'apiKey' OR ('accessToken' + 'projectId').",
    );
  });

  it("should initialize with STITCH_ACCESS_TOKEN env var", () => {
    delete process.env.STITCH_API_KEY;
    process.env.STITCH_ACCESS_TOKEN = "env-token";
    process.env.STITCH_PROJECT_ID = "env-project";
    const proxy = new StitchProxy({});
    expect(proxy).toBeDefined();
    delete process.env.STITCH_ACCESS_TOKEN;
    delete process.env.STITCH_PROJECT_ID;
  });

  it("should connect to stitch and fetch tools on start", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const proxy = new StitchProxy({ apiKey: "test-key" });

    fakeUpstreamClient.listToolsRaw.mockResolvedValue({
      tools: [{ name: "test-tool" }],
    });

    const mockTransport = {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      onmessage: undefined,
      onclose: undefined,
      onerror: undefined,
      send: vi.fn().mockResolvedValue(undefined),
    } as unknown as Transport;

    await proxy.start(mockTransport);

    // The MCP SDK client owns the initialize handshake: one connect(),
    // one tools/list — no hand-rolled JSON-RPC requests anywhere.
    expect(fakeUpstreamClient.connect).toHaveBeenCalledTimes(1);
    expect(fakeUpstreamClient.listToolsRaw).toHaveBeenCalledTimes(1);
    expect(mockTransport.start).toHaveBeenCalled();
  });

  it("should close the upstream client on close()", async () => {
    const proxy = new StitchProxy({ apiKey: "test-key" });
    await proxy.close();
    expect(fakeUpstreamClient.close).toHaveBeenCalledTimes(1);
  });
});

describe("Proxy Handlers", () => {
  let mockServer: any;

  /** ctx shaped like ProxyContext with a fake upstream client. */
  function makeCtx(remoteTools: any[] = []) {
    return {
      config: { url: "http://test", apiKey: "test-key" },
      client: {
        connect: vi.fn().mockResolvedValue(undefined),
        listToolsRaw: vi.fn(),
        callToolRaw: vi.fn(),
        close: vi.fn(),
      },
      remoteTools,
    } as any;
  }

  beforeEach(() => {
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
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("registerListToolsHandler should invoke refreshTools and return cached tools", async () => {
    const ctx = makeCtx([]);
    ctx.client.listToolsRaw.mockResolvedValue({
      tools: [{ name: "refreshed-tool" }],
    });

    registerListToolsHandler(mockServer as any, ctx);

    const handler = mockServer.handlers.get(ListToolsRequestSchema);
    expect(handler).toBeDefined();

    const result = await handler({} as any, {} as any);

    expect(result).toEqual({
      tools: [{ name: "refreshed-tool" }, ...EXPECTED_VIRTUAL_TOOLS],
    });
    expect(ctx.remoteTools).toEqual([{ name: "refreshed-tool" }]);
  });

  it("registerListToolsHandler should handle refresh error gracefully", async () => {
    const ctx = makeCtx([{ name: "existing-tool" }]);
    ctx.client.listToolsRaw.mockRejectedValue(new Error("Network failure"));

    registerListToolsHandler(mockServer as any, ctx);

    const handler = mockServer.handlers.get(ListToolsRequestSchema);
    expect(handler).toBeDefined();

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

  it("registerCallToolHandler should invoke callToolRaw and return result", async () => {
    const ctx = makeCtx();
    ctx.client.callToolRaw.mockResolvedValue({
      content: [{ type: "text", text: "success" }],
    });

    registerCallToolHandler(mockServer as any, ctx);

    const handler = mockServer.handlers.get(CallToolRequestSchema);
    expect(handler).toBeDefined();

    const request = {
      params: { name: "test_tool", arguments: { arg1: "value1" } },
    };

    const result = await handler(request as any, {} as any);

    expect(ctx.client.callToolRaw).toHaveBeenCalledWith("test_tool", {
      arg1: "value1",
    });
    expect(result).toEqual({ content: [{ type: "text", text: "success" }] });
    expect(console.error).toHaveBeenCalledWith(
      "[stitch-proxy] Calling tool: test_tool",
    );
  });

  it("registerCallToolHandler should return isError: true on failure", async () => {
    const ctx = makeCtx();
    ctx.client.callToolRaw.mockRejectedValue(new Error("RPC failed"));

    registerCallToolHandler(mockServer as any, ctx);

    const handler = mockServer.handlers.get(CallToolRequestSchema);
    expect(handler).toBeDefined();

    const request = {
      params: { name: "test_tool", arguments: { arg1: "value1" } },
    };

    const result = await handler(request as any, {} as any);

    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain(
      "Error calling test_tool: RPC failed",
    );
    expect(console.error).toHaveBeenCalledWith(
      "[stitch-proxy] Tool call failed: RPC failed",
    );
  });
});
