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
import { FunctionTool } from "@google/adk";

const mockCallTool = vi.fn().mockResolvedValue({ success: true });

// Mock the singleton module to return a controllable client
vi.mock("../../src/singleton.js", () => ({
  getOrCreateClient: () => ({
    callTool: mockCallTool,
  }),
}));

describe("stitchAdkTools()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an array of FunctionTool objects", async () => {
    const { stitchAdkTools } = await import("../../src/adk-adapter.js");
    const tools = stitchAdkTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0]).toBeInstanceOf(FunctionTool);
  });

  it("include filter restricts returned tools", async () => {
    const { stitchAdkTools } = await import("../../src/adk-adapter.js");
    const tools = stitchAdkTools({
      include: ["create_project", "list_projects"],
    });

    expect(tools).toHaveLength(2);
    // FunctionTool encapsulates name logic, typically exposed directly or via declarations.
    // For test simplicity, we check the length and raw definition matching
    const toolNames = tools.map((t: any) => (t as any).name);
    expect(toolNames).toContain("create_project");
    expect(toolNames).toContain("list_projects");
  });

  it("runAsync() delegates to callTool via executing FunctionTool", async () => {
    const { stitchAdkTools } = await import("../../src/adk-adapter.js");
    const tools = stitchAdkTools();

    // Find create_project
    const createProject = tools.find((t: any) => t.name === "create_project");
    expect(createProject).toBeDefined();

    // Call runAsync to trigger the internally wrapped execute function
    await createProject!.runAsync({
      name: "create_project",
      args: { title: "Test Project" },
    } as any);

    expect(mockCallTool).toHaveBeenCalledWith("create_project", {
      title: "Test Project",
    });
  });
});
