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

/**
 * Logic Tests for SDK Generation Expression Builders
 *
 * Tests the pure functions that emit TypeScript code from
 * structured projection steps and arg specs.
 */

import { describe, test, expect } from "bun:test";

// These imports will work once the functions are exported from generate-sdk.ts
import {
  emitProjection,
  emitCacheProjection,
  validateProjection,
  jsonSchemaToTs,
  emitNamedInterfaces,
  emitResponseType,
  generateArgsObject,
  generateParamType,
  resolveRef,
} from "../generate-sdk.js";

import type { ProjectionStep } from "../ir-schema.js";

// ── emitProjection ───────────────────────────────────────────

describe("emitProjection", () => {
  test("empty steps returns raw variable", () => {
    expect(emitProjection([])).toBe("raw");
  });

  test("empty steps with custom var returns that var", () => {
    expect(emitProjection([], "result")).toBe("result");
  });

  test("single prop → raw?.prop", () => {
    const steps: ProjectionStep[] = [{ prop: "projects" }];
    expect(emitProjection(steps)).toBe("raw?.projects");
  });

  test("prop with index → raw?.prop?.[0]", () => {
    const steps: ProjectionStep[] = [{ prop: "outputComponents", index: 0 }];
    expect(emitProjection(steps)).toBe("raw?.outputComponents?.[0]");
  });

  test("deep chain → raw?.a?.b?.c", () => {
    const steps: ProjectionStep[] = [
      { prop: "a" },
      { prop: "b" },
      { prop: "c" },
    ];
    expect(emitProjection(steps)).toBe("raw?.a?.b?.c");
  });

  test("deep chain with index → raw?.a?.[0]?.b?.c?.[1]", () => {
    const steps: ProjectionStep[] = [
      { prop: "a", index: 0 },
      { prop: "b" },
      { prop: "c", index: 1 },
    ];
    expect(emitProjection(steps)).toBe("raw?.a?.[0]?.b?.c?.[1]");
  });

  test("single each → flatMap pattern", () => {
    const steps: ProjectionStep[] = [
      { prop: "outputComponents", each: true },
      { prop: "design" },
      { prop: "screens", each: true },
    ];
    const result = emitProjection(steps);
    // Should use flatMap for each steps
    expect(result).toContain("flatMap");
    expect(result).toContain("outputComponents");
  });
});

// ── emitCacheProjection ──────────────────────────────────────

describe("emitCacheProjection", () => {
  test("single prop → this.data?.prop", () => {
    const steps: ProjectionStep[] = [{ prop: "htmlCode" }];
    expect(emitCacheProjection(steps)).toBe("this.data?.htmlCode");
  });

  test("deep path → this.data?.a?.b?.c", () => {
    const steps: ProjectionStep[] = [
      { prop: "screenshot" },
      { prop: "downloadUrl" },
    ];
    expect(emitCacheProjection(steps)).toBe(
      "this.data?.screenshot?.downloadUrl",
    );
  });

  test("empty steps → this.data", () => {
    expect(emitCacheProjection([])).toBe("this.data");
  });
});

// ── validateProjection ───────────────────────────────────────

