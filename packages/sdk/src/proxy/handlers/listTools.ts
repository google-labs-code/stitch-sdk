import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { ProxyContext } from '../client.js';
import { refreshTools } from '../client.js';

/**
 * Register the tools/list handler.
 */
export function registerListToolsHandler(
  server: Server,
  ctx: ProxyContext
): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      await refreshTools(ctx);
    } catch (err) {
      console.error('[stitch-proxy] Failed to refresh tools:', err);
    }
    return { tools: ctx.remoteTools };
  });
}
