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
import { classifyError, isRecoverable } from "../../src/spec/error-mapping.js";
import type { StitchErrorCode } from "../../src/spec/errors.js";

describe("classifyError", () => {
  // ── Status-driven matrix ─────────────────────────────────────────────────
  const statusCases: Array<[number, string | undefined, StitchErrorCode]> = [
    [429, undefined, "RATE_LIMITED"],
    [404, undefined, "NOT_FOUND"],
    [403, undefined, "PERMISSION_DENIED"],
    [401, undefined, "AUTH_FAILED"],
    [500, undefined, "UNKNOWN_ERROR"],
    [502, undefined, "SERVICE_UNAVAILABLE"],
    [503, undefined, "SERVICE_UNAVAILABLE"],
    [504, undefined, "SERVICE_UNAVAILABLE"],
    // Precedence: status ALWAYS wins; text is never consulted with a status.
    [403, "rate limit exceeded", "PERMISSION_DENIED"],
    [500, "rate limit exceeded", "UNKNOWN_ERROR"],
    [404, "unauthorized", "NOT_FOUND"],
    [429, "not found", "RATE_LIMITED"],
    [401, "permission denied", "AUTH_FAILED"],
  ];

  it.each(statusCases)(
    "status %i with text %j → %s",
    (status, text, expected) => {
      expect(classifyError({ status, text })).toBe(expected);
    },
  );

  // ── Text-only matrix (MCP isError path — no status) ─────────────────────
  const textCases: Array<[string, StitchErrorCode]> = [
    ["rate limit exceeded", "RATE_LIMITED"],
    ["You are being rate limited", "RATE_LIMITED"],
    ["HTTP 429: Too Many Requests", "RATE_LIMITED"],
    ["project not found", "NOT_FOUND"],
    ["Error: 404", "NOT_FOUND"],
    ["Resource Not Found", "NOT_FOUND"],
    ["permission denied", "PERMISSION_DENIED"],
    ["caller lacks permissions on the project", "PERMISSION_DENIED"],
    ["got a 403 from upstream", "PERMISSION_DENIED"],
    ["Unauthorized", "AUTH_FAILED"],
    ["request is unauthenticated", "AUTH_FAILED"],
    ["Request had invalid authentication credentials", "AUTH_FAILED"],
    ["HTTP 401: Unauthenticated", "AUTH_FAILED"],
    ["something went wrong", "UNKNOWN_ERROR"],
    ["", "UNKNOWN_ERROR"],
  ];

  it.each(textCases)("text %j → %s", (text, expected) => {
    expect(classifyError({ text })).toBe(expected);
  });

  // ── Word-boundary negatives ──────────────────────────────────────────────
  const negativeCases: Array<[string, StitchErrorCode]> = [
    // "author"/"authorize" must never classify as AUTH_FAILED.
    ["author of the page", "UNKNOWN_ERROR"],
    ["authorize", "UNKNOWN_ERROR"],
    ["failed to authorize the widget", "UNKNOWN_ERROR"],
    // Numeric tokens must be standalone: \b404\b rejects "1404".
    ["1404 items", "UNKNOWN_ERROR"],
    ["id 14041 missing", "UNKNOWN_ERROR"],
    ["4290 units", "UNKNOWN_ERROR"],
    ["error 14031", "UNKNOWN_ERROR"],
    ["code 24011", "UNKNOWN_ERROR"],
    // Leading word boundary on phrases.
    ["crate limit reached", "UNKNOWN_ERROR"],
  ];

  it.each(negativeCases)(
    "text %j must NOT misclassify (→ %s)",
    (text, expected) => {
      expect(classifyError({ text })).toBe(expected);
    },
  );

  it("matches case-insensitively", () => {
    expect(classifyError({ text: "RATE LIMIT EXCEEDED" })).toBe("RATE_LIMITED");
    expect(classifyError({ text: "UNAUTHORIZED" })).toBe("AUTH_FAILED");
  });

  it("returns UNKNOWN_ERROR when neither status nor text is given", () => {
    expect(classifyError({})).toBe("UNKNOWN_ERROR");
  });
});

describe("isRecoverable", () => {
  it("is true only for RATE_LIMITED, SERVICE_UNAVAILABLE, and NETWORK_ERROR", () => {
    expect(isRecoverable("RATE_LIMITED")).toBe(true);
    expect(isRecoverable("SERVICE_UNAVAILABLE")).toBe(true);
    expect(isRecoverable("NETWORK_ERROR")).toBe(true);
    expect(isRecoverable("AUTH_FAILED")).toBe(false);
    expect(isRecoverable("NOT_FOUND")).toBe(false);
    expect(isRecoverable("PERMISSION_DENIED")).toBe(false);
    expect(isRecoverable("VALIDATION_ERROR")).toBe(false);
    expect(isRecoverable("UNKNOWN_ERROR")).toBe(false);
  });
});
