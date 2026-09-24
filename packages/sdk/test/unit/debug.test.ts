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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { debugLog, redactSensitive } from "../../src/debug.js";

describe("debugLog", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("is silent when STITCH_DEBUG is unset", () => {
    vi.stubEnv("STITCH_DEBUG", "");
    debugLog("test", "should not appear", { apiKey: "secret" });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs to console.error with the area prefix when STITCH_DEBUG is set", () => {
    vi.stubEnv("STITCH_DEBUG", "1");
    debugLog("lifecycle", "connected");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe("[stitch-sdk:lifecycle] connected");
  });

  it("appends JSON data with sensitive keys redacted", () => {
    vi.stubEnv("STITCH_DEBUG", "1");
    debugLog("tool", "callTool", {
      tool: "list_projects",
      apiKey: "super-secret",
      Authorization: "Bearer xyz",
      accessToken: "tok",
      "api-key": "k1",
      api_key: "k2",
    });
    const line = errorSpy.mock.calls[0][0] as string;
    expect(line).toContain("[stitch-sdk:tool] callTool");
    expect(line).toContain('"tool":"list_projects"');
    expect(line).not.toContain("super-secret");
    expect(line).not.toContain("Bearer xyz");
    expect(line).not.toContain('"tok"');
    expect(line).not.toContain('"k1"');
    expect(line).not.toContain('"k2"');
    expect(line).toContain("<redacted>");
  });

  it("redacts one level deep (nested headers object)", () => {
    vi.stubEnv("STITCH_DEBUG", "1");
    debugLog("transport", "request", {
      headers: { Authorization: "Bearer abc", Accept: "application/json" },
    });
    const line = errorSpy.mock.calls[0][0] as string;
    expect(line).not.toContain("Bearer abc");
    expect(line).toContain('"Accept":"application/json"');
  });
});

describe("redactSensitive", () => {
  it("passes primitives through unchanged", () => {
    expect(redactSensitive("hello")).toBe("hello");
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(null)).toBe(null);
  });

  it("redacts keys matching authorization/api-key/token patterns", () => {
    expect(
      redactSensitive({
        authorization: "a",
        apiKey: "b",
        API_KEY: "c",
        myToken: "d",
        safe: "keep",
      }),
    ).toEqual({
      authorization: "<redacted>",
      apiKey: "<redacted>",
      API_KEY: "<redacted>",
      myToken: "<redacted>",
      safe: "keep",
    });
  });

  it("redacts inside arrays of objects", () => {
    expect(redactSensitive([{ token: "x", ok: 1 }])).toEqual([
      { token: "<redacted>", ok: 1 },
    ]);
  });
});
