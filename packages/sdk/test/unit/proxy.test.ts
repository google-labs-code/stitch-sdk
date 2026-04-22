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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerListToolsHandler } from '../../src/proxy/handlers/listTools.js';
import { registerCallToolHandler } from '../../src/proxy/handlers/callTool.js';
import { downloadAssetsTool } from '../../src/proxy/virtual-tools.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const EXPECTED_VIRTUAL_TOOLS = [downloadAssetsTool].map(t => ({
  name: t.name,
  description: t.description,
  inputSchema: t.inputSchema,
}));

// Use vi.hoisted to ensure variables are available in mocked modules
const { mockDownloadAssets, mockForward } = vi.hoisted(() => ({
  mockDownloadAssets: vi.fn(),
  mockForward: vi.fn()
}));

vi.mock('../../src/project-ext.js', () => ({
  Project: vi.fn().mockImplementation(() => ({
    downloadAssets: mockDownloadAssets
  }))
}));

vi.mock('../../src/proxy/client.js', async () => {
  const actual = await vi.importActual('../../src/proxy/client.js');
  return {
    ...actual,
    refreshTools: vi.fn().mockResolvedValue(undefined),
    forwardToStitch: mockForward
  };
});

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
      })
    };

    mockCtx = {
      config: { apiKey: 'test-key', url: 'https://example.com' },
      remoteTools: [{ name: 'remote_tool', description: 'Remote' }]
    };
  });

  it("should list virtual tools", async () => {
    registerListToolsHandler(mockServer, mockCtx);
    
    const handler = handlers.get(ListToolsRequestSchema);
    expect(handler).toBeDefined();

    const result = await handler();
    expect(result.tools.length).toBe(1 + EXPECTED_VIRTUAL_TOOLS.length);
    expect(result.tools.find((t: any) => t.name === 'download_assets')).toBeTruthy();
  });

  it("should handle virtual tool call", async () => {
    mockDownloadAssets.mockResolvedValue([]);
    
    registerCallToolHandler(mockServer, mockCtx);
    
    const handler = handlers.get(CallToolRequestSchema);
    expect(handler).toBeDefined();

    const request = {
      params: {
        name: 'download_assets',
        arguments: { projectId: 'p1', outputDir: '/tmp/out' }
      }
    };

    const result = await handler(request);
    expect(result.content[0].text).toContain('/tmp/out');
  });

  it("should forward non-virtual tool call", async () => {
    mockForward.mockResolvedValue({ content: [{ type: 'text', text: 'forwarded' }] });
    
    registerCallToolHandler(mockServer, mockCtx);
    
    const handler = handlers.get(CallToolRequestSchema);
    expect(handler).toBeDefined();

    const request = {
      params: {
        name: 'remote_tool',
        arguments: { arg1: 'val1' }
      }
    };

    const result = await handler(request);
    expect(mockForward).toHaveBeenCalledWith(mockCtx.config, 'tools/call', {
      name: 'remote_tool',
      arguments: { arg1: 'val1' }
    });
    expect(result.content[0].text).toBe('forwarded');
  });
});
