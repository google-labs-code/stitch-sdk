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

import { describe, it, expect, vi, afterEach } from "vitest";
import { ScreenContentHandler } from "../../src/content-handler.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ScreenContentHandler (Spec & Handler Pattern)", () => {
  const handler = new ScreenContentHandler();

  it("returns success result when fetch succeeds (200 OK)", async () => {
    const fakeResponse = { ok: true, status: 200 } as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse));

    const result = await handler.fetchArtifact({
      url: "https://files.example/artifact.html",
      label: "HTML for screen s-1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.response).toBe(fakeResponse);
    }
  });

  it("returns NOT_FOUND error result without throwing on 404", async () => {
    const fakeResponse = { ok: false, status: 404 } as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse));

    const result = await handler.fetchArtifact({
      url: "https://files.example/missing.png",
      label: "screenshot for screen s-1",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.recoverable).toBe(false);
    }
  });

  it("returns NETWORK_ERROR error result with expiration hint on 403", async () => {
    const fakeResponse = { ok: false, status: 403 } as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse));

    const result = await handler.fetchArtifact({
      url: "https://files.example/expired.html",
      label: "HTML for screen s-1",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NETWORK_ERROR");
      expect(result.error.message).toContain("signed URLs expire");
      expect(result.error.recoverable).toBe(true);
    }
  });

  it("returns NETWORK_ERROR error result on fetch network rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("socket hang up")),
    );

    const result = await handler.fetchArtifact({
      url: "https://files.example/fail.html",
      label: "HTML for screen s-1",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("NETWORK_ERROR");
      expect(result.error.message).toContain("socket hang up");
      expect(result.error.recoverable).toBe(true);
    }
  });
});
