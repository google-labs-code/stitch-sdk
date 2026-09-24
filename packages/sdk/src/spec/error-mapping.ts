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

import type { StitchErrorCode } from "./errors.js";

/**
 * Text-fallback patterns for MCP `isError` text, which carries no HTTP
 * status. Matching is case-insensitive (input is lowercased first) and
 * word-bounded: `\bauthorized\b`-style patterns mean "author" or
 * "authorize" can never classify as AUTH_FAILED, and numeric tokens like
 * `\b404\b` reject embedded digits ("1404 items" is NOT a 404).
 *
 * Order matters: first match wins.
 */
const TEXT_PATTERNS: ReadonlyArray<[RegExp, StitchErrorCode]> = [
  // "rate limit" deliberately has no trailing \b so "rate limited" /
  // "rate limiting" also match; the leading \b still rejects e.g. "crate limit".
  [/\brate limit|\b429\b/, "RATE_LIMITED"],
  [/\bservice unavailable|\b503\b/, "SERVICE_UNAVAILABLE"],
  [/\bnot found\b|\b404\b/, "NOT_FOUND"],
  // "permission" without trailing \b so "permissions" matches.
  [/\bpermission|\b403\b/, "PERMISSION_DENIED"],
  [
    /\bunauthorized\b|\bunauthenticated\b|\binvalid authentication\b|\b401\b/,
    "AUTH_FAILED",
  ],
];

/**
 * Single source of truth for classifying transport-level failures into
 * StitchErrorCode. Replaces the divergent substring chains that lived in
 * client.ts (x2), upload-handler.ts, and download-handler.ts.
 *
 * Precedence: a known HTTP status ALWAYS wins; the error text is only
 * consulted when no status is available (the MCP `isError` path).
 */
export function classifyError(input: {
  status?: number;
  text?: string;
}): StitchErrorCode {
  const { status, text } = input;

  if (status !== undefined) {
    if (status === 429) return "RATE_LIMITED";
    if (status === 503 || status === 502 || status === 504)
      return "SERVICE_UNAVAILABLE";
    if (status === 404) return "NOT_FOUND";
    if (status === 403) return "PERMISSION_DENIED";
    if (status === 401) return "AUTH_FAILED";
    // 5xx (and any other unrecognized status): the server failed in a way
    // we cannot map more precisely. Text is NOT consulted — status wins.
    return "UNKNOWN_ERROR";
  }

  if (text) {
    const lower = text.toLowerCase();
    for (const [pattern, code] of TEXT_PATTERNS) {
      if (pattern.test(lower)) return code;
    }
  }

  return "UNKNOWN_ERROR";
}

/**
 * Whether a caller may reasonably retry the operation that produced this
 * code. Note the contract: when the SDK has retry enabled it has ALREADY
 * retried idempotent reads — `recoverable` means *you* may retry.
 */
export function isRecoverable(code: StitchErrorCode): boolean {
  return (
    code === "RATE_LIMITED" ||
    code === "SERVICE_UNAVAILABLE" ||
    code === "NETWORK_ERROR"
  );
}
