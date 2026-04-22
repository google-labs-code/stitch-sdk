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

import { Project } from '../project-ext.js';
import { VirtualToolDefinition } from '../spec/client.js';
import { forwardToStitch } from './client.js';

// Helper to create a project instance with a client
function createProject(projectId: string, client: any) {
  return new Project(client, projectId);
}

export const downloadAssetsTool: VirtualToolDefinition = {
  name: 'download_assets',
  description: 'Download screens and assets to a local directory',
  source: 'sdk',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project ID' },
      outputDir: { type: 'string', description: 'Output directory' }
    },
    required: ['projectId', 'outputDir']
  },
  execute: async (client, args) => {
    const { projectId, outputDir } = args;
    const project = createProject(projectId, client);
    await project.downloadAssets(outputDir);
    return {
      content: [{ type: 'text', text: `Assets downloaded to ${outputDir}` }]
    };
  }
};

export async function handleVirtualTool(name: string, args: any, ctx: any): Promise<any> {
  const dummyClient = {
    callTool: async (toolName: string, toolArgs: any) => {
      return forwardToStitch(ctx.config, 'tools/call', {
        name: toolName,
        arguments: toolArgs
      });
    }
  };

  switch (name) {
    case 'download_assets': return downloadAssetsTool.execute(dummyClient as any, args);
    default: throw new Error(`Unknown virtual tool: ${name}`);
  }
}

export function isVirtualTool(name: string): boolean {
  return ['download_assets'].includes(name);
}
