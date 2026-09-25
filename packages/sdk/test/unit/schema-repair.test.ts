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
    expect(schema.$defs.SelectedScreenInstance.properties.screenId).toEqual({
      type: "string",
    });
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

  it("should share $defs across sibling tools and resolve transitive $refs (PR #368)", () => {
    const tools: any[] = [
      {
        name: "create_design_system",
        description: "Defines DesignTheme and ColorPalette in $defs",
        inputSchema: {
          type: "object",
          $defs: {
            DesignTheme: {
              type: "object",
              properties: {
                palette: { $ref: "#/$defs/ColorPalette" },
              },
            },
            ColorPalette: {
              type: "object",
              properties: {
                primary: { type: "string" },
              },
            },
          },
          properties: {
            theme: { $ref: "#/$defs/DesignTheme" },
          },
        },
      },
      {
        name: "update_design_system",
        description:
          "References DesignTheme without defining it or ColorPalette",
        inputSchema: {
          type: "object",
          properties: {
            theme: { $ref: "#/$defs/DesignTheme" },
          },
        },
      },
    ];

    const pool = collectDefPool(tools);
    expect(pool.DesignTheme).toBeDefined();
    expect(pool.ColorPalette).toBeDefined();

    repairToolSchemas(tools);

    const repairedDefs = tools[1].inputSchema.$defs;
    expect(repairedDefs.DesignTheme).toBeDefined();
    // Transitive dependency referenced inside DesignTheme must also be injected
    expect(repairedDefs.ColorPalette).toBeDefined();
    expect(repairedDefs.ColorPalette.properties.primary).toEqual({
      type: "string",
    });
  });

  it("should preserve legacy 0.3.5 modelId enum values alongside 0.4.0 values", () => {
    const schema: Record<string, any> = {
      type: "object",
      properties: {
        modelId: {
          type: "string",
          enum: [
            "MODEL_ID_UNSPECIFIED",
            "GEMINI_3_8_FLASH",
            "GEMINI_3_5_FLASH_LITE",
          ],
        },
      },
    };

    repairSchema(schema);

    expect(schema.properties.modelId.enum).toEqual([
      "MODEL_ID_UNSPECIFIED",
      "GEMINI_3_8_FLASH",
      "GEMINI_3_5_FLASH_LITE",
      "GEMINI_3_PRO",
      "GEMINI_3_FLASH",
      "GEMINI_3_1_PRO",
    ]);
  });
});
