import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StitchConfigSchema, StitchConfig, StitchToolClientSpec } from './spec/client.js';
import pkg from '../package.json' with { type: 'json' };

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
      { name: "stitch-core-client", version: pkg.version },
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

    if (result.isError) {
      const errorText = (result.content as any[]).map(c => (c.type === 'text' ? c.text : '')).join('');
      throw new Error(`Tool Call Failed [${name}]: ${errorText}`);
    }

    // Stitch specific parsing: Check structuredContent first, then JSON in text
    const anyResult = result as any;
    if (anyResult.structuredContent) return anyResult.structuredContent as T;

    const textContent = (result.content as any[]).find(c => c.type === 'text');
    if (textContent && textContent.type === 'text') {
      try {
        return JSON.parse(textContent.text) as T;
      } catch {
        return textContent.text as unknown as T;
      }
    }

    return anyResult as T;
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
