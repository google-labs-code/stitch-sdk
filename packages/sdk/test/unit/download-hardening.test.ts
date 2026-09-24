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
 * Hardening tests for download-handler [V1_PLAN §0.5]:
 * concurrency-pool error collection, non-OK HTML handling,
 * per-asset failure warnings, and https-only asset downloads.
 */

import { describe, it, expect, vi } from "vitest";
import {
  DownloadAssetsHandler,
  runWithConcurrency,
} from "../../src/download-handler.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
});

function clientWithScreens(screens: any[]) {
  return {
    callTool: vi.fn().mockImplementation((tool: string) => {
      if (tool === "list_screens") return Promise.resolve({ screens });
      if (tool === "list_design_systems")
        return Promise.resolve({ designSystems: [] });
      return Promise.resolve({});
    }),
  } as any;
}

describe("runWithConcurrency (worker pool)", () => {
  it("collects ALL rejections without aborting sibling tasks", async () => {
    const done: number[] = [];
    const tasks = [
      async () => {
        done.push(1);
      },
      async () => {
        throw new Error("boom-a");
      },
      async () => {
        await new Promise((r) => setTimeout(r, 5));
        done.push(3);
      },
      async () => {
        throw new Error("boom-b");
      },
      async () => {
        done.push(5);
      },
    ];

    const { failed } = await runWithConcurrency(tasks, 2);

    expect(failed).toHaveLength(2);
    expect(failed.map((f) => (f.error as Error).message).sort()).toEqual([
      "boom-a",
      "boom-b",
    ]);
    expect(done.sort()).toEqual([1, 3, 5]);
  });

  it("respects the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 10 }, () => async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
    });

    await runWithConcurrency(tasks, 3);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("handles an empty task list", async () => {
    const { failed } = await runWithConcurrency([], 5);
    expect(failed).toEqual([]);
  });
});

describe("DownloadAssetsHandler hardening", () => {
  it("skips a screen and warns when its HTML fetch returns non-OK (expired signed URL)", async () => {
    const client = clientWithScreens([
      {
        id: "s1",
        name: "projects/p1/screens/s1",
        htmlCode: { downloadUrl: "https://fake/expired.html" },
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve("AccessDenied"),
      }),
    );

    const handler = new DownloadAssetsHandler(client);
    const result = await handler.execute({
      projectId: "p1",
      outputDir: "/tmp/out",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // The 403 body must NOT be saved as code.html
      expect(result.downloadedScreens).toHaveLength(0);
      expect(result.warnings?.join(" ")).toContain("HTTP 403");
    }
    vi.unstubAllGlobals();
  });

  it("reports per-asset failures as warnings while still downloading the screen", async () => {
    const client = clientWithScreens([
      {
        id: "s1",
        name: "projects/p1/screens/s1",
        htmlCode: { downloadUrl: "https://fake/s1.html" },
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "https://fake/s1.html") {
          return Promise.resolve({
            ok: true,
            text: () =>
              Promise.resolve(
                '<html><img src="https://example.com/broken.png"></html>',
              ),
          });
        }
        // Asset fetch fails
        return Promise.resolve({ ok: false, status: 500 });
      }),
    );

    const handler = new DownloadAssetsHandler(client);
    const result = await handler.execute({
      projectId: "p1",
      outputDir: "/tmp/out",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.downloadedScreens).toHaveLength(1);
      expect(result.warnings?.join(" ")).toContain("Asset download failed");
    }
    vi.unstubAllGlobals();
  });

  it("does not download plain-http assets (https only)", async () => {
    const assetFetches: string[] = [];
    const client = clientWithScreens([
      {
        id: "s1",
        name: "projects/p1/screens/s1",
        htmlCode: { downloadUrl: "https://fake/s1.html" },
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "https://fake/s1.html") {
          return Promise.resolve({
            ok: true,
            text: () =>
              Promise.resolve(
                '<html><img src="http://insecure.example.com/x.png"></html>',
              ),
          });
        }
        assetFetches.push(url);
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        });
      }),
    );

    const handler = new DownloadAssetsHandler(client);
    const result = await handler.execute({
      projectId: "p1",
      outputDir: "/tmp/out",
    });

    expect(result.success).toBe(true);
    expect(assetFetches).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("unlinks the temp file when the rename fails (no stray .tmp-*)", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.rename).mockRejectedValueOnce(
      Object.assign(new Error("read-only fs"), { code: "EROFS" }),
    );
    vi.mocked(fs.unlink).mockClear();

    const client = clientWithScreens([
      {
        id: "s1",
        name: "projects/p1/screens/s1",
        htmlCode: { downloadUrl: "https://fake/s1.html" },
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html></html>"),
      }),
    );

    const handler = new DownloadAssetsHandler(client);
    const result = await handler.execute({
      projectId: "p1",
      outputDir: "/tmp/out",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("WRITE_FAILED");
    }
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining(".tmp-"));
    vi.unstubAllGlobals();
  });
});

describe("DownloadAssetsHandler path traversal (C1)", () => {
  it("refuses a server-controlled screenId that escapes outputDir (PATH_TRAVERSAL_ATTEMPT, no write)", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.mkdir).mockClear();
    vi.mocked(fs.writeFile).mockClear();

    // Empty title -> slugify falls back to the raw id, which traverses.
    const client = clientWithScreens([
      {
        id: "../../escaped/PWNED",
        name: "projects/p1/screens/../../escaped/PWNED",
        title: "",
        htmlCode: { downloadUrl: "https://fake/s.html" },
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html></html>"),
      }),
    );

    const handler = new DownloadAssetsHandler(client);
    const result = await handler.execute({
      projectId: "p1",
      outputDir: "/tmp/out",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("PATH_TRAVERSAL_ATTEMPT");
    }
    // The guard returns BEFORE any filesystem write.
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("refuses a traversing design-system displayName", async () => {
    // displayName empty -> dsName falls back to ds.name.split("/").pop().
    // pop() yields the last segment, so the real escape is a trailing "..".
    const client = {
      callTool: vi.fn().mockImplementation((tool: string) => {
        if (tool === "list_screens") return Promise.resolve({ screens: [] });
        if (tool === "list_design_systems")
          return Promise.resolve({
            designSystems: [
              {
                name: "assets/..",
                designSystem: { displayName: "", theme: { designMd: "# x" } },
              },
            ],
          });
        return Promise.resolve({});
      }),
    } as any;

    const handler = new DownloadAssetsHandler(client);
    const result = await handler.execute({
      projectId: "p1",
      outputDir: "/tmp/out",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("PATH_TRAVERSAL_ATTEMPT");
    }
  });

  it("allows a legitimate screenId (containment guard does not false-positive)", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.mkdir).mockClear();
    const client = clientWithScreens([
      {
        id: "s-legit",
        name: "projects/p1/screens/s-legit",
        title: "Home Page",
        htmlCode: { downloadUrl: "https://fake/s.html" },
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html></html>"),
      }),
    );

    const handler = new DownloadAssetsHandler(client);
    const result = await handler.execute({
      projectId: "p1",
      outputDir: "/tmp/out",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.downloadedScreens).toHaveLength(1);
    }
    expect(fs.mkdir).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
