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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StitchProxyConfigSchema, StitchProxyConfig, StitchProxySpec } from '../spec/proxy.js';
import { ProxyContext, initializeStitchConnection } from './client.js';
import { registerListToolsHandler } from './handlers/listTools.js';
import { registerCallToolHandler } from './handlers/callTool.js';

/**
 * A proxy server that forwards MCP requests to Stitch.
 * Bypasses SDK transport layer to handle specific auth and JSON-RPC forwarding.
 */
export class StitchProxy implements StitchProxySpec {
  private config: StitchProxyConfig;
  private server: McpServer;
  private ctx: ProxyContext;

  constructor(inputConfig?: Partial<StitchProxyConfig>) {
    const rawConfig = {
      apiKey: inputConfig?.apiKey || process.env.STITCH_API_KEY,
      url: inputConfig?.url || process.env.STITCH_MCP_URL,
      name: inputConfig?.name,
      version: inputConfig?.version,
    };

    // Validate config
    this.config = StitchProxyConfigSchema.parse(rawConfig);

    if (!this.config.apiKey) {
      throw new Error('StitchProxy requires an API key (STITCH_API_KEY)');
    }

    this.server = new McpServer(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Shared context for handlers
    this.ctx = {
      config: this.config,
      remoteTools: [] as Tool[],
    };

    this.setupHandlers();
  }

  private setupHandlers(): void {
    registerListToolsHandler(this.server.server, this.ctx);
    registerCallToolHandler(this.server.server, this.ctx);
  }

  async start(transport: Transport): Promise<void> {
    console.error(`[stitch-proxy] Connecting to ${this.config.url}...`);
    await initializeStitchConnection(this.ctx);
    await this.server.connect(transport);
    console.error('[stitch-proxy] Proxy server running');
  }

  async close(): Promise<void> {
    await this.server.close();
  }
}
