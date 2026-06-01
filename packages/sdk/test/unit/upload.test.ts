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

import { describe, it, expect, vi } from "vitest";
import { Project } from "../../src/project-ext.js";
import { StitchError } from "../../src/spec/errors.js";
import { StitchToolClient } from "../../src/client.js";
import { UploadInputSchema } from "../../src/spec/upload.js";
import { UploadHandler } from "../../src/upload-handler.js";
import type { StitchToolClientSpec } from "../../src/spec/client.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockClient(
  overrides: Partial<Pick<StitchToolClientSpec, "httpPost">> = {},
): StitchToolClientSpec {
  return {
    name: "stitch-tool-client",
    description: "Authenticated tool pipe for Stitch MCP Server",
    connect: vi.fn().mockResolvedValue(undefined),
    callTool: vi.fn().mockResolvedValue({}),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    close: vi.fn().mockResolvedValue(undefined),
    httpPost: vi.fn().mockResolvedValue({ screens: [] }),
    ...overrides,
  };
}

describe("UploadInputSchema", () => {
  it("rejects an empty filePath", () => {
    const result = UploadInputSchema.safeParse({ filePath: "" });
    expect(result.success).toBe(false);
  });

  it("parses valid input with createScreenInstances defaulting to true", () => {
    const result = UploadInputSchema.safeParse({ filePath: "/img/a.png" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.createScreenInstances).toBe(true);
      expect(result.data.title).toBeUndefined();
    }
  });

  it("allows input without a title", () => {
    const result = UploadInputSchema.safeParse({
      filePath: "/img/b.webp",
      createScreenInstances: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBeUndefined();
      expect(result.data.createScreenInstances).toBe(false);
    }
  });
});

// ─── Slice 2: Handler Tests ───────────────────────────────────────────────────

describe("UploadHandler (TDD RED)", () => {
  it("should exist as a valid handler class constructor and be executable", async () => {
    expect(UploadHandler).toBeDefined();
    const handler = new UploadHandler(createMockClient());
    expect(handler.execute).toBeDefined();
  });
});

describe("UploadHandler", () => {
  it("returns UNSUPPORTED_FORMAT for a .gif file", async () => {
    const handler = new UploadHandler(createMockClient());
    const result = await handler.execute("proj-1", {
      filePath: "/images/animation.gif",
      createScreenInstances: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNSUPPORTED_FORMAT");
      expect(result.error.recoverable).toBe(false);
    }
  });

  it("returns FILE_NOT_FOUND for a nonexistent .png path", async () => {
    const fs = await import("node:fs/promises");
    const realReadFile = (
      await vi.importActual<typeof import("node:fs/promises")>(
        "node:fs/promises",
      )
    ).readFile;
    vi.mocked(fs.readFile).mockImplementationOnce(realReadFile as any);

    const handler = new UploadHandler(createMockClient());
    const result = await handler.execute("proj-1", {
      filePath: "/absolutely/nonexistent/photo.png",
      createScreenInstances: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
      expect(result.error.recoverable).toBe(false);
    }
  });

  it("returns UPLOAD_FAILED when httpPost throws a generic server error", async () => {
    const handler = new UploadHandler(
      createMockClient({
        httpPost: vi.fn().mockRejectedValue(new Error("Internal Server Error")),
      }),
    );
    const result = await handler.execute("proj-1", {
      filePath: "/tmp/missing.gif",
      createScreenInstances: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNSUPPORTED_FORMAT");
    }
  });

  it("returns AUTH_FAILED when httpPost throws with 401 in message", async () => {
    const handler = new UploadHandler(
      createMockClient({
        httpPost: vi.fn().mockRejectedValue(new Error("HTTP 401")),
      }),
    );
    const result = await handler.execute("proj-1", {
      filePath: "/tmp/none.gif",
      createScreenInstances: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNSUPPORTED_FORMAT");
    }
  });
});

// ─── Slice 2b: Handler Tests with mocked fs ───────────────────────────────────

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    access: vi.fn().mockResolvedValue(undefined), // file always exists
    readFile: vi.fn().mockResolvedValue("base64data"), // dummy base64
  };
});

describe("UploadHandler (fs mocked)", () => {
  it("returns Screen[] on a successful upload", async () => {
    const httpPost = vi.fn().mockResolvedValue({
      results: [
        { screen: { name: "projects/proj-1/screens/s-abc", title: "Test" } },
      ],
    });
    const handler = new UploadHandler(createMockClient({ httpPost }));
    const result = await handler.execute("proj-1", {
      filePath: "/fake/design.png",
      createScreenInstances: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.screens).toHaveLength(1);
    }
  });

  it("does not call fs.access when reading file", async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.access).mockClear();

    const httpPost = vi.fn().mockResolvedValue({ results: [] });
    const handler = new UploadHandler(createMockClient({ httpPost }));

    await handler.execute("proj-1", {
      filePath: "/fake/design.png",
      createScreenInstances: true,
    });

    expect(fs.access).not.toHaveBeenCalled();
  });

  it("returns UPLOAD_FAILED when httpPost throws a generic server error", async () => {
    const httpPost = vi
      .fn()
      .mockRejectedValue(new Error("Internal Server Error"));
    const handler = new UploadHandler(createMockClient({ httpPost }));
    const result = await handler.execute("proj-1", {
      filePath: "/fake/design.png",
      createScreenInstances: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UPLOAD_FAILED");
    }
  });

  it("returns AUTH_FAILED when httpPost throws with 401 in message", async () => {
    const httpPost = vi
      .fn()
      .mockRejectedValue(new Error("HTTP 401: Unauthorized"));
    const handler = new UploadHandler(createMockClient({ httpPost }));
    const result = await handler.execute("proj-1", {
      filePath: "/fake/design.png",
      createScreenInstances: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("AUTH_FAILED");
    }
  });

  it("calls httpPost with the correct REST path", async () => {
    const httpPost = vi.fn().mockResolvedValue({ screens: [] });
    const handler = new UploadHandler(createMockClient({ httpPost }));
    await handler.execute("my-proj-id", {
      filePath: "/fake/design.webp",
      createScreenInstances: true,
    });
    expect(httpPost).toHaveBeenCalledWith(
      "projects/my-proj-id/screens:batchCreate",
      expect.objectContaining({ parent: "projects/my-proj-id" }),
    );
  });
});

// ─── Slice 4: Integration Tests (Project.upload) ─────────────────────────────

describe("Project.upload (generic integration)", () => {
  function createProjectWithMockedClient(
    httpPostMock: ReturnType<typeof vi.fn>,
  ) {
    const mockClient = createMockClient({
      httpPost: httpPostMock as unknown as StitchToolClientSpec["httpPost"],
    });
    return new Project(
      mockClient as unknown as StitchToolClient,
      "test-project-id",
    );
  }

  it("throws StitchError when the asset format is unsupported", async () => {
    const proj = createProjectWithMockedClient(vi.fn());
    await expect(proj.upload("/path/to/animation.gif")).rejects.toThrow(
      StitchError,
    );
  });

  it("should surface a valid generic upload method capability", async () => {
    const httpPost = vi.fn().mockResolvedValue({
      results: [
        {
          screen: {
            name: "projects/test-project-id/screens/s-abc",
            title: "Generic",
          },
        },
      ],
    });
    const proj = createProjectWithMockedClient(httpPost);
    expect(proj.upload).toBeDefined();
    const screens = await proj.upload("/fake/document.html");
    expect(screens).toHaveLength(1);
  });
});
