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

import { describe, it, expect } from "vitest";
import { toolDefinitions, type ToolDefinition } from "../../generated/src/tool-definitions.js";

/**
 * TDD Cycle 4: Generated Tool Definitions Shape
 *
 * Verifies the generated toolDefinitions array has the correct structure,
 * matches expected tool names, and each definition has the required fields.
 * These tests guard against pipeline regressions.
 */
describe("Generated toolDefinitions", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(toolDefinitions)).toBe(true);
    expect(toolDefinitions.length).toBeGreaterThan(0);
  });

  it("contains all expected MCP tools", () => {
    const names = toolDefinitions.map(t => t.name);
    expect(names).toContain("create_project");
    expect(names).toContain("get_project");
    expect(names).toContain("list_projects");
    expect(names).toContain("list_screens");
    expect(names).toContain("get_screen");
    expect(names).toContain("generate_screen_from_text");
    expect(names).toContain("edit_screens");
    expect(names).toContain("generate_variants");
    expect(names).toHaveLength(8);
  });

  it("each definition has name, description, and inputSchema", () => {
    for (const def of toolDefinitions) {
      expect(typeof def.name).toBe("string");
      expect(def.name.length).toBeGreaterThan(0);

      expect(typeof def.description).toBe("string");
      expect(def.description.length).toBeGreaterThan(0);

      expect(typeof def.inputSchema).toBe("object");
      expect(def.inputSchema).not.toBeNull();
    }
  });

  it("inputSchema is valid JSON Schema with type:object", () => {
    for (const def of toolDefinitions) {
      expect(def.inputSchema).toHaveProperty("type", "object");
      expect(def.inputSchema).toHaveProperty("properties");
    }
  });

  it("ToolDefinition type matches the shape", () => {
    // TypeScript structural check — if this compiles, the type is correct
    const def: ToolDefinition = toolDefinitions[0];
    const _name: string = def.name;
    const _desc: string = def.description;
    const _schema: Record<string, unknown> = def.inputSchema;
    expect(_name).toBeDefined();
    expect(_desc).toBeDefined();
    expect(_schema).toBeDefined();
  });
});
