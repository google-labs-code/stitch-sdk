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

import { Project } from "../project-ext.js";
import { VirtualToolDefinition } from "../spec/client.js";
import type { ProxyContext } from "./client.js";

/**
 * Create a Project handle bound to a client, via the identity map.
 * Exported for tests: direct `new Project(client, id)` does NOT hydrate
 * projectId (that regression broke this tool silently once already).
 */
export function createProject(projectId: string, client: any): Project {
  return client.entities.resolve(Project, ["projectId"], { projectId });
}

export const downloadAssetsTool: VirtualToolDefinition = {
  name: "download_assets",
  description: "Download screens and assets to a local directory",
  source: "sdk",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "Project ID" },
      outputDir: { type: "string", description: "Output directory" },
    },
    required: ["projectId", "outputDir"],
  },
  execute: async (client, args) => {
    const { projectId, outputDir } = args;
    const project = createProject(projectId, client);
    await project.downloadAssets(outputDir);
    return {
      content: [{ type: "text", text: `Assets downloaded to ${outputDir}` }],
    };
  },
};

/** Single registry: listTools, routing, and shadow-detection all derive from it. */
export const virtualTools: VirtualToolDefinition[] = [downloadAssetsTool];

export async function handleVirtualTool(
  name: string,
  args: any,
  ctx: Pick<ProxyContext, "client">,
): Promise<any> {
  const tool = virtualTools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Unknown virtual tool: ${name}`);
  }
  // The real StitchToolClient already provides the parsed-payload callTool
  // contract (isError envelopes throw StitchError) plus the EntityManager
  // identity map — the old dummyClient/proxyClient shim is gone.
  return tool.execute(ctx.client, args);
}

export function isVirtualTool(name: string): boolean {
  return virtualTools.some((t) => t.name === name);
}
