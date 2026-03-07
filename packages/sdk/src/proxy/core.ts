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
