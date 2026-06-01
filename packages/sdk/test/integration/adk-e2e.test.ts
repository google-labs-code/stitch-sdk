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

import path from "node:path";
import { describe, it, expect } from "vitest";
import { stitchAdkTools } from "../../src/adk.js";
import { validateComponent } from "../helpers/component-validator.js";
import {
  extractStitchAssets,
  parseGeneratedFiles,
  writePreviewApp,
} from "../helpers/stitch-html.js";

const hasEnv =
  !!(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY) &&
  !!(process.env.STITCH_ACCESS_TOKEN || process.env.STITCH_API_KEY);

const runIfConfigured = hasEnv ? describe : describe.skip;

runIfConfigured("ADK SDK E2E with Gemini", () => {
  it("creates a project via stitchAdkTools()", async () => {
    // Dynamically importing ADK to prevent disruption if it's strictly excluded in CI environments without legacy-peer-deps
    const { LlmAgent, InMemoryRunner, EventType } = await import("@google/adk");

    const tools = stitchAdkTools();

    const agent = new LlmAgent({
      name: "Stitch_E2E_Agent",
      model: "gemini-2.5-flash",
      instruction:
        "You are an agent. Your task is to Create a new Stitch project titled 'E2E Test Project'. Only use the tools provided. Finish your response when done.",
      tools,
    });

    const runner = new InMemoryRunner({ agent });
    const generator = runner.runEphemeral({
      userId: "test",
      newMessage: {
        role: "user",
        parts: [
          {
            text: "Please create a new Stitch project titled 'E2E Test Project'.",
          },
        ],
      },
    });

    let receivedToolCall = false;

    for await (const event of generator) {
      if (
        event.content?.parts?.some(
          (p: any) => p.functionCall || p.functionResponse,
        )
      ) {
        receivedToolCall = true;
      }
    }

    expect(receivedToolCall).toBe(true);
  }, 30000);

  it("design → React component → preview app", async () => {
    const { LlmAgent, InMemoryRunner } = await import("@google/adk");
    const tools = stitchAdkTools();

    // ── Phase 1: Get a design from Stitch ────────────────────────────
    console.log("\n🎨 Phase 1: Getting design from Stitch...");
    const agent = new LlmAgent({
      name: "Stitch_Designer",
      model: "gemini-2.5-pro",
      instruction: `Create a new Stitch project, generate a screen with a modern dashboard card (stat number, label, trend indicator, sparkline chart), and then retrieve the screen details including the HTML. Call the tools you need. Finish when done.`,
      tools,
    });

    const runner = new InMemoryRunner({ agent });
    const getDesignGenerator = runner.runEphemeral({
      userId: "testId1",
      newMessage: {
        role: "user",
        parts: [{ text: "Start" }],
      },
    });

    let screenOutput: any;
    for await (const event of getDesignGenerator) {
      const parts = event.content?.parts || [];
      for (const part of parts) {
        if ((part as any).functionResponse) {
          const resp = (part as any).functionResponse.response;
          if (resp?.htmlCode?.downloadUrl) {
            screenOutput = resp;
          }
        } else if (
          (part as any).functionCall &&
          (part as any).functionCall.name === "get_screen"
        ) {
          // Let's also collect it if it happens to be somehow exposed without functionResponse
        }
      }
    }

    // In ADK, extracting tool execution results accurately from the stream can be tricky
    // if the model didn't perfectly yield the response in `functionResponse`.
    // But since the tool runs on the client runner, the response will be in the stream.
    expect(screenOutput).toBeDefined();

    const htmlContent = await fetch(screenOutput.htmlCode.downloadUrl).then(
      (r) => r.text(),
    );
    const { tailwindConfig, fontLinks } = extractStitchAssets(htmlContent);
    console.log(
      `   HTML: ${htmlContent.length} chars | config: ${tailwindConfig ? "✅" : "❌"} | fonts: ${fontLinks.length}`,
    );

    // ── Phase 2: LLM generates a complete React app ──────────────────
    console.log("⚛️  Phase 2: Generating React app...");
    const codegenAgent = new LlmAgent({
      name: "React_Generator",
      model: "gemini-2.5-pro",
      instruction: `You are converting a Stitch design into a complete, runnable Vite + React + TypeScript app.

Output each file using this exact format:
--- FILE: <filename> ---
<file contents>

Generate these files:
- mockData.ts — all static text/numbers extracted from the HTML
- One or more component .tsx files — modular, each with a *Props interface
- App.tsx — imports components and data, passes data as props
- index.css — Tailwind v4 CSS using @import "tailwindcss"; and a @theme block from the config below
- index.html — includes the Google Font links listed below
- vite.config.ts — uses @vitejs/plugin-react and @tailwindcss/vite
- package.json — deps: react ^19, react-dom ^19; devDeps: vite ^6, @vitejs/plugin-react ^4, tailwindcss ^4, @tailwindcss/vite ^4
- main.tsx — React 19 entry point

Rules:
- Every component has a TypeScript *Props interface with readonly properties
- Use Tailwind classes only, no hardcoded hex in className
- Each component file has a default export
- Output ONLY code with FILE markers, no markdown fences, no commentary`,
    });

    const codegenRunner = new InMemoryRunner({ agent: codegenAgent });
    const codegenGenerator = codegenRunner.runEphemeral({
      userId: "testId2",
      newMessage: {
        role: "user",
        parts: [
          {
            text: `
${tailwindConfig ? `TAILWIND CONFIG (from the design):\n${tailwindConfig}\n` : ""}
${fontLinks.length > 0 ? `GOOGLE FONT LINKS (include in index.html <head>):\n${fontLinks.join("\n")}\n` : ""}
HTML DESIGN:
${htmlContent}`,
          },
        ],
      },
    });

    let generatedText = "";
    for await (const event of codegenGenerator) {
      if (event.content && event.author === "React_Generator") {
        for (const part of event.content.parts || []) {
          if ((part as any).text) {
            generatedText += (part as any).text;
          }
        }
      }
    }

    const files = parseGeneratedFiles(generatedText);
    console.log(
      `   Generated ${Object.keys(files).length} files: ${Object.keys(files).join(", ")}`,
    );
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(4);

    // ── Phase 3: Validate components via SWC ─────────────────────────
    console.log("🔍 Phase 3: Validating components...");
    const componentFiles = Object.entries(files).filter(
      ([name]) =>
        name.endsWith(".tsx") &&
        !name.endsWith("App.tsx") &&
        !name.endsWith("main.tsx"),
    );
    for (const [filename, content] of componentFiles) {
      const v = await validateComponent(content);
      const status = v.parseError ? "💥" : v.valid ? "✅" : "⚠️";
      console.log(
        `   ${filename}: ${status}${v.hardcodedHexValues.length ? " hex:" + v.hardcodedHexValues : ""}`,
      );
      expect(v.parseError).toBeUndefined();
      expect(v.hasDefaultExport).toBe(true);
      if (!v.hasPropsInterface)
        console.warn(`   ⚠️  ${filename} missing Props interface`);
    }

    // ── Phase 4: Write preview app ───────────────────────────────────
    const previewDir = path.resolve(process.cwd(), "../../.stitch/preview");
    writePreviewApp(files, previewDir);
    console.log(`\n✅ cd .stitch/preview && npm install && npm run dev`);
  }, 300000);
});
