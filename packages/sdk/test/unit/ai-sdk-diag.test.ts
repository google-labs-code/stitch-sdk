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

import { describe, it, expect, vi } from "vitest";
import { generateText, dynamicTool, jsonSchema, stepCountIs } from "ai";
import { mockResponse } from "../helpers/model-helpers.js";
import { MockLanguageModelV3 } from "ai/test";

/**
 * Verifies that AI SDK v6 dynamicTool + jsonSchema correctly executes
 * tool calls from a MockLanguageModelV3. This is a baseline test that
 * validates our understanding of the v6 API surface independent of
 * the stitchTools() adapter.
 */
describe("AI SDK v6: dynamicTool execution baseline", () => {
  it("execute is called with parsed input when LLM returns a tool-call", async () => {
    const executeSpy = vi.fn().mockResolvedValue({ ok: true });

    const tools = {
      test_tool: dynamicTool({
        description: "A test tool",
        inputSchema: jsonSchema({ type: "object", properties: { name: { type: "string" } } }),
        execute: executeSpy,
      }),
    };

    let callCount = 0;
    const result = await generateText({
      model: new MockLanguageModelV3({
        doGenerate: async () => {
          callCount++;
          if (callCount === 1) {
            return mockResponse([{
              type: "tool-call" as const,
              toolCallId: "c1",
              toolName: "test_tool",
              input: JSON.stringify({ name: "hello" }),
            }], "tool-calls");
          }
          return mockResponse([{ type: "text" as const, text: "Done" }]);
        },
      }),
      tools,
      prompt: "test",
      stopWhen: stepCountIs(3),
    });

    expect(callCount).toBe(2);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].toolCalls[0].toolName).toBe("test_tool");
    expect(result.steps[0].toolCalls[0].dynamic).toBe(true);
    expect(executeSpy).toHaveBeenCalledOnce();
    expect(executeSpy.mock.calls[0][0]).toEqual({ name: "hello" });
    expect(result.text).toBe("Done");
  });
});