describe("validateProjection", () => {
  const outputSchema = {
    type: "object",
    properties: {
      screens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
          },
        },
      },
      title: { type: "string" },
    },
  };

  test("valid path passes without throwing", () => {
    const steps: ProjectionStep[] = [{ prop: "screens" }];
    expect(() =>
      validateProjection(steps, outputSchema, "Test.method"),
    ).not.toThrow();
  });

  test("valid deep path passes", () => {
    const steps: ProjectionStep[] = [{ prop: "title" }];
    expect(() =>
      validateProjection(steps, outputSchema, "Test.method"),
    ).not.toThrow();
  });

  test("typo throws with available properties", () => {
    const steps: ProjectionStep[] = [{ prop: "screenz" }];
    expect(() =>
      validateProjection(steps, outputSchema, "Test.method"),
    ).toThrow(/screenz/);
    expect(() =>
      validateProjection(steps, outputSchema, "Test.method"),
    ).toThrow(/screens/);
  });

  test("null schema skips validation (no throw)", () => {
    const steps: ProjectionStep[] = [{ prop: "anything" }];
    expect(() => validateProjection(steps, null, "Test.method")).not.toThrow();
  });

  test("resolves $ref in schema", () => {
    const schemaWithRef = {
      type: "object",
      properties: {
        screen: { $ref: "#/$defs/Screen" },
      },
      $defs: {
        Screen: {
          type: "object",
          properties: {
            id: { type: "string" },
            htmlCode: { type: "string" },
          },
        },
      },
    };
    const steps: ProjectionStep[] = [{ prop: "screen" }, { prop: "htmlCode" }];
    expect(() =>
      validateProjection(steps, schemaWithRef, "Test.method"),
    ).not.toThrow();
  });

  test("$ref with invalid nested prop throws", () => {
    const schemaWithRef = {
      type: "object",
      properties: {
        screen: { $ref: "#/$defs/Screen" },
      },
      $defs: {
        Screen: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      },
    };
    const steps: ProjectionStep[] = [{ prop: "screen" }, { prop: "bogus" }];
    expect(() =>
      validateProjection(steps, schemaWithRef, "Test.method"),
    ).toThrow(/bogus/);
  });
});

// ── resolveRef ───────────────────────────────────────────────

describe("resolveRef", () => {
  test("resolves simple $defs path", () => {
    const schema = {
      $defs: {
        Foo: { type: "object", properties: { bar: { type: "string" } } },
      },
    };
    const result = resolveRef(schema, "#/$defs/Foo");
    expect(result).toBeDefined();
    expect(result!.type).toBe("object");
    expect(result!.properties!.bar.type).toBe("string");
  });

  test("returns undefined for missing ref", () => {
    const schema = { $defs: {} };
    const result = resolveRef(schema, "#/$defs/Missing");
    expect(result).toBeUndefined();
  });
});

// ── jsonSchemaToTs ───────────────────────────────────────────

describe("jsonSchemaToTs", () => {
  test("string enum → union type", () => {
    const result = jsonSchemaToTs({ enum: ["MOBILE", "DESKTOP", "TABLET"] });
    expect(result).toBe('"MOBILE" | "DESKTOP" | "TABLET"');
  });

  test("string type → string", () => {
    expect(jsonSchemaToTs({ type: "string" })).toBe("string");
  });

  test("integer type → number", () => {
    expect(jsonSchemaToTs({ type: "integer" })).toBe("number");
  });

  test("boolean type → boolean", () => {
    expect(jsonSchemaToTs({ type: "boolean" })).toBe("boolean");
  });

  test("array of strings → string[]", () => {
    expect(jsonSchemaToTs({ type: "array", items: { type: "string" } })).toBe(
      "string[]",
    );
  });

  test("null/missing prop → any", () => {
    expect(jsonSchemaToTs(null)).toBe("any");
    expect(jsonSchemaToTs(undefined)).toBe("any");
  });

  test("bare object type → Record<string, unknown>", () => {
    expect(jsonSchemaToTs({ type: "object" })).toBe("Record<string, unknown>");
  });

  test("object with properties → inline type literal", () => {
    const result = jsonSchemaToTs({
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "integer" },
      },
      required: ["name"],
    });
    expect(result).toBe("{ name: string; count?: number }");
  });

  test("$ref resolves to inline type via defs", () => {
    const defs = {
      Typography: {
        type: "object" as const,
        properties: {
          fontSize: { type: "string" as const },
          fontWeight: { type: "string" as const },
        },
      },
    };
    const result = jsonSchemaToTs({ $ref: "#/$defs/Typography" }, defs);
    expect(result).toBe("{ fontSize?: string; fontWeight?: string }");
  });

  test("object with additionalProperties → Record<string, T>", () => {
    const result = jsonSchemaToTs({
      type: "object",
      additionalProperties: { type: "string" },
    });
    expect(result).toBe("Record<string, string>");
  });

  test("object with additionalProperties $ref → Record<string, Resolved>", () => {
    const defs = {
      Typography: {
        type: "object" as const,
        properties: { fontSize: { type: "string" as const } },
      },
    };
    const result = jsonSchemaToTs(
      { type: "object", additionalProperties: { $ref: "#/$defs/Typography" } },
      defs,
    );
    expect(result).toBe("Record<string, { fontSize?: string }>");
  });

  test("$ref resolves to named type when in namedTypes map", () => {
    const namedTypes = new Map([["Typography", "Typography"]]);
    const result = jsonSchemaToTs(
      { $ref: "#/$defs/Typography" },
      {
        Typography: {
          type: "object" as const,
          properties: { fontSize: { type: "string" as const } },
        },
      },
      namedTypes,
    );
    expect(result).toBe("Typography");
  });
});

