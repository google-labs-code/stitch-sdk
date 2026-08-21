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
import {
  repairSchema,
  repairToolSchemas,
  collectDefPool,
} from "../../src/schema-repair.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

describe("repairSchema", () => {
  it("should inject ScreenInstance $def when referenced but missing", () => {
    const schema: Record<string, any> = {
      type: "object",
      properties: {
        screens: {
          type: "array",
          items: { $ref: "#/$defs/ScreenInstance" },
        },
      },
    };

    repairSchema(schema);

    expect(schema.$defs).toBeDefined();
    expect(schema.$defs.ScreenInstance).toBeDefined();
    expect(schema.$defs.ScreenInstance.type).toBe("object");
    expect(schema.$defs.ScreenInstance.properties.id).toEqual({
      type: "string",
    });
  });

  it("should inject File $def when referenced but missing", () => {
    const schema: Record<string, any> = {
      type: "object",
      properties: {
        attachment: { $ref: "#/$defs/File" },
      },
    };

    repairSchema(schema);

    expect(schema.$defs.File).toBeDefined();
    expect(schema.$defs.File.properties.mimeType).toEqual({ type: "string" });
  });

  it("should inject SelectedScreenInstance $def when referenced but missing", () => {
    const schema: Record<string, any> = {
      type: "object",
      properties: {
        selected: {
          type: "array",
          items: { $ref: "#/$defs/SelectedScreenInstance" },
        },
      },
    };

    repairSchema(schema);

    expect(schema.$defs.SelectedScreenInstance).toBeDefined();
    expect(schema.$defs.SelectedScreenInstance.properties.id).toEqual({
      type: "string",
    });
    expect(schema.$defs.SelectedScreenInstance.required).toEqual([
      "id",
      "sourceScreen",
    ]);
  });

  it("should NOT overwrite existing $defs", () => {
    const customDef = {
      type: "object",
      properties: { customField: { type: "string" } },
    };
    const schema: Record<string, any> = {
      type: "object",
      $defs: { ScreenInstance: customDef },
      properties: {
        screens: {
          type: "array",
          items: { $ref: "#/$defs/ScreenInstance" },
        },
      },
    };

    repairSchema(schema);

    // Original def should be preserved
    expect(schema.$defs.ScreenInstance).toBe(customDef);
  });

  it("should handle schemas with no $refs gracefully", () => {
    const schema: Record<string, any> = {
      type: "object",
      properties: {
        name: { type: "string" },
      },
    };

    repairSchema(schema);

    // No $defs should be injected since nothing is referenced
    expect(schema.$defs).toBeUndefined();
  });

  it("should handle unknown $ref targets gracefully", () => {
    const schema: Record<string, any> = {
      type: "object",
      properties: {
        widget: { $ref: "#/$defs/UnknownType" },
      },
    };

    repairSchema(schema);

    // Should create $defs block but not inject an unknown definition
    expect(schema.$defs).toBeDefined();
    expect(schema.$defs.UnknownType).toBeUndefined();
  });

  it("should handle deeply nested $refs", () => {
    const schema: Record<string, any> = {
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: {
            deep: {
              type: "object",
              properties: {
                screens: {
                  type: "array",
                  items: { $ref: "#/$defs/ScreenInstance" },
                },
              },
            },
          },
        },
      },
    };

    repairSchema(schema);

    expect(schema.$defs.ScreenInstance).toBeDefined();
  });

  it("should handle multiple missing $refs in one schema", () => {
    const schema: Record<string, any> = {
      type: "object",
      properties: {
        screens: {
          type: "array",
          items: { $ref: "#/$defs/ScreenInstance" },
        },
        attachment: { $ref: "#/$defs/File" },
      },
    };

    repairSchema(schema);

    expect(schema.$defs.ScreenInstance).toBeDefined();
    expect(schema.$defs.File).toBeDefined();
  });

  it("should handle null/undefined input gracefully", () => {
    expect(repairSchema(null as any)).toBeNull();
    expect(repairSchema(undefined as any)).toBeUndefined();
  });
});

