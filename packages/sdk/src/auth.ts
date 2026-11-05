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
 * Shared auth header builder for Stitch API clients.
 *
 * Both StitchToolClient and StitchProxy call Google APIs that accept either
 * an API key or an OAuth2 Bearer token. This utility centralizes the header
 * logic so both code paths stay in sync.
 */

import { SDK_VERSION } from "./version.js";

export type ClientSurface = "sdk" | "mcp" | "cli";

export interface AuthHeaderOptions {
  apiKey?: string;
  accessToken?: string;
  /** Google Cloud project ID for quota/billing with Bearer auth. */
  quotaProjectId?: string;
}

/**
 * Build the Google API client telemetry header identifying the Stitch SDK
 * version and top-level client surface (`gccl/<version> client/<surface>`).
 */
export function buildClientSurfaceHeader(
  surface: ClientSurface = "sdk",
): string {
  return `gccl/${SDK_VERSION} client/${surface}`;
}

/**
 * Merge HTTP headers case-insensitively. When an override matches an existing
 * header name regardless of casing, the earlier entry is replaced cleanly so
 * mixed-case duplicate keys cannot reach `fetch` or MCP transports.
 */
export function mergeHeadersCaseInsensitive(
  base: Record<string, string>,
  overrides?: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = {};
  const keyByLower = new Map<string, string>();

  const apply = (source: Record<string, string>) => {
    for (const [key, value] of Object.entries(source)) {
      const lower = key.toLowerCase();
      const existingKey = keyByLower.get(lower);
      if (existingKey !== undefined && existingKey !== key) {
        delete merged[existingKey];
      }
      keyByLower.set(lower, key);
      merged[key] = value;
    }
  };

  apply(base);
  if (overrides) {
    apply(overrides);
  }
  return merged;
}

/**
 * Build auth headers for a Stitch API request.
 *
 * - If `apiKey` is present, sends `X-Goog-Api-Key`.
 * - Otherwise if `accessToken` is present, sends `Authorization: Bearer`
 *   and optionally `X-Goog-User-Project` for quota.
 * - Throws if neither credential is provided.
 */
export function buildAuthHeaders(
  opts: AuthHeaderOptions,
): Record<string, string> {
  if (opts.apiKey) {
    return { "X-Goog-Api-Key": opts.apiKey };
  }
  if (opts.accessToken) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.accessToken}`,
    };
    if (opts.quotaProjectId) {
      headers["X-Goog-User-Project"] = opts.quotaProjectId;
    }
    return headers;
  }
  throw new Error(
    "No authentication credentials provided. Supply either apiKey or accessToken.",
  );
}
