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

const mockCallTool = vi.fn().mockResolvedValue({ success: true });

// Mock the singleton module to return a controllable client
vi.mock("../../src/singleton.js", () => ({
  getOrCreateClient: () => ({
    callTool: mockCallTool,
  }),
}));

/**
 * TDD Cycle 2: stitchTools() Adapter
 *
 * stitchTools() returns a Record of AI SDK-compatible tool definitions
 * sourced from generated tool-definitions.ts, with execute wired to callTool.
 */
describe("stitchTools()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a record keyed by tool name", async () => {
    const { stitchTools } = await import("../../src/tools-adapter.js");
    const tools = stitchTools();
    expect(typeof tools).toBe("object");
    expect(Object.keys(tools).length).toBeGreaterThan(0);
    expect(tools).toHaveProperty("create_project");
    expect(tools).toHaveProperty("generate_screen_from_text");
  });

  it("each tool has description, inputSchema, execute", async () => {
    const { stitchTools } = await import("../../src/tools-adapter.js");
    const tools = stitchTools();

    for (const [, def] of Object.entries(tools)) {
      const d = def as any;
      expect(typeof d.description).toBe("string");
      expect(d.inputSchema).toBeDefined();
      expect(typeof d.execute).toBe("function");
    }
  });

  it("execute() delegates to callTool", async () => {
    const { stitchTools } = await import("../../src/tools-adapter.js");
    const tools = stitchTools();
    const createProject = tools["create_project"] as any;

    await createProject.execute({ title: "Test Project" });

    expect(mockCallTool).toHaveBeenCalledWith("create_project", { title: "Test Project" });
  });

  it("include filter restricts returned tools", async () => {
    const { stitchTools } = await import("../../src/tools-adapter.js");
    const tools = stitchTools({ include: ["create_project", "list_projects"] });

    expect(Object.keys(tools)).toHaveLength(2);
    expect(tools).toHaveProperty("create_project");
    expect(tools).toHaveProperty("list_projects");
    expect(tools).not.toHaveProperty("generate_screen_from_text");
  });
});
