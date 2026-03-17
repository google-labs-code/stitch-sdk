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

import { Stitch } from "../generated/src/stitch.js";
import { StitchToolClient } from "./client.js";
import { DEFAULT_STITCH_API_URL } from "./constants.js";

/** Lazily-initialized default client */
let _client: StitchToolClient | null = null;
let _clientApiKey: string | undefined;

/** Get or create the shared StitchToolClient instance. */
export function getOrCreateClient(config?: {
  apiKey?: string;
}): StitchToolClient {
  const apiKey = config?.apiKey;

  // Invalidate cache when an explicit apiKey differs from the cached one
  if (_client && apiKey && apiKey !== _clientApiKey) {
    _client.close().catch(() => {});
    _client = null;
    _stitch = null;
  }

  if (!_client) {
    _clientApiKey = apiKey;
    _client = new StitchToolClient({
      apiKey: apiKey || process.env.STITCH_API_KEY,
      baseUrl: process.env.STITCH_HOST || DEFAULT_STITCH_API_URL,
    });
  }
  return _client;
}

/** Lazily-initialized default Stitch instance */
let _stitch: Stitch | null = null;

function getStitchInstance(): Stitch {
  if (!_stitch) {
    _stitch = new Stitch(getOrCreateClient());
  }
  return _stitch;
}

/** Methods that delegate to StitchToolClient instead of Stitch domain class. */
const CLIENT_METHODS = new Set(["listTools", "callTool", "close"]);

/**
 * Default Stitch instance using environment variables.
 * Lazily initialized on first access.
 *
 * Exposes both domain methods (from Stitch class) and tool methods
 * (listTools, callTool, close from StitchToolClient).
 *
 * @example
 * import { stitch } from '@google/stitch-sdk';
 *
 * // Domain API
 * const projects = await stitch.projects();
 *
 * // Tool API
 * const tools = await stitch.listTools();
 * await stitch.callTool("create_project", { title: "My App" });
 */
export const stitch = new Proxy<
  Stitch & Pick<StitchToolClient, "listTools" | "callTool" | "close">
>({} as any, {
  get(_target, prop: string | symbol) {
    // Client methods → delegate to StitchToolClient
    if (typeof prop === "string" && CLIENT_METHODS.has(prop)) {
      const client = getOrCreateClient();
      const value = client[prop as keyof StitchToolClient];
      if (typeof value === "function") {
        return value.bind(client);
      }
      return value;
    }
    // Domain methods → delegate to Stitch instance
    const instance = getStitchInstance();
    const value = instance[prop as keyof Stitch];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});
