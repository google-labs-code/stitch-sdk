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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateText, stepCountIs, type Tool } from "ai";
import { mockResponse, createTextMock, createToolCallMock } from "../helpers/model-helpers.js";
import type { StitchTool } from "../../src/tools-adapter.js";

const mockCallTool = vi.fn();

// Mock the singleton to inject a controllable client
vi.mock("../../src/singleton.js", () => ({
  getOrCreateClient: () => ({
    callTool: mockCallTool,
  }),
}));

/**
 * Bridge StitchTool → AI SDK Tool for test assertions.
 *
 * Our StitchTool uses Symbol.for("vercel.ai.schema") which is runtime-identical
 * to the AI SDK's internal schemaSymbol, but TypeScript can't verify unique symbol
 * equality across module boundaries. This targeted assertion narrows to Record<string, Tool>
 * rather than escaping to `any`.
 */
function asToolSet(tools: Record<string, StitchTool>): Record<string, Tool> {
  // StitchTool uses Symbol.for("vercel.ai.schema") which is the same runtime value
  // as the AI SDK's internal unique symbol, but TypeScript can't unify unique symbols
  // across module boundaries. The `unknown` intermediate is the TS-recommended pattern
  // for this class of cross-boundary type bridge.
  return tools as unknown as Record<string, Tool>;
}

/**
 * TDD Cycle 3: AI SDK Compatibility
 *
 * Verifies that stitchTools() output is plug-and-play with Vercel AI SDK v6's
 * generateText(). Uses MockLanguageModelV3 to simulate LLM tool calls.
 */
describe("AI SDK compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stitchTools() output is accepted by generateText({ tools })", async () => {
    const { stitchTools } = await import("../../src/tools-adapter.js");
    const tools = asToolSet(stitchTools({ include: ["create_project"] }));

    const result = await generateText({
      model: createTextMock("I created a project."),
      tools,
      prompt: "Create a project called Test",
    });

    expect(result.text).toBe("I created a project.");
  });

  it("each tool satisfies the AI SDK Tool shape", async () => {
    const { stitchTools } = await import("../../src/tools-adapter.js");
    const tools = stitchTools({ include: ["create_project"] });

    // Verify each tool has the structural properties the AI SDK expects.
    // The generateText() tests are the authoritative conformance tests,
    // but this validates individual field shapes explicitly.
    for (const [, tool] of Object.entries(tools)) {
      expect(tool.type).toBe('dynamic');
      expect(typeof tool.description).toBe('string');
      expect(tool.inputSchema).toHaveProperty('jsonSchema');
      expect(typeof tool.execute).toBe('function');
    }
  });

  it("mock LLM tool call triggers the correct execute function", async () => {
    const { stitchTools } = await import("../../src/tools-adapter.js");
    const tools = asToolSet(stitchTools({ include: ["create_project"] }));

    mockCallTool.mockResolvedValue({ name: "projects/123", title: "Test Project" });

    await generateText({
      model: createToolCallMock({
        toolName: "create_project",
        input: { title: "Test Project" },
        followUpText: "Done.",
      }),
      tools,
      prompt: "Create a project",
      stopWhen: stepCountIs(3),
    });

    expect(mockCallTool).toHaveBeenCalledWith("create_project", { title: "Test Project" });
  });

  it("tool result flows back through the AI SDK pipeline", async () => {
    const { stitchTools } = await import("../../src/tools-adapter.js");
    const tools = asToolSet(stitchTools({ include: ["create_project"] }));

    mockCallTool.mockResolvedValue({ name: "projects/456", title: "My App" });

    const result = await generateText({
      model: createToolCallMock({
        toolName: "create_project",
        input: { title: "My App" },
        followUpText: "Created project My App with ID 456.",
      }),
      tools,
      prompt: "Create a project called My App",
      stopWhen: stepCountIs(3),
    });

    expect(mockCallTool).toHaveBeenCalledTimes(1);
    expect(result.text).toBe("Created project My App with ID 456.");
  });
});

