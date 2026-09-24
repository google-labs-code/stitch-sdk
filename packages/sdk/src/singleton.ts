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
import { StitchToolClient, resolveConfigWithEnv } from "./client.js";
import { StitchConfigSchema, type StitchConfig } from "./spec/client.js";

/** Config surface accepted by getOrCreateClient — the full client config. */
export interface SingletonClientConfig {
  apiKey?: string;
  accessToken?: string;
  projectId?: string;
  baseUrl?: string;
  timeout?: number;
  retry?: StitchConfig["retry"];
  entityCache?: boolean;
}

/** Lazily-initialized default client + the resolved config that built it. */
let _client: StitchToolClient | null = null;
let _clientCacheKey: string | null = null;

/** Lazily-initialized default Stitch instance (tied to _client). */
let _stitch: Stitch | null = null;

/**
 * Resolve input + env into a full config and derive a stable cache key.
 * Throws the standard "Invalid configuration" ZodError when no credentials
 * can be resolved — same behavior as constructing a client directly.
 */
function resolveAndKey(config?: SingletonClientConfig): {
  resolved: StitchConfig;
  key: string;
} {
  const resolved = StitchConfigSchema.parse(
    resolveConfigWithEnv({
      apiKey: config?.apiKey,
      accessToken: config?.accessToken,
      projectId: config?.projectId,
      baseUrl: config?.baseUrl,
      timeout: config?.timeout,
      retry: config?.retry,
      entityCache: config?.entityCache,
    }),
  );
  const key = JSON.stringify({
    apiKey: resolved.apiKey,
    accessToken: resolved.accessToken,
    projectId: resolved.projectId,
    baseUrl: resolved.baseUrl,
    timeout: resolved.timeout,
    retry: resolved.retry,
    entityCache: resolved.entityCache,
  });
  return { resolved, key };
}

/**
 * Get or create the shared StitchToolClient instance.
 *
 * The cache key is the RESOLVED config (explicit input merged over env),
 * so a bare call after the environment changed produces a fresh client,
 * while an identical resolved config reuses the cached one.
 */
export function getOrCreateClient(
  config?: SingletonClientConfig,
): StitchToolClient {
  const { resolved, key } = resolveAndKey(config);

  if (_client && key !== _clientCacheKey) {
    _client.close().catch(() => {});
    _client = null;
    _stitch = null;
  }

  if (!_client) {
    _clientCacheKey = key;
    _client = new StitchToolClient(resolved);
  }
  return _client;
}

function getStitchInstance(): Stitch {
  // getOrCreateClient first — it may invalidate _stitch on env change.
  const client = getOrCreateClient();
  if (!_stitch) {
    _stitch = new Stitch(client);
  }
  return _stitch;
}

/**
 * Reset the shared singleton state: closes the cached client
 * (fire-and-forget) and clears the cached instances. Intended for tests
 * and for processes that need to rotate credentials explicitly.
 */
export function resetStitchSingleton(): void {
  if (_client) {
    _client.close().catch(() => {});
  }
  _client = null;
  _clientCacheKey = null;
  _stitch = null;
}

/** Methods that delegate to StitchToolClient instead of Stitch domain class. */
const CLIENT_METHODS = new Set(["listTools", "callTool", "close"]);

/** Public domain methods, reflected off the Stitch class prototype. */
const DOMAIN_METHODS = new Set(
  Object.getOwnPropertyNames(Stitch.prototype).filter(
    (name) =>
      name !== "constructor" &&
      typeof (Stitch.prototype as unknown as Record<string, unknown>)[name] ===
        "function",
  ),
);

/** The full public surface the proxy reflects without constructing a client. */
const PUBLIC_KEYS = [...CLIENT_METHODS, ...DOMAIN_METHODS];

/**
 * Lazy method wrappers: the underlying client/Stitch instance is only
 * constructed when a method is INVOKED — never on property access — so
 * introspection (console.log, the `in` operator, Object.keys) works
 * without credentials.
 */
const methodWrappers = new Map<string, (...args: unknown[]) => unknown>();

function getMethodWrapper(
  prop: string,
): ((...args: unknown[]) => unknown) | undefined {
  const cached = methodWrappers.get(prop);
  if (cached) return cached;

  let wrapper: ((...args: unknown[]) => unknown) | undefined;
  if (CLIENT_METHODS.has(prop)) {
    wrapper = (...args: unknown[]) => {
      const client = getOrCreateClient();
      return (
        client[prop as keyof StitchToolClient] as (...a: unknown[]) => unknown
      ).apply(client, args);
    };
  } else if (DOMAIN_METHODS.has(prop)) {
    wrapper = (...args: unknown[]) => {
      const instance = getStitchInstance();
      return (
        instance[prop as keyof Stitch] as (...a: unknown[]) => unknown
      ).apply(instance, args);
    };
  }

  if (wrapper) {
    Object.defineProperty(wrapper, "name", { value: prop });
    methodWrappers.set(prop, wrapper);
  }
  return wrapper;
}

function getPublicValue(prop: string): unknown {
  return getMethodWrapper(prop);
}

/**
 * Default Stitch instance using environment variables.
 * Lazily initialized on first METHOD INVOCATION (not property access).
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
  Stitch & Pick<StitchToolClient, "listTools" | "callTool" | "close"> & {}
>({} as any, {
  get(_target, prop: string | symbol) {
    // Symbols (inspect hooks, Symbol.toStringTag, then-ability probes...)
    // must never construct a client.
    if (typeof prop !== "string") return undefined;
    return getPublicValue(prop);
  },

  has(_target, prop: string | symbol) {
    return typeof prop === "string" && PUBLIC_KEYS.includes(prop);
  },

  ownKeys() {
    return PUBLIC_KEYS;
  },

  getOwnPropertyDescriptor(_target, prop: string | symbol) {
    if (typeof prop !== "string" || !PUBLIC_KEYS.includes(prop)) {
      return undefined;
    }
    return {
      value: getPublicValue(prop),
      writable: true,
      enumerable: true,
      configurable: true,
    };
  },
});
