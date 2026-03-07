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

import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3GenerateResult } from "@ai-sdk/provider";

/**
 * Creates an AI SDK v6 mock response with the correct shape.
 * Single source of truth for the MockLanguageModelV3 response format.
 */
export function mockResponse(
  content: LanguageModelV3GenerateResult["content"],
  finishReason: string = "stop",
): LanguageModelV3GenerateResult {
  return {
    content,
    finishReason: { unified: finishReason as any, raw: finishReason },
    usage: {
      inputTokens: { total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 20, text: undefined, reasoning: undefined },
    },
    warnings: [],
  };
}

/**
 * Creates a MockLanguageModelV3 with a single text response.
 */
export function createTextMock(text: string) {
  return new MockLanguageModelV3({
    doGenerate: async () => mockResponse([{ type: "text", text }]),
  });
}

/**
 * Creates a MockLanguageModelV3 that returns a tool call on the first step,
 * then a text response on the second step.
 */
export function createToolCallMock(opts: {
  toolName: string;
  toolCallId?: string;
  input: Record<string, unknown>;
  followUpText?: string;
}) {
  let callCount = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      callCount++;
      if (callCount === 1) {
        return mockResponse([{
          type: "tool-call" as const,
          toolCallId: opts.toolCallId ?? "call-1",
          toolName: opts.toolName,
          input: JSON.stringify(opts.input),
        }], "tool-calls");
      }
      return mockResponse([
        { type: "text" as const, text: opts.followUpText ?? "Done." },
      ]);
    },
  });
}

/**
 * Returns a real Gemini model for E2E testing.
 * Requires GOOGLE_GENERATIVE_AI_API_KEY env var.
 */
export async function createGeminiModel(modelId = "gemini-3.1-flash-lite-preview") {
  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Set GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY");
  const google = createGoogleGenerativeAI({ apiKey });
  return google(modelId);
}
