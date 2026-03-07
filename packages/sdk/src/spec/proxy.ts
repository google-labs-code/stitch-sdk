import { z } from 'zod';
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. INPUT SCHEMA
// ─────────────────────────────────────────────────────────────────────────────
export const StitchProxyConfigSchema = z.object({
  /** API key for Stitch authentication. Falls back to STITCH_API_KEY. */
  apiKey: z.string().optional(),

  /** Target Stitch MCP URL. Default: https://stitch.googleapis.com/mcp */
  url: z.string().default('https://stitch.googleapis.com/mcp'),

  /** Name of the local proxy server. Default: stitch-proxy */
  name: z.string().default('stitch-proxy'),

  /** Version of the local proxy server. Default: 1.0.0 */
  version: z.string().default('1.0.0'),
});

export type StitchProxyConfig = z.infer<typeof StitchProxyConfigSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 3. BEHAVIOR INTERFACE
// ─────────────────────────────────────────────────────────────────────────────
export interface StitchProxySpec {
  /**
   * Connect to Stitch and start the proxy server on the given transport.
   * @param transport The transport to listen on (e.g. StdioServerTransport)
   */
  start(transport: Transport): Promise<void>;

  /**
   * Stop the proxy server.
   */
  close(): Promise<void>;
}
