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
import { generateText, stepCountIs } from "ai";
import { mockResponse, createTextMock, createToolCallMock } from "../helpers/model-helpers.js";

const mockCallTool = vi.fn();

// Mock the singleton to inject a controllable client
vi.mock("../../src/singleton.js", () => ({
  getOrCreateClient: () => ({
    callTool: mockCallTool,
  }),
}));

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
    const tools = stitchTools({ include: ["create_project"] });

    const result = await generateText({
      model: createTextMock("I created a project."),
      tools,
      prompt: "Create a project called Test",
    });

    expect(result.text).toBe("I created a project.");
  });

  it("mock LLM tool call triggers the correct execute function", async () => {
    const { stitchTools } = await import("../../src/tools-adapter.js");
    const tools = stitchTools({ include: ["create_project"] });

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
    const tools = stitchTools({ include: ["create_project"] });

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
