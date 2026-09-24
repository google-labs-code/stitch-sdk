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
 * Golden tests for the codegen pipeline [V1_PLAN §1.1].
 *
 * Runs the REAL generator (bun scripts/generate-sdk.ts) against fixture
 * inputs covering every IR feature, into a sandbox directory. Then:
 *   1. SNAPSHOT each emitted file — emitter changes show up as reviewed diffs
 *   2. COMPILE the output with tsc against stub runtime modules
 *   3. BEHAVIORALLY test the emitted classes with a fake client
 *      (arg routing, projections, cache short-circuit, factories,
 *      constructor string rejection)
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPTS_DIR = resolve(import.meta.dir, "..");
const ROOT_DIR = resolve(SCRIPTS_DIR, "..");
const FIXTURES = resolve(import.meta.dir, "fixtures");

let sandbox: string;
let outDir: string;

const CLIENT_STUB = `
export class StitchToolClient {
  entities: any;
  constructor(entities?: any) {
    this.entities = entities;
  }
  async callTool<T>(name: string, args: Record<string, any>): Promise<T> {
    throw new Error("stub");
  }
}
`;

// Generated classes depend on the SPEC interface (since v1/19), not the
// concrete client. The compile check needs this module present and typed
// so `raw` and entity returns get real types (otherwise everything is
// implicitly any and the gate is meaningless). Mirrors the inference
// shape of the real EntityManager.resolve (T inferred from cls.prototype).
const SPEC_CLIENT_STUB = `
export interface StitchToolClientSpec {
  callTool<T>(name: string, args: Record<string, any>): Promise<T>;
  entities: {
    resolve<T>(cls: { prototype: T }, keys: string[], data: unknown): T;
  };
}
`;

