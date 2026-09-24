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
 * STITCH_DEBUG diagnostics.
 *
 * `debugLog` is a no-op unless `process.env.STITCH_DEBUG` is set (truthy).
 * Output goes to stderr so it never corrupts stdout protocols (MCP stdio).
 *
 * Redaction: any key matching /authorization|api[-_]?key|token/i in the
 * `data` payload is replaced with "<redacted>" at ANY depth, so a
 * credential nested inside a headers/config object can never leak.
 * A depth cap guards against cyclic/pathological payloads.
 */

const SENSITIVE_KEY = /authorization|api[-_]?key|token/i;
const MAX_REDACT_DEPTH = 8;

function redactObject(value: unknown, depth: number): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_REDACT_DEPTH) return "<max-depth>";
  if (Array.isArray(value)) {
    return value.map((v) => redactObject(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    // Redact a matching key fully, regardless of nesting depth.
    out[key] = SENSITIVE_KEY.test(key)
      ? "<redacted>"
      : redactObject(val, depth + 1);
  }
  return out;
}

/**
 * Redact sensitive keys at any depth from a debug payload. Exported for tests.
 */
export function redactSensitive(data: unknown): unknown {
  return redactObject(data, 0);
}

/**
 * Log a diagnostic line as `[stitch-sdk:{area}] {message}` plus redacted
 * JSON data. No-op unless STITCH_DEBUG is set.
 */
export function debugLog(area: string, message: string, data?: unknown): void {
  if (!process.env.STITCH_DEBUG) return;
  const prefix = `[stitch-sdk:${area}] ${message}`;
  if (data === undefined) {
    console.error(prefix);
    return;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(redactSensitive(data));
  } catch {
    serialized = "<unserializable>";
  }
  console.error(`${prefix} ${serialized}`);
}
