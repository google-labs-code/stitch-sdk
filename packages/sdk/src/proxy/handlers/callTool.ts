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