const ERRORS_STUB = `
export class StitchError extends Error {
  code: string;
  recoverable: boolean;
  constructor(opts: { code: string; message: string; recoverable: boolean }) {
    super(opts.message);
    this.code = opts.code;
    this.recoverable = opts.recoverable;
  }
  static fromUnknown(err: unknown): StitchError {
    if (err instanceof StitchError) return err;
    return new StitchError({
      code: "UNKNOWN_ERROR",
      message: err instanceof Error ? err.message : String(err),
      recoverable: false,
    });
  }
}
`;

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "stitch-codegen-fixture-"));
  outDir = join(sandbox, "generated", "src");
  // Stub runtime modules at the relative paths the generated code imports
  mkdirSync(join(sandbox, "src", "spec"), { recursive: true });
  writeFileSync(join(sandbox, "src", "client.ts"), CLIENT_STUB);
  writeFileSync(join(sandbox, "src", "spec", "client.ts"), SPEC_CLIENT_STUB);
  writeFileSync(join(sandbox, "src", "spec", "errors.ts"), ERRORS_STUB);
  // Stub the publicInterface the fixture Widget declaration-merges, so the
  // golden suite exercises the `export interface X extends Y` emission
  // (the M1 fix path — otherwise only the real Screen exercises it).
  writeFileSync(
    join(sandbox, "src", "spec", "widget-extras.ts"),
    "export interface WidgetExtras { render(): Promise<string>; }\n",
  );
  // Generation is real handwritten infra, not schema-dependent — use the
  // actual implementation so behavioral tests exercise the shipped class.
  writeFileSync(
    join(sandbox, "src", "generation.ts"),
    readFileSync(resolve(ROOT_DIR, "packages/sdk/src/generation.ts"), "utf-8"),
  );
  writeFileSync(
    join(sandbox, "src", "screen-ext.ts"),
    "export interface Screen { [key: string]: any; }\n",
  );

  const result = Bun.spawnSync(["bun", join(SCRIPTS_DIR, "generate-sdk.ts")], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      STITCH_CODEGEN_MANIFEST: join(FIXTURES, "fixture-manifest.json"),
      STITCH_CODEGEN_DOMAIN_MAP: join(FIXTURES, "fixture-domain-map.json"),
      STITCH_CODEGEN_OUT: outDir,
    },
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Fixture generation failed:\n${result.stdout}\n${result.stderr}`,
    );
  }
});

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

// ── 1. Snapshots ─────────────────────────────────────────────

const EXPECTED_FILES = [
  "root.ts",
  "gizmo.ts",
  "widget.ts",
  "types.generated.ts",
  "responses.generated.ts",
  "index.ts",
];

describe("fixture output snapshots", () => {
  for (const file of EXPECTED_FILES) {
    test(`${file} matches snapshot`, () => {
      const content = readFileSync(join(outDir, file), "utf-8");
      // Strip the source-hash header lines: fixture edits change hashes,
      // and the snapshot should churn only on EMITTER changes.
      const withoutHashes = content
        .split("\n")
        .filter((l) => !l.includes("sha256:"))
        .join("\n");
      expect(withoutHashes).toMatchSnapshot();
    });
  }

  test("emits exactly the expected file set", () => {
    const files = readdirSync(outDir).sort();
    expect(files).toEqual([...EXPECTED_FILES, "tool-definitions.ts"].sort());
  });

  // Explicit guard for the M1 declaration-merge path (publicInterface),
  // separate from the snapshot so it can't be blindly re-baselined.
  test("a class with publicInterface declaration-merges it via a type-only import", () => {
    const src = readFileSync(join(outDir, "widget.ts"), "utf-8");
    expect(src).toMatch(/export interface Widget extends WidgetExtras/);
    expect(src).toMatch(
      /import\s+\{\s+type WidgetExtras\s+\}\s+from\s+"\.\.\/\.\.\/src\/spec\/widget-extras\.js"/,
    );
  });

  test("a class WITHOUT publicInterface emits no interface merge", () => {
    const src = readFileSync(join(outDir, "gizmo.ts"), "utf-8");
    expect(src).not.toMatch(/export interface Gizmo extends/);
  });
});

// ── 2. Compile check ─────────────────────────────────────────

describe("fixture output compiles", () => {
  test("tsc reports no diagnostics", async () => {
    const ts = (await import("typescript")).default;
    const fileNames = readdirSync(outDir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => join(outDir, f));

    const program = ts.createProgram(fileNames, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowImportingTsExtensions: false,
    });

    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    expect(diagnostics).toEqual([]);
  });
});

// ── 3. Behavioral tests ──────────────────────────────────────

/** Minimal identity-hydrating fake of EntityManager.resolve. */
function makeFakeClient() {
  const calls: { tool: string; args: any }[] = [];
  const client: any = {
    calls,
    callTool: async (tool: string, args: any) => {
      calls.push({ tool, args });
      return client.nextResponse;
    },
    nextResponse: {},
  };
  client.entities = {
    resolve: (EntityClass: any, keys: string[], data: any) => {
      const instance = new EntityClass(
        client,
        typeof data === "object" ? data : undefined,
      );
      const lastKey = keys[keys.length - 1];
      if (typeof data === "string") {
        // Mirror EntityManager: a bare ID satisfies the last reference key
        instance[lastKey] = data.includes("/") ? data.split("/").pop() : data;
      } else if (data && typeof data === "object") {
        for (const k of keys) if (data[k]) instance[k] = data[k];
        if (!instance[lastKey] && data.id) {
          instance[lastKey] = data.id;
        }
      }
      return instance;
    },
  };
  return client;
}

describe("fixture output behavior", () => {
  test("optional params route through the options object (D12)", async () => {
    const { Root } = await import(join(outDir, "root.ts"));
    const client = makeFakeClient();
    client.nextResponse = { gizmoId: "g-1", name: "gizmos/g-1" };

    const root = new Root(client);
    await root.createGizmo({ title: "Hello", labels: { a: "b" } });

    expect(client.calls[0]).toEqual({
      tool: "create_gizmo",
      args: { title: "Hello", labels: { a: "b" } },
    });

    await root.createGizmo();
    expect(client.calls[1].args).toEqual({
      title: undefined,
      labels: undefined,
    });
  });

  test("self + computed args route from instance fields", async () => {
    const { Gizmo } = await import(join(outDir, "gizmo.ts"));
    const client = makeFakeClient();
    client.nextResponse = { htmlCode: { downloadUrl: "https://x/y.html" } };

    const gizmo = client.entities.resolve(Gizmo, ["gizmoId"], {
      gizmoId: "g-9",
    });
    const url = await gizmo.getUrl();

    expect(client.calls[0]).toEqual({
      tool: "get_gizmo_asset",
      args: { gizmoId: "g-9", name: "gizmos/g-9" },
    });
    expect(url).toBe("https://x/y.html");
  });

  test("cache projection short-circuits without an API call", async () => {
    const { Gizmo } = await import(join(outDir, "gizmo.ts"));
    const client = makeFakeClient();

    const gizmo = client.entities.resolve(Gizmo, ["gizmoId"], {
      gizmoId: "g-9",
      htmlCode: { downloadUrl: "https://cached/url.html" },
    });
    const url = await gizmo.getUrl();

    expect(url).toBe("https://cached/url.html");
    expect(client.calls).toHaveLength(0);
  });

  test("each/each projection collects widgets across ALL components (multi-screen regression)", async () => {
    const { Widget } = await import(join(outDir, "widget.ts"));
    const client = makeFakeClient();
    client.nextResponse = {
      outputComponents: [
        { design: { widgets: [{ id: "w1" }, { id: "w2" }] } },
        { design: { widgets: [{ id: "w3" }] } },
      ],
    };

    const widget = client.entities.resolve(Widget, ["gizmoId", "widgetId"], {
      gizmoId: "g-1",
      widgetId: "w-0",
    });
    const gen = await widget.spawnAll("make more");
    const all = gen.screens;

    expect(all.map((w: any) => w.widgetId)).toEqual(["w1", "w2", "w3"]);
    expect(gen.first.widgetId).toBe("w1");
    expect(gen.raw.outputComponents).toHaveLength(2);
    // selfArray + rename routing
    expect(client.calls[0].args.selectedWidgetIds).toEqual(["w-0"]);
    expect(client.calls[0].args.mode).toBeUndefined();

    await widget.spawnAll("again", { spawnMode: "FAST" });
    expect(client.calls[1].args.mode).toBe("FAST");
  });

  test("find + index projection takes the first widget of the first matching component", async () => {
    const { Gizmo } = await import(join(outDir, "gizmo.ts"));
    const client = makeFakeClient();
    client.nextResponse = {
      outputComponents: [
        { other: true },
        { design: { widgets: [{ id: "w7" }, { id: "w8" }] } },
      ],
    };

    const gizmo = client.entities.resolve(Gizmo, ["gizmoId"], {
      gizmoId: "g-1",
    });
    const first = await gizmo.spawnFirst("prompt");
    expect(first.widgetId).toBe("w7");
    // parentField is spread into the child data
    expect(first.gizmoId).toBe("g-1");
  });

  test("incomplete generation response throws instead of returning undefined", async () => {
    const { Gizmo } = await import(join(outDir, "gizmo.ts"));
    const client = makeFakeClient();
    client.nextResponse = { outputComponents: [] };

    const gizmo = client.entities.resolve(Gizmo, ["gizmoId"], {
      gizmoId: "g-1",
    });
    await expect(gizmo.spawnFirst("prompt")).rejects.toThrow(
      /Incomplete API response/,
    );
  });

  test("factories hydrate child identity incl. parentField", async () => {
    const { Root } = await import(join(outDir, "root.ts"));
    const { Gizmo } = await import(join(outDir, "gizmo.ts"));
    const client = makeFakeClient();

    const root = new Root(client);
    const gizmo = root.gizmo("g-5");
    expect(gizmo).toBeInstanceOf(Gizmo);
    expect(gizmo.gizmoId).toBe("g-5");

    const widget = gizmo.widget("w-2");
    expect(widget.widgetId).toBe("w-2");
    expect(widget.gizmoId).toBe("g-5");
  });

  test("constructors accept string data and hydrate id for backward compatibility", async () => {
    const { Gizmo } = await import(join(outDir, "gizmo.ts"));
    const client = makeFakeClient();
    const gizmo = new Gizmo(client, "g-1");
    expect(gizmo.gizmoId).toBe("g-1");
  });

  test("static entityKey is emitted on every non-root class", async () => {
    const { Gizmo } = await import(join(outDir, "gizmo.ts"));
    const { Widget } = await import(join(outDir, "widget.ts"));
    expect((Gizmo as any).entityKey).toBe("Gizmo");
    expect((Widget as any).entityKey).toBe("Widget");
  });
});
