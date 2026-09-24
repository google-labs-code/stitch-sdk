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

/** Adapter guards [V1_PLAN §3.6]: include validation + real ai primitives. */

import { describe, it, expect, vi } from "vitest";
import { stitchTools, validateIncludeFilter } from "../../src/tools-adapter.js";

describe("stitchTools (Vercel AI SDK adapter)", () => {
  it("throws on unknown include names instead of silently dropping them", () => {
    expect(() =>
      validateIncludeFilter(["create_project", "nope_tool"]),
    ).toThrow(/nope_tool/);
    expect(() =>
      stitchTools({ apiKey: "k", include: ["definitely_not_a_tool"] }),
    ).toThrow(/Available tools/);
  });

  it("produces tools via the REAL ai dynamicTool/jsonSchema primitives", () => {
    vi.stubEnv("STITCH_API_KEY", "test-key");
    const tools = stitchTools({ include: ["create_project"] });
    const t: any = tools["create_project"];
    expect(t).toBeDefined();
    expect(t.type).toBe("dynamic");
    // jsonSchema() wraps the schema with a jsonSchema property — produced
    // by the ai package itself, not a forged symbol object
    expect(t.inputSchema.jsonSchema ?? t.inputSchema).toBeTruthy();
    expect(typeof t.execute).toBe("function");
    vi.unstubAllEnvs();
  });
});

describe("stitchAdkTools include validation", () => {
  it("throws on unknown include names", async () => {
    const { stitchAdkTools } = await import("../../src/adk-adapter.js");
    expect(() =>
      stitchAdkTools({ apiKey: "k", include: ["bogus_tool"] }),
    ).toThrow(/bogus_tool/);
  });
});