describe("repairToolSchemas", () => {
  it("should repair inputSchema of each tool", () => {
    const tools: Tool[] = [
      {
        name: "edit_screens",
        description: "Edit screens",
        inputSchema: {
          type: "object" as const,
          properties: {
            screens: {
              type: "array",
              items: { $ref: "#/$defs/ScreenInstance" },
            },
          },
        },
      },
    ];

    repairToolSchemas(tools);

    const schema = tools[0].inputSchema as any;
    expect(schema.$defs.ScreenInstance).toBeDefined();
  });

  it("should repair outputSchema of each tool", () => {
    const tools: any[] = [
      {
        name: "list_screens",
        description: "List screens",
        inputSchema: { type: "object", properties: {} },
        outputSchema: {
          type: "object",
          properties: {
            screens: {
              type: "array",
              items: { $ref: "#/$defs/ScreenInstance" },
            },
          },
        },
      },
    ];

    repairToolSchemas(tools);

    expect(tools[0].outputSchema.$defs.ScreenInstance).toBeDefined();
  });

  it("should handle tools with no schemas gracefully", () => {
    const tools: Tool[] = [
      {
        name: "simple_tool",
        description: "No schema",
        inputSchema: { type: "object" as const },
      },
    ];

    // Should not throw
    expect(() => repairToolSchemas(tools)).not.toThrow();
  });

  it("should handle empty tools array", () => {
    expect(() => repairToolSchemas([])).not.toThrow();
  });
});

/** Collect every local `#/$defs/<Name>` ref in a schema. */
function collectLocalRefs(node: any, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const v of node) collectLocalRefs(v, out);
    return out;
  }
  if (typeof node.$ref === "string" && node.$ref.startsWith("#/$defs/")) {
    out.push(node.$ref.slice("#/$defs/".length));
  }
  for (const v of Object.values(node)) collectLocalRefs(v, out);
  return out;
}

/** Assert every local $ref in the schema resolves against its own $defs. */
function expectAllRefsResolve(schema: any) {
  const defs = schema.$defs || {};
  const refs = collectLocalRefs(schema);
  expect(refs.length).toBeGreaterThan(0);
  for (const ref of refs) {
    expect(defs, `expected $defs.${ref} to be present`).toHaveProperty(ref);
  }
}

describe("collectDefPool", () => {
  it("should harvest $defs from both inputSchema and outputSchema", () => {
    const tools: any[] = [
      {
        name: "a",
        inputSchema: {
          type: "object",
          $defs: { FromInput: { type: "object" } },
        },
        outputSchema: {
          type: "object",
          $defs: { FromOutput: { type: "object" } },
        },
      },
    ];

    const pool = collectDefPool(tools);

    expect(pool.FromInput).toBeDefined();
    expect(pool.FromOutput).toBeDefined();
  });

  it("should keep the first definition seen for a name", () => {
    const first = {
      type: "object",
      properties: { first: { type: "boolean" } },
    };
    const second = {
      type: "object",
      properties: { second: { type: "boolean" } },
    };
    const tools: any[] = [
      { name: "a", inputSchema: { type: "object", $defs: { Dup: first } } },
      { name: "b", inputSchema: { type: "object", $defs: { Dup: second } } },
    ];

    const pool = collectDefPool(tools);

    expect(pool.Dup).toBe(first);
  });

  it("should ignore tools and schemas without $defs", () => {
    const tools: any[] = [
      { name: "a", inputSchema: { type: "object" } },
      { name: "b", inputSchema: { type: "object", $defs: null } },
    ];

    expect(collectDefPool(tools)).toEqual({});
  });
});

