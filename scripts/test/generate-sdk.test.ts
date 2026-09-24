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
  generateMethodParams,
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
    expect(emitCacheProjection(steps)).toBe("(this.data as any)?.htmlCode");
  });

  test("deep path → this.data?.a?.b?.c", () => {
    const steps: ProjectionStep[] = [
      { prop: "screenshot" },
      { prop: "downloadUrl" },
    ];
    expect(emitCacheProjection(steps)).toBe(
      "(this.data as any)?.screenshot?.downloadUrl",
    );
  });

  test("empty steps → this.data", () => {
    expect(emitCacheProjection([])).toBe("(this.data as any)");
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

// ── generateMethodParams ─────────────────────────────────────

describe("generateMethodParams", () => {
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
    const result = generateMethodParams(tool, args as any, namedTypes);
    expect(result).toEqual([
      {
        name: "selectedScreenInstances",
        type: "SelectedScreenInstance[]",
        hasQuestionToken: false,
      },
    ]);
  });

  test("required params stay positional, optional params fold into polymorphic options parameter", () => {
    const tool: any = {
      name: "generate_screen_from_text",
      inputSchema: {
        properties: {
          prompt: { type: "string" },
          deviceType: { enum: ["MOBILE", "DESKTOP"] },
          modelId: { type: "string" },
        },
      },
    };
    const args = {
      projectId: { from: "self" as const },
      prompt: { from: "param" as const },
      deviceType: { from: "param" as const, optional: true },
      modelId: { from: "param" as const, optional: true },
    };
    const result = generateMethodParams(tool, args as any);
    expect(result).toEqual([
      { name: "prompt", type: "string", hasQuestionToken: false },
      {
        name: "deviceTypeOrOptions",
        type: '"MOBILE" | "DESKTOP" | { deviceType?: "MOBILE" | "DESKTOP"; modelId?: string }',
        hasQuestionToken: true,
      },
      {
        name: "modelId",
        type: "string",
        hasQuestionToken: true,
      },
    ]);
  });

  test("no optional params → no options object", () => {
    const tool: any = {
      name: "get_screen",
      inputSchema: { properties: { screenId: { type: "string" } } },
    };
    const args = { screenId: { from: "param" as const } };
    const result = generateMethodParams(tool, args as any);
    expect(result).toEqual([
      { name: "screenId", type: "string", hasQuestionToken: false },
    ]);
  });

  test("only optional params → polymorphic options param", () => {
    const tool: any = {
      name: "create_project",
      inputSchema: { properties: { title: { type: "string" } } },
    };
    const args = { title: { from: "param" as const, optional: true } };
    const result = generateMethodParams(tool, args as any);
    expect(result).toEqual([
      {
        name: "titleOrOptions",
        type: "string | { title?: string }",
        hasQuestionToken: true,
      },
    ]);
  });

  test("rename applies inside the options object", () => {
    const tool: any = {
      name: "x",
      inputSchema: { properties: { device_type: { type: "string" } } },
    };
    const args = {
      device_type: {
        from: "param" as const,
        optional: true,
        rename: "deviceType",
      },
    };
    const result = generateMethodParams(tool, args as any);
    expect(result[0].name).toBe("deviceTypeOrOptions");
    expect(result[0].type).toBe("string | { deviceType?: string }");
  });

  test("required param named 'options' alongside optional params throws", () => {
    const tool: any = {
      name: "x",
      inputSchema: {
        properties: {
          options: { type: "string" },
          extra: { type: "string" },
        },
      },
    };
    const args = {
      options: { from: "param" as const },
      extra: { from: "param" as const, optional: true },
    };
    expect(() =>
      generateMethodParams(tool, args as any, undefined, "Test.method"),
    ).toThrow(/collides/);
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

  test("optional param → routed through options object (D12)", () => {
    const result = generateArgsObject({
      deviceType: { from: "param", optional: true },
    });
    expect(result).toContain("deviceType: options?.deviceType");
  });

  test("optional param with rename → options?.renamed", () => {
    const result = generateArgsObject({
      device_type: { from: "param", optional: true, rename: "deviceType" },
    });
    expect(result).toContain("device_type: options?.deviceType");
  });

  test("computed template referencing an optional param → options?.x interpolation", () => {
    const result = generateArgsObject({
      revision: { from: "param", optional: true },
      name: {
        from: "computed",
        template: "projects/{projectId}/rev/{revision}",
      },
    });
    expect(result).toContain("${options?.revision}");
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

// ── validateProjection: strict array semantics + lint [V1_PLAN §1.2] ──

describe("validateProjection strict semantics", () => {
  const schema = {
    type: "object",
    properties: {
      title: { type: "string" },
      screens: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" } },
        },
      },
      comps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            design: {
              type: "object",
              properties: {
                widgets: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { id: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  test("rejects plain prop access THROUGH an array (validation == emission)", () => {
    expect(() =>
      validateProjection(
        [{ prop: "screens" }, { prop: "name" }],
        schema,
        "T.m",
      ),
    ).toThrow(/ARRAY schema/);
  });

  test("terminal array access without index/each is fine (returns the array)", () => {
    expect(() =>
      validateProjection([{ prop: "screens" }], schema, "T.m"),
    ).not.toThrow();
  });

  test("index on a non-array property throws", () => {
    expect(() =>
      validateProjection([{ prop: "title", index: 0 }], schema, "T.m"),
    ).toThrow(/non-array/);
  });

  test("find on a non-array property throws", () => {
    expect(() =>
      validateProjection([{ prop: "title", find: "x.y" }], schema, "T.m"),
    ).toThrow(/requires an array/);
  });

  test("find dot-path is validated against the item schema", () => {
    expect(() =>
      validateProjection(
        [{ prop: "comps", find: "design.bogus" }],
        schema,
        "T.m",
      ),
    ).toThrow(/bogus/);
    expect(() =>
      validateProjection(
        [
          { prop: "comps", find: "design.widgets", acknowledgeSingle: true },
          { prop: "design" },
          { prop: "widgets", each: true },
        ],
        schema,
        "T.m",
      ),
    ).not.toThrow();
  });

  test("LINT: warns when index truncates an unbounded array", () => {
    const warnings = validateProjection(
      [{ prop: "screens", index: 0 }],
      schema,
      "T.m",
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("acknowledgeSingle");
  });

  test("LINT: acknowledgeSingle suppresses the warning", () => {
    const warnings = validateProjection(
      [{ prop: "screens", index: 0, acknowledgeSingle: true }],
      schema,
      "T.m",
    );
    expect(warnings).toEqual([]);
  });
});

// ── default emission + cache index [V1_PLAN §1.3] ──

describe("ArgParam default emission", () => {
  test("optional param with default → options?.x ?? default", () => {
    const result = generateArgsObject({
      deviceType: { from: "param", optional: true, default: "DESKTOP" },
    });
    expect(result).toContain('deviceType: options?.deviceType ?? "DESKTOP"');
  });
});

describe("emitCacheProjection with index", () => {
  test("index step → this.data?.cards?.[0]?.url", () => {
    expect(
      emitCacheProjection([{ prop: "cards", index: 0 }, { prop: "url" }]),
    ).toBe("(this.data as any)?.cards?.[0]?.url");
  });
});

// ── M4: union array item types are parenthesized [V1_REVIEW_FIXES] ──

describe("jsonSchemaToTs array-of-union precedence", () => {
  test('array of enum → ("A" | "B")[], not "A" | "B"[]', () => {
    const result = jsonSchemaToTs({
      type: "array",
      items: { enum: ["LAYOUT", "COLOR_SCHEME", "TEXT_CONTENT"] },
    });
    expect(result).toBe('("LAYOUT" | "COLOR_SCHEME" | "TEXT_CONTENT")[]');
  });

  test("array of plain string is NOT over-parenthesized", () => {
    expect(jsonSchemaToTs({ type: "array", items: { type: "string" } })).toBe(
      "string[]",
    );
  });
});

// ── M5: flatMap index emission is optional-guarded [V1_REVIEW_FIXES] ──

describe("emitFlatMapProjection guards trailing index", () => {
  test("each + trailing index emits ?.[n] (no bare bracket)", () => {
    const code = emitProjection([
      { prop: "outputComponents", each: true },
      { prop: "design" },
      { prop: "screens", index: 0 },
    ]);
    expect(code).toContain("?.[0]");
    expect(code).not.toMatch(/screens\[0\]/); // no UNGUARDED bracket
  });

  test("emitted each+index code returns [] (not throw) on a missing intermediate", () => {
    const code = emitProjection([
      { prop: "outputComponents", each: true },
      { prop: "design" },
      { prop: "screens", index: 0 },
    ]);
    // Strip TS `: any` annotations so the expression is valid JS to eval.
    const js = code.replace(/:\s*any/g, "");
    const fn = new Function("raw", `return ${js}`);
    // design present but screens absent — the old bare [0] threw here.
    expect(() => fn({ outputComponents: [{ design: {} }] })).not.toThrow();
    expect(fn({ outputComponents: [{ design: {} }] })).toEqual([]);
  });
});
