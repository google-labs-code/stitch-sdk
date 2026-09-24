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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerListToolsHandler } from "../../src/proxy/handlers/listTools.js";
import { registerCallToolHandler } from "../../src/proxy/handlers/callTool.js";
import { downloadAssetsTool } from "../../src/proxy/virtual-tools.js";
import { EntityManager } from "../../src/entity-manager.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const EXPECTED_VIRTUAL_TOOLS = [downloadAssetsTool].map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.inputSchema,
}));

// Use vi.hoisted to ensure variables are available in mocked modules
const { mockDownloadAssets } = vi.hoisted(() => ({
  mockDownloadAssets: vi.fn(),
}));

vi.mock("../../src/project-ext.js", () => ({
  Project: vi.fn().mockImplementation(() => ({
    downloadAssets: mockDownloadAssets,
  })),
}));

describe("Proxy Handlers", () => {
  let mockServer: any;
  let mockCtx: any;
  let handlers: Map<any, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = new Map();
    mockServer = {
      setRequestHandler: vi.fn().mockImplementation((schema, handler) => {
        handlers.set(schema, handler);
      }),
    };

    // The proxy's ONE MCP stack: a fake StitchToolClient. Handlers must
    // route everything through it — no direct fetch/JSON-RPC anywhere.
    const fakeClient: any = {
      callToolRaw: vi.fn(),
      listToolsRaw: vi.fn().mockResolvedValue({
        tools: [{ name: "remote_tool", description: "Remote" }],
      }),
      callTool: vi.fn(),
    };
    fakeClient.entities = new EntityManager(fakeClient);

    mockCtx = {
      config: { apiKey: "test-key", url: "https://example.com" },
      client: fakeClient,
      remoteTools: [{ name: "remote_tool", description: "Remote" }],
    };
  });

  it("should list virtual tools", async () => {
    registerListToolsHandler(mockServer, mockCtx);

    const handler = handlers.get(ListToolsRequestSchema);
    expect(handler).toBeDefined();

    const result = await handler();
    expect(result.tools.length).toBe(1 + EXPECTED_VIRTUAL_TOOLS.length);
    expect(
      result.tools.find((t: any) => t.name === "download_assets"),
    ).toBeTruthy();
  });

  it("should handle virtual tool call", async () => {
    mockDownloadAssets.mockResolvedValue([]);

    registerCallToolHandler(mockServer, mockCtx);

    const handler = handlers.get(CallToolRequestSchema);
    expect(handler).toBeDefined();

    const request = {
      params: {
        name: "download_assets",
        arguments: { projectId: "p1", outputDir: "/tmp/out" },
      },
    };

    const result = await handler(request);
    expect(result.content[0].text).toContain("/tmp/out");
    // Virtual tools never round-trip through the upstream forwarder.
    expect(mockCtx.client.callToolRaw).not.toHaveBeenCalled();
  });

  it("should forward non-virtual tool call", async () => {
    const envelope = {
      content: [{ type: "text", text: "forwarded" }],
      structuredContent: { ok: true },
    };
    mockCtx.client.callToolRaw.mockResolvedValue(envelope);

    registerCallToolHandler(mockServer, mockCtx);

    const handler = handlers.get(CallToolRequestSchema);
    expect(handler).toBeDefined();

    const request = {
      params: {
        name: "remote_tool",
        arguments: { arg1: "val1" },
      },
    };

    const result = await handler(request);
    expect(mockCtx.client.callToolRaw).toHaveBeenCalledWith("remote_tool", {
      arg1: "val1",
    });
    // The RAW envelope is forwarded VERBATIM — no parsing, no rewrapping.
    expect(result).toEqual(envelope);
  });

  it("should forward isError envelopes verbatim (downstream owns error semantics)", async () => {
    const errorEnvelope = {
      isError: true,
      content: [{ type: "text", text: "Project not found" }],
    };
    mockCtx.client.callToolRaw.mockResolvedValue(errorEnvelope);

    registerCallToolHandler(mockServer, mockCtx);
    const handler = handlers.get(CallToolRequestSchema);

    const result = await handler({
      params: { name: "remote_tool", arguments: {} },
    });
    expect(result).toEqual(errorEnvelope);
  });

  it("should return an isError envelope when the upstream result is undefined", async () => {
    mockCtx.client.callToolRaw.mockResolvedValue(undefined);

    registerCallToolHandler(mockServer, mockCtx);
    const handler = handlers.get(CallToolRequestSchema);

    const result = await handler({
      params: { name: "remote_tool", arguments: {} },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain(
      "Upstream returned no result for remote_tool",
    );
  });
});