// ── emitNamedInterfaces ──────────────────────────────────────

describe("emitNamedInterfaces", () => {
  test("generates interfaces from $defs", () => {
    const defs = {
      Typography: {
        type: "object" as const,
        description: "A typography token.",
        properties: {
          fontSize: { type: "string" as const, description: "CSS font-size." },
          fontWeight: { type: "string" as const },
        },
      },
    };
    const namedTypes = new Map([["Typography", "Typography"]]);
    const result = emitNamedInterfaces(defs, namedTypes);
    expect(result).toContain("export interface Typography {");
    expect(result).toContain("fontSize?: string;");
    expect(result).toContain("fontWeight?: string;");
    expect(result).toContain("/** A typography token. */");
  });
});

// ── generateParamType ───────────────────────────────────────

describe("generateParamType", () => {
  test("uses named type for $ref", () => {
    const tool: any = {
      name: "apply_design_system",
      inputSchema: {
        properties: {
          selectedScreenInstances: {
            type: "array",
            items: { $ref: "#/$defs/SelectedScreenInstance" },
          },
        },
        $defs: {
          SelectedScreenInstance: {
            type: "object",
            properties: {
              id: { type: "string" },
              sourceScreen: { type: "string" },
            },
            required: ["id", "sourceScreen"],
          },
        },
      },
    };
    const namedTypes = new Map([
      ["SelectedScreenInstance", "SelectedScreenInstance"],
    ]);
    const args = { selectedScreenInstances: { from: "param" as const } };
    const result = generateParamType(tool, args as any, namedTypes);
    expect(result).toContain(
      "selectedScreenInstances: SelectedScreenInstance[]",
    );
  });
});

// ── emitResponseType ────────────────────────────────────────

describe("emitResponseType", () => {
  test("generates interface from outputSchema", () => {
    const tool: any = {
      name: "list_screens",
      outputSchema: {
        type: "object",
        properties: {
          screens: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                id: { type: "string" },
              },
            },
          },
        },
      },
    };
    const result = emitResponseType(tool, new Map());
    expect(result).toContain("export interface ListScreensResponse {");
    expect(result).toContain("screens?: { name?: string;\n  id?: string }[];");
  });
});

// ── generateArgsObject ──────────────────────────────────────

describe("generateArgsObject", () => {
  test("self arg → this.field", () => {
    const result = generateArgsObject({
      projectId: { from: "self" },
    });
    expect(result).toContain("projectId: this.projectId");
  });

  test("param arg → shorthand", () => {
    const result = generateArgsObject({
      prompt: { from: "param" },
    });
    expect(result).toContain("prompt");
  });

  test("param with rename → renamed arg", () => {
    const result = generateArgsObject({
      title: { from: "param", rename: "newTitle" },
    });
    expect(result).toContain("title: newTitle");
  });

  test("selfArray → wrapped array", () => {
    const result = generateArgsObject({
      selectedScreenIds: { from: "selfArray", field: "screenId" },
    });
    expect(result).toContain("selectedScreenIds: [this.screenId]");
  });

  test("computed → template literal", () => {
    const result = generateArgsObject({
      name: { from: "computed", template: "projects/{projectId}" },
    });
    expect(result).toContain("name:");
    expect(result).toContain("projects/");
  });

  test("mixed args", () => {
    const result = generateArgsObject({
      projectId: { from: "self" },
      prompt: { from: "param" },
    });
    expect(result).toContain("projectId: this.projectId");
    expect(result).toContain("prompt");
  });
});
