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

import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { ProxyContext } from "../client.js";
import { refreshTools } from "../client.js";
import { virtualTools } from "../virtual-tools.js";
import { repairToolSchemas } from "../../schema-repair.js";

const PROXY_VIRTUAL_TOOLS = virtualTools.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.inputSchema,
}));

/**
 * Register the tools/list handler.
 */
export function registerListToolsHandler(
  server: Server,
  ctx: ProxyContext,
): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      await refreshTools(ctx);
    } catch (err) {
      console.error("[stitch-proxy] Failed to refresh tools:", err);
      if (ctx.remoteTools.length === 0) {
        throw err;
      } else {
        console.warn(
          "[stitch-proxy] Warning: Using stale tools due to refresh failure",
        );
      }
    }
    // ctx.remoteTools holds RAW schemas (capture truth). Repair a copy at
    // serving time: downstream MCP clients' AJV validators crash on
    // unresolved $ref targets the backend sometimes omits.
    const served = structuredClone(ctx.remoteTools);
    repairToolSchemas(served);

    // Collision detection: if the server ever ships a tool with a virtual
    // tool's name, the virtual tool wins the callTool route (isVirtualTool
    // is checked first) — so don't serve a duplicate listing, and say so
    // loudly instead of silently shadowing.
    const virtualNames = new Set(PROXY_VIRTUAL_TOOLS.map((t) => t.name));
    const deduped = served.filter((t) => {
      if (virtualNames.has(t.name)) {
        console.warn(
          `[stitch-proxy] Remote tool "${t.name}" collides with a local ` +
            `virtual tool and is shadowed. Rename one of them.`,
        );
        return false;
      }
      return true;
    });
    return { tools: [...deduped, ...PROXY_VIRTUAL_TOOLS] };
  });
}
