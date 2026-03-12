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

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StitchConfigSchema, StitchConfig, StitchToolClientSpec } from './spec/client.js';
import { StitchError, StitchErrorCode } from './spec/errors.js';
import { SDK_VERSION } from './version.js';

/**
 * Authenticated tool pipe for the Stitch MCP Server.
 *
 * Designed for agents and orchestration scripts that forward JSON payloads
 * to MCP tools. Handles auth injection via the transport layer (not global fetch).
 *
 * Usage:
 *   const client = new StitchToolClient();          // reads STITCH_API_KEY from env
 *   const result = await client.callTool("generate_screen_from_text", { ... });
 */
export class StitchToolClient implements StitchToolClientSpec {
  name: 'stitch-tool-client' = 'stitch-tool-client';
  description: 'Authenticated tool pipe for Stitch MCP Server' = 'Authenticated tool pipe for Stitch MCP Server';

  private client: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private config: StitchConfig;
  private isConnected: boolean = false;

  constructor(inputConfig?: Partial<StitchConfig>) {
    const rawConfig = {
      accessToken: inputConfig?.accessToken || process.env.STITCH_ACCESS_TOKEN,
      apiKey: inputConfig?.apiKey || process.env.STITCH_API_KEY,
      projectId: inputConfig?.projectId || process.env.GOOGLE_CLOUD_PROJECT,
      baseUrl: inputConfig?.baseUrl,
      timeout: inputConfig?.timeout,
    };
    this.config = StitchConfigSchema.parse(rawConfig);

    this.client = new Client(
      { name: "stitch-core-client", version: SDK_VERSION },
      { capabilities: {} }
    );
  }

  /**
   * Build auth headers based on config (API key or OAuth).
   */
  private buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json, text/event-stream',
    };

    if (this.config.apiKey) {
      headers['X-Goog-Api-Key'] = this.config.apiKey;
    } else {
      headers['Authorization'] = `Bearer ${this.config.accessToken}`;
      headers['X-Goog-User-Project'] = this.config.projectId!;
    }

    return headers;
  }

  private parseToolResponse<T>(result: any, name: string): T {
    if (result.isError) {
      const errorText = (result.content as any[]).map((c: any) => (c.type === 'text' ? c.text : '')).join('');

      let code: StitchErrorCode = 'UNKNOWN_ERROR';
      const lowerErrorText = errorText.toLowerCase();

      if (lowerErrorText.includes('rate limit') || lowerErrorText.includes('429')) {
        code = 'RATE_LIMITED';
      } else if (lowerErrorText.includes('not found') || lowerErrorText.includes('404')) {
        code = 'NOT_FOUND';
      } else if (lowerErrorText.includes('permission') || lowerErrorText.includes('403')) {
        code = 'PERMISSION_DENIED';
      }

      throw new StitchError({
        code,
        message: `Tool Call Failed [${name}]: ${errorText}`,
        recoverable: code === 'RATE_LIMITED',
      });
    }

    // Stitch specific parsing: Check structuredContent first, then JSON in text
    const anyResult = result as any;
    if (anyResult.structuredContent) return anyResult.structuredContent as T;

    const textContent = (result.content as any[]).find((c: any) => c.type === 'text');
    if (textContent && textContent.type === 'text') {
      try {
        return JSON.parse(textContent.text) as T;
      } catch {
        return textContent.text as unknown as T;
      }
    }

    return anyResult as T;
  }

  async connect() {
    if (this.isConnected) return;

    // Create transport with auth headers injected per-instance (no global fetch mutation)
    this.transport = new StreamableHTTPClientTransport(
      new URL(this.config.baseUrl),
      {
        requestInit: {
          headers: this.buildAuthHeaders(),
        },
      }
    );

    this.transport.onerror = (err) => {
      console.error("Stitch Transport Error:", err);
      this.isConnected = false;
    };

    await this.client.connect(this.transport);
    this.isConnected = true;
  }

  /**
   * Generic tool caller with type support and error parsing.
   */
  async callTool<T>(name: string, args: Record<string, any>): Promise<T> {
    if (!this.isConnected) await this.connect();

    const result = await this.client.callTool(
      { name, arguments: args },
      undefined,
      { timeout: this.config.timeout }
    );

    return this.parseToolResponse<T>(result, name);
  }

  async listTools() {
    if (!this.isConnected) await this.connect();
    return this.client.listTools();
  }

  async close() {
    if (this.transport) {
      await this.transport.close();
      this.isConnected = false;
    }
  }
}