describe("pool-based repair", () => {
  it("should prefer the backend's real definition over the fallback stub", () => {
    const backendScreenInstance = {
      type: "object",
      properties: { backendOnlyMarker: { type: "boolean" } },
    };
    const tools: any[] = [
      {
        name: "list_projects",
        inputSchema: { type: "object" },
        outputSchema: {
          type: "object",
          $defs: { ScreenInstance: backendScreenInstance },
        },
      },
      {
        name: "upload_design_md",
        inputSchema: { type: "object" },
        outputSchema: {
          type: "object",
          properties: {
            variantScreenInstance: { $ref: "#/$defs/ScreenInstance" },
          },
        },
      },
    ];

    repairToolSchemas(tools);

    const repaired = tools[1].outputSchema.$defs.ScreenInstance;
    expect(repaired.properties.backendOnlyMarker).toBeDefined();
    // Injected defs must be deep copies, not shared references
    expect(repaired).not.toBe(backendScreenInstance);
  });

  it("should resolve transitive refs introduced by injected defs (File -> UserFeedback)", () => {
    const backendFile = {
      type: "object",
      properties: {
        name: { type: "string" },
        userFeedback: { $ref: "#/$defs/UserFeedback" },
      },
    };
    const backendUserFeedback = {
      type: "object",
      properties: { rating: { type: "string" } },
    };
    const tools: any[] = [
      {
        name: "get_file",
        inputSchema: { type: "object" },
        outputSchema: {
          type: "object",
          $defs: { File: backendFile, UserFeedback: backendUserFeedback },
        },
      },
      {
        name: "upload_thing",
        inputSchema: { type: "object" },
        outputSchema: {
          type: "object",
          properties: { file: { $ref: "#/$defs/File" } },
        },
      },
    ];

    repairToolSchemas(tools);

    expectAllRefsResolve(tools[1].outputSchema);
    expect(tools[1].outputSchema.$defs.UserFeedback).toBeDefined();
  });

  it("should fall back to well-known stubs when the pool lacks a definition", () => {
    const tools: any[] = [
      {
        name: "lonely_tool",
        inputSchema: { type: "object" },
        outputSchema: {
          type: "object",
          properties: {
            screens: {
              type: "array",
              items: { $ref: "#/$defs/ScreenInstance" },
            },
          },
        },
      },
    ];

    repairToolSchemas(tools);

    expectAllRefsResolve(tools[0].outputSchema);
    expect(
      tools[0].outputSchema.$defs.ScreenInstance.properties.id,
    ).toBeDefined();
  });

  it("should not overwrite a def already present in the target schema", () => {
    const own = { type: "object", properties: { own: { type: "boolean" } } };
    const fromPool = {
      type: "object",
      properties: { pooled: { type: "boolean" } },
    };
    const tools: any[] = [
      {
        name: "definer",
        inputSchema: { type: "object", $defs: { ScreenInstance: fromPool } },
      },
      {
        name: "consumer",
        inputSchema: { type: "object" },
        outputSchema: {
          type: "object",
          $defs: { ScreenInstance: own },
          properties: {
            variantScreenInstance: { $ref: "#/$defs/ScreenInstance" },
          },
        },
      },
    ];

    repairToolSchemas(tools);

    expect(tools[1].outputSchema.$defs.ScreenInstance).toBe(own);
  });

  it("should repair the real upload_design_md shape so every $ref resolves", () => {
    // Regression test for https://github.com/google-labs-code/stitch-sdk/issues/367
    // The live backend emits upload_design_md's outputSchema as an inlined
    // ScreenInstance object that retains a $ref to "#/$defs/ScreenInstance"
    // but ships no $defs block of its own.
    const recursiveScreenInstance = {
      type: "object",
      description: "An instance of a screen on the project.",
      properties: {
        id: { type: "string" },
        type: { type: "string", enum: ["SCREEN_INSTANCE", "TEXT_INSTANCE"] },
        variantScreenInstance: { $ref: "#/$defs/ScreenInstance" },
      },
    };
    const tools: any[] = [
      {
        name: "create_project",
        inputSchema: { type: "object" },
        outputSchema: {
          type: "object",
          $defs: { ScreenInstance: recursiveScreenInstance },
          properties: {
            screenInstances: {
              type: "array",
              items: { $ref: "#/$defs/ScreenInstance" },
            },
          },
        },
      },
      {
        name: "upload_design_md",
        inputSchema: { type: "object" },
        outputSchema: {
          type: "object",
          description: "An instance of a screen on the project.",
          properties: {
            id: { type: "string" },
            variantScreenInstance: { $ref: "#/$defs/ScreenInstance" },
          },
          // NOTE: no $defs — the dangling reference that crashed clients
        },
      },
    ];

    repairToolSchemas(tools);

    expectAllRefsResolve(tools[0].outputSchema);
    expectAllRefsResolve(tools[1].outputSchema);
    // The recursive def must survive injection intact
    expect(
      tools[1].outputSchema.$defs.ScreenInstance.properties
        .variantScreenInstance.$ref,
    ).toBe("#/$defs/ScreenInstance");
  });
});
