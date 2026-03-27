/**
 * Stitch MCP Proxy — runs inside a container, reads API key from
 * a mounted secret at /run/secrets/stitch-api-key.
 *
 * Build:
 *   podman build -t stitch-mcp .
 *
 * Run:
 *   podman run --rm -i --secret stitch-api-key stitch-mcp
 */
import { readFileSync } from 'node:fs';
import { StitchProxy } from '@google/stitch-sdk';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const apiKey = readFileSync('/run/secrets/stitch-api-key', 'utf-8').trim();
const proxy = new StitchProxy({ apiKey });
const transport = new StdioServerTransport();

process.on('SIGINT', async () => {
  await proxy.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await proxy.close();
  process.exit(0);
});

await proxy.start(transport);
