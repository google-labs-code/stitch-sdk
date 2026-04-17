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

export const inferThemeTool: VirtualToolDefinition = {
  name: 'infer_theme',
  description: 'Infer theme tokens from a screen HTML',
  source: 'sdk',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project ID' },
      screenId: { type: 'string', description: 'Screen ID' }
    },
    required: ['projectId', 'screenId']
  },
  execute: async (client, args) => {
    const { projectId, screenId } = args;
    const project = createProject(projectId, client);
    const theme = await project.inferTheme(screenId);
    return {
      content: [{ type: 'text', text: JSON.stringify(theme, null, 2) }]
    };
  }
};

export const themePromptTool: VirtualToolDefinition = {
  name: 'theme_prompt',
  description: 'Inject theme tokens into a prompt',
  source: 'sdk',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Original prompt' },
      theme: { type: 'object', description: 'Theme tokens' }
    },
    required: ['prompt', 'theme']
  },
  execute: async (client, args) => {
    const { prompt, theme } = args;
    const project = new Project(null as any, '');
    const enhancedPrompt = project.themePrompt(prompt, theme);
    return {
      content: [{ type: 'text', text: enhancedPrompt }]
    };
  }
};

export const syncThemeTool: VirtualToolDefinition = {
  name: 'sync_theme',
  description: 'Sync theme tokens to a design system',
  source: 'sdk',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', description: 'Project ID' },
      theme: { type: 'object', description: 'Theme tokens' }
    },
    required: ['projectId', 'theme']
  },
  execute: async (client, args) => {
    const { projectId, theme } = args;
    const project = createProject(projectId, client);
    const result = await project.syncTheme(theme);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  }
};

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
    case 'infer_theme': return inferThemeTool.execute(dummyClient as any, args);
    case 'theme_prompt': return themePromptTool.execute(dummyClient as any, args);
    case 'sync_theme': return syncThemeTool.execute(dummyClient as any, args);
    case 'download_assets': return downloadAssetsTool.execute(dummyClient as any, args);
    default: throw new Error(`Unknown virtual tool: ${name}`);
  }
}

export function isVirtualTool(name: string): boolean {
  return ['infer_theme', 'theme_prompt', 'sync_theme', 'download_assets'].includes(name);
}
