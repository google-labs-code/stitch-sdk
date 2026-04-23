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

import { stitchTools } from "@google/stitch-sdk/ai";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

async function main() {
  // Validate environment variables
  if (!process.env.GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY environment variable is required.");
    process.exit(1);
  }
  if (!process.env.STITCH_API_KEY && !process.env.STITCH_ACCESS_TOKEN) {
    console.error("Error: STITCH_API_KEY or STITCH_ACCESS_TOKEN environment variable is required.");
    process.exit(1);
  }

  console.log("Configuring agent with restricted toolset...");

  // Only provide the specific tools needed for this workflow to reduce
  // context window usage and prevent the agent from using other tools.
  const allowedTools = [
    "generate_screen_from_text",
    "get_screen",
  ];

  console.log(`Allowed tools: ${allowedTools.join(", ")}`);

  const tools = stitchTools({ include: allowedTools });

  const google = createGoogleGenerativeAI();
  const model = google("gemini-2.5-pro");

  console.log("\nPrompting agent to generate a screen...");
  const result = await generateText({
    model,
    tools,
    prompt: "Generate a screen for a modern analytics dashboard. Please provide the ID of the screen you generated.",
    maxSteps: 5,
  });

  console.log("\nAgent Response:");
  console.log(result.text);

  console.log("\nTool calls made by agent:");
  for (const step of result.steps) {
    for (const toolCall of step.toolCalls) {
       console.log(`- ${toolCall.toolName}`);
    }
  }
}

main().catch(console.error);
