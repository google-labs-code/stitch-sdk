import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { ProxyContext } from '../client.js';
import { forwardToStitch } from '../client.js';

/**
 * Register the tools/call handler.
 */
export function registerCallToolHandler(
  server: Server,
  ctx: ProxyContext
): void {
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`[stitch-proxy] Calling tool: ${name}`);

    try {
      const result = await forwardToStitch(ctx.config, 'tools/call', {
        name,
        arguments: args,
      });
      return result as { content: Array<{ type: string; text: string }> };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[stitch-proxy] Tool call failed: ${errorMessage}`);
      return {
        content: [{ type: 'text', text: `Error calling ${name}: ${errorMessage}` }],
        isError: true,
      };
    }
  });
}
