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
import { generateText, stepCountIs } from "ai";
import { stitchTools } from "../../src/tools-adapter.js";
import { createGeminiModel } from "../helpers/model-helpers.js";
import { validateComponent } from "../helpers/component-validator.js";
import { extractStitchAssets, parseGeneratedFiles, writePreviewApp } from "../helpers/stitch-html.js";

const hasEnv =
  !!(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY) &&
  !!(process.env.STITCH_ACCESS_TOKEN || process.env.STITCH_API_KEY);

const runIfConfigured = hasEnv ? describe : describe.skip;

runIfConfigured("AI SDK E2E with Gemini", () => {
  it("creates a project via stitchTools()", async () => {
    const tools = stitchTools();
    const model = await createGeminiModel();
    const result = await generateText({
      model,
      tools,
      prompt: 'Create a new Stitch project titled "E2E Test Project".',
      stopWhen: stepCountIs(3),
    });
    const toolCalls = result.steps.flatMap(s => s.toolCalls);
    expect(toolCalls.length).toBeGreaterThan(0);
  }, 30000);

  it("design → React component → preview app", async () => {
    const tools = stitchTools();
    const model = await createGeminiModel();

    // ── Phase 1: Get a design from Stitch ────────────────────────────
    console.log("\n🎨 Phase 1: Getting design from Stitch...");
    const designResult = await generateText({
      model,
      tools,
      prompt: `Create a new Stitch project, generate a screen with a modern dashboard card
(stat number, label, trend indicator, sparkline chart), and then retrieve the
screen details including the HTML. Call the tools you need.`,
      stopWhen: stepCountIs(8),
    });

    const allResults = designResult.steps.flatMap(s => s.toolResults);
    const screenOutput = allResults
      .map((tr: any) => tr.output)
      .find((o: any) => o?.htmlCode?.downloadUrl);
    expect(screenOutput).toBeDefined();

    const htmlContent = await fetch(screenOutput.htmlCode.downloadUrl).then(r => r.text());
    const { tailwindConfig, fontLinks } = extractStitchAssets(htmlContent);
    console.log(`   HTML: ${htmlContent.length} chars | config: ${tailwindConfig ? "✅" : "❌"} | fonts: ${fontLinks.length}`);

    // ── Phase 2: LLM generates a complete React app ──────────────────
    console.log("⚛️  Phase 2: Generating React app...");
    const codegenResult = await generateText({
      model,
      prompt: `You are converting a Stitch design into a complete, runnable Vite + React + TypeScript app.

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
- Output ONLY code with FILE markers, no markdown fences, no commentary

${tailwindConfig ? `TAILWIND CONFIG (from the design):\n${tailwindConfig}\n` : ""}
${fontLinks.length > 0 ? `GOOGLE FONT LINKS (include in index.html <head>):\n${fontLinks.join("\n")}\n` : ""}
HTML DESIGN:
${htmlContent}`,
    });

    const files = parseGeneratedFiles(codegenResult.text);
    console.log(`   Generated ${Object.keys(files).length} files: ${Object.keys(files).join(", ")}`);
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(4);

    // ── Phase 3: Validate components via SWC ─────────────────────────
    console.log("🔍 Phase 3: Validating components...");
    const componentFiles = Object.entries(files).filter(
      ([name]) => name.endsWith(".tsx") && !["App.tsx", "main.tsx"].includes(name),
    );
    for (const [filename, content] of componentFiles) {
      const v = await validateComponent(content);
      const status = v.parseError ? "💥" : v.valid ? "✅" : "⚠️";
      console.log(`   ${filename}: ${status}${v.hardcodedHexValues.length ? " hex:" + v.hardcodedHexValues : ""}`);
      expect(v.parseError).toBeUndefined();
      expect(v.hasDefaultExport).toBe(true);
      if (!v.hasPropsInterface) console.warn(`   ⚠️  ${filename} missing Props interface`);
    }

    // ── Phase 4: Write preview app ───────────────────────────────────
    const previewDir = path.resolve(process.cwd(), "../../.stitch/preview");
    writePreviewApp(files, previewDir);
    console.log(`\n✅ cd .stitch/preview && npm install && npm run dev`);
  }, 180000);
});
