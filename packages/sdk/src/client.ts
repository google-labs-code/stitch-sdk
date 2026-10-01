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

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  StitchConfigSchema,
  StitchConfig,
  StitchToolClientSpec,
  VirtualToolDefinition,
} from "./spec/client.js";
import { StitchError } from "./spec/errors.js";
import { classifyError, isRecoverable } from "./spec/error-mapping.js";
import { buildAuthHeaders as buildBaseAuthHeaders } from "./auth.js";
import { SDK_VERSION } from "./version.js";
import { repairToolSchemas } from "./schema-repair.js";
import { EntityManager } from "./entity-manager.js";
import { debugLog } from "./debug.js";

/** Read an env var, treating empty strings as unset. */
function env(name: string): string | undefined {
  return process.env[name] || undefined;
}

/** Fires the STITCH_HOST deprecation warning at most once per process. */
let warnedStitchHostAlias = false;

/** Test-only: re-arm the once-per-process STITCH_HOST deprecation warning. */
export function __resetStitchHostWarning(): void {
  warnedStitchHostAlias = false;
}

/**
 * Resolve a config input against the environment (D5 REVISED).
 *
 * Precedence: explicit config > STITCH_* vars > legacy aliases.
 *   - apiKey:      input ?? STITCH_API_KEY
 *   - accessToken: input ?? STITCH_ACCESS_TOKEN
 *   - projectId:   input ?? STITCH_PROJECT_ID ?? GOOGLE_CLOUD_PROJECT
 *                  (GOOGLE_CLOUD_PROJECT is the GCP-wide convention and
 *                  stays first-class — no warning)
 *   - baseUrl:     input ?? STITCH_BASE_URL ?? STITCH_HOST
 *                  (STITCH_HOST is a deprecated alias — warns once per
 *                  process, removed in 2.0)
 *
 * Shared by StitchToolClient and the singleton so both resolve the exact
 * same env set (the singleton derives its cache key from this output).
 */
export function resolveConfigWithEnv(
  input?: Partial<StitchConfig>,
): Partial<StitchConfig> {
  let baseUrl = input?.baseUrl ?? env("STITCH_BASE_URL");
  if (baseUrl === undefined) {
    const legacyHost = env("STITCH_HOST");
    if (legacyHost !== undefined) {
      baseUrl = legacyHost;
      if (!warnedStitchHostAlias) {
        warnedStitchHostAlias = true;
        console.warn(
          "[stitch-sdk] STITCH_HOST is a deprecated alias for STITCH_BASE_URL and will be removed in 2.0. Set STITCH_BASE_URL instead.",
        );
      }
    }
  }
  return {
    apiKey: input?.apiKey ?? env("STITCH_API_KEY"),
    accessToken: input?.accessToken ?? env("STITCH_ACCESS_TOKEN"),
    projectId:
      input?.projectId ??
      env("STITCH_PROJECT_ID") ??
      env("GOOGLE_CLOUD_PROJECT"),
    baseUrl,
    timeout: input?.timeout,
    retry: input?.retry,
    entityCache: input?.entityCache,
  };
}

/**
 * Parse a raw MCP CallToolResult envelope into the tool's payload.
 *
 * Shared by StitchToolClient and the proxy's virtual-tool path so both
 * see identical payloads (structuredContent first, then JSON-in-text)
 * and identical error behavior (isError → StitchError).
 */
export function parseToolResult<T>(result: any, name: string): T {
  if (result.isError) {
    const errorText = (result.content as any[])
      .map((c: any) => (c.type === "text" ? c.text : ""))
      .join("");

    const code = classifyError({ text: errorText });

    throw new StitchError({
      code,
      message: `Tool Call Failed [${name}]: ${errorText}`,
      recoverable: isRecoverable(code),
      toolName: name,
    });
  }

  // Stitch specific parsing: Check structuredContent first, then JSON in text
  const anyResult = result as any;
  if (anyResult.structuredContent) return anyResult.structuredContent as T;

  const textContent = (result.content as any[]).find(
    (c: any) => c.type === "text",
  );
  if (textContent && textContent.type === "text") {
    try {
      return JSON.parse(textContent.text) as T;
    } catch {
      return textContent.text as unknown as T;
    }
  }

  return anyResult as T;
}

/**
 * Tools matching this pattern are idempotent reads and therefore safe to
 * auto-retry. Generative/mutating tools (generate_*, edit_*, create_*, ...)
 * are NEVER auto-retried: a retried generation duplicates minutes of work,
 * burns quota, and can orphan screens server-side (V1_PLAN D6 revision).
 */
const RETRY_ELIGIBLE_TOOL = /^(get_|list_)/;

/**
 * Exponential backoff with full jitter:
 *   delay = min(maxMs, baseMs * 2^attempt) * random(0..1)
 *
 * `rand` is injectable for deterministic tests.
 */
export function computeBackoffMs(
  attempt: number,
  baseMs: number,
  maxMs: number,
  rand: () => number = Math.random,
): number {
  return Math.min(maxMs, baseMs * 2 ** attempt) * rand();
}

/**
 * Parse a Retry-After header (seconds or HTTP date) to milliseconds.
 */
export function parseRetryAfter(
  header: string | number | null | undefined,
): number | undefined {
  if (header == null) return undefined;
  if (typeof header === "number") {
    return Number.isFinite(header) && header >= 0 ? header * 1000 : undefined;
  }
  const trimmed = header.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) {
    const sec = parseInt(trimmed, 10);
    return Number.isFinite(sec) ? sec * 1000 : undefined;
  }
  const timestamp = Date.parse(trimmed);
  if (!Number.isNaN(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }
  return undefined;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Normalize an error thrown from the MCP transport into a StitchError.
 *
 * A non-OK HTTP response (gateway 429/401/403, etc.) is thrown by the MCP
 * SDK as StreamableHTTPError BEFORE any JSON-RPC body parsing, so it never
 * passes through parseToolResult and is neither classified nor retryable.
 * This maps it by status so RATE_LIMITED retry fires for real 429s and
 * callers always see a StitchError with `.status`/`.toolName`. Non-HTTP
 * errors (network/abort/already-StitchError) pass through unchanged.
 */
function normalizeTransportError(err: unknown, toolName: string): unknown {
  if (err instanceof StitchError) return err;
  if (err instanceof StreamableHTTPError && typeof err.code === "number") {
    const code = classifyError({ status: err.code });
    const headers = (err as any).headers || (err as any).response?.headers;
    const retryAfterVal =
      headers?.get?.("retry-after") ??
      headers?.["retry-after"] ??
      (err as any).retryAfter;
    return new StitchError({
      code,
      message: `Tool Call Failed [${toolName}]: HTTP ${err.code} — ${err.message}`,
      recoverable: isRecoverable(code),
      status: err.code,
      toolName,
      retryAfter: parseRetryAfter(retryAfterVal),
    });
  }
  if (err instanceof Error) {
    const causeMsg =
      err.cause instanceof Error ? err.cause.message : String(err.cause ?? "");
    const combined = `${err.message} ${causeMsg}`;
    if (
      /fetch failed|econnreset|socket|other side closed|econnrefused|etimedout|network/i.test(
        combined,
      )
    ) {
      return new StitchError({
        code: "NETWORK_ERROR",
        message: `Tool Call Failed [${toolName}]: ${err.message}`,
        recoverable: true,
        toolName,
      });
    }
  }
  return err;
}

/**
 * Authenticated tool pipe for the Stitch MCP Server.
 *
 * Designed for agents and orchestration scripts that forward JSON payloads
 * to MCP tools. Handles auth injection via the transport layer (not global fetch).
 *
 * Usage:
 *   const client = new StitchToolClient();          // reads STITCH_API_KEY from env
 *   const result = await client.callTool("generate_screen_from_text", { ... });
 */
export class StitchToolClient implements StitchToolClientSpec {
  name: "stitch-tool-client" = "stitch-tool-client";
  description: "Authenticated tool pipe for Stitch MCP Server" =
    "Authenticated tool pipe for Stitch MCP Server";

  private client: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private config: StitchConfig;
  private isConnected: boolean = false;
  private isClosed: boolean = false;
  private connectPromise: Promise<void> | null = null;
  private localVirtualTools: VirtualToolDefinition[] = [];
  public entities: EntityManager;

  /** Whether close() has been called on this client. */
  public get closed(): boolean {
    return this.isClosed;
  }

  constructor(
    inputConfig?: Partial<StitchConfig> & {
      localVirtualTools?: VirtualToolDefinition[];
    },
  ) {
    this.config = StitchConfigSchema.parse(resolveConfigWithEnv(inputConfig));
    this.localVirtualTools = inputConfig?.localVirtualTools || [];
    this.entities = new EntityManager(this, {
      enabled: this.config.entityCache,
    });

    this.client = this.createMcpClient();
  }

  /**
   * A fresh MCP Client is required per transport: calling connect() twice
   * on a single Client instance is undefined behavior in the MCP SDK.
   */
  private createMcpClient(): Client {
    return new Client(
      { name: "stitch-core-client", version: SDK_VERSION },
      { capabilities: {} },
    );
  }

  /**
   * Guard for the terminal close() state. Once close() has been called,
   * this client is permanently unusable — create a new StitchToolClient.
   */
  private assertNotClosed(): void {
    if (this.isClosed) {
      throw new StitchError({
        code: "CLIENT_CLOSED",
        message:
          "This client is closed: client.close() was called; create a new StitchToolClient to make further calls.",
        recoverable: false,
      });
    }
  }

  /**
   * Build auth headers based on config (API key or OAuth).
   */
  private buildAuthHeaders(): Record<string, string> {
    return {
      Accept: "application/json, text/event-stream",
      ...buildBaseAuthHeaders({
        apiKey: this.config.apiKey,
        accessToken: this.config.accessToken,
        quotaProjectId: this.config.projectId,
      }),
    };
  }

  private parseToolResponse<T>(result: any, name: string): T {
    return parseToolResult<T>(result, name);
  }

  async connect() {
    this.assertNotClosed();
    if (this.isConnected) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.doConnect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private async doConnect() {
    // Reconnect path: tear down any previous transport BEFORE creating a
    // new one, so failed/stale connections never leave dangling sockets.
    if (this.transport) {
      await this.transport.close().catch(() => {});
      this.transport = null;
      // The old Client is bound to the closed transport — recreate it.
      this.client = this.createMcpClient();
    }

    debugLog("lifecycle", "connecting", { baseUrl: this.config.baseUrl });

    // Validate baseUrl here so a bad value surfaces as a StitchError, not a
    // raw TypeError from `new URL()` (e.g. an explicit baseUrl:"" or garbage).
    let url: URL;
    try {
      url = new URL(this.config.baseUrl);
    } catch {
      throw new StitchError({
        code: "VALIDATION_ERROR",
        message: `Invalid baseUrl: "${this.config.baseUrl}" is not a valid URL.`,
        recoverable: false,
      });
    }

    // Create transport with auth headers injected per-instance (no global fetch mutation)
    this.transport = new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: this.buildAuthHeaders(),
      },
    });

    this.transport.onerror = (err) => {
      // debugLog only — the transport error object may embed request info
      // (headers); log err.message exclusively so credentials can't leak.
      debugLog("transport", "transport error", {
        message: err instanceof Error ? err.message : String(err),
      });
      this.isConnected = false;
    };

    await this.client.connect(this.transport);
    // If close() ran while we were awaiting connect, it already tore down
    // (and nulled) the transport — just bail. Do NOT resurrect isConnected,
    // and do NOT touch this.transport (dereferencing the now-null transport
    // here threw a TypeError that close()'s teardown was meant to avoid).
    if (this.isClosed) {
      this.isConnected = false;
      return;
    }
    this.isConnected = true;
    debugLog("lifecycle", "connected");
  }

  /**
   * Generic tool caller with type support and error parsing.
   *
   * RATE_LIMITED failures on idempotent reads (get_* / list_*) are retried
   * with exponential backoff + full jitter, per `config.retry`. MCP text
   * errors carry no Retry-After header, so nothing else is honored.
   */
  async callTool<T>(name: string, args: Record<string, any>): Promise<T> {
    this.assertNotClosed();
    if (!this.isConnected) await this.connect();

    // Log arg KEYS only — prompt/content values may be sensitive.
    debugLog("tool", `callTool ${name}`, { argKeys: Object.keys(args) });

    const localTool = this.localVirtualTools.find((t) => t.name === name);
    if (localTool) {
      return localTool.execute(this, args);
    }

    const retry =
      this.config.retry !== false && RETRY_ELIGIBLE_TOOL.test(name)
        ? this.config.retry
        : null;
    const maxAttempts = retry ? retry.attempts : 1;

    for (let attempt = 0; ; attempt++) {
      if (!this.isConnected) await this.connect();
      try {
        const result = await this.client.callTool(
          { name, arguments: args },
          undefined,
          { timeout: this.config.timeout },
        );
        const parsed = this.parseToolResponse<T>(result, name);
        if (name === "list_screens" && typeof args.projectId === "string") {
          const serverScreens: Record<string, any>[] = Array.isArray(
            (parsed as any)?.screens,
          )
            ? (parsed as any).screens
            : [];
          if (serverScreens.length === 0) {
            const recovered = await this.recoverScreensFromProject(
              args.projectId,
            );
            if (recovered.length > 0) {
              return { ...(parsed as any), screens: recovered } as T;
            }
          } else {
            const cached = this.entities.getCachedScreensData(args.projectId);
            if (cached.length > 0) {
              const seenIds = new Set(
                serverScreens.map((s) => s.id || s.name?.split("/").pop()),
              );
              const merged = [...serverScreens];
              for (const c of cached) {
                const cid = c.id || c.name?.split("/").pop();
                if (cid && !seenIds.has(cid)) {
                  seenIds.add(cid);
                  merged.push(c);
                }
              }
              if (merged.length > serverScreens.length) {
                return { ...(parsed as any), screens: merged } as T;
              }
            }
          }
        }
        return parsed;
      } catch (rawErr) {
        // Normalize transport HTTP / network errors first, so a real 429 or
        // transient socket reset is classified and retry-eligible.
        const err = normalizeTransportError(rawErr, name);
        if (err instanceof StitchError && err.code === "NETWORK_ERROR") {
          this.isConnected = false;
          this.connectPromise = null;
        }
        const isRetryable =
          retry !== null &&
          err instanceof StitchError &&
          (err.code === "RATE_LIMITED" ||
            err.code === "SERVICE_UNAVAILABLE" ||
            err.code === "NETWORK_ERROR");
        if (!isRetryable || attempt >= maxAttempts - 1) throw err;
        debugLog("retry", `${err.code} on ${name}; backing off`, {
          attempt: attempt + 1,
          maxAttempts,
        });
        const backoffMs = computeBackoffMs(attempt, retry.baseMs, retry.maxMs);
        const delayMs = Math.max(backoffMs, err.retryAfter ?? 0);
        await sleep(delayMs);
      }
    }
  }

  /**
   * Call a tool and return the RAW MCP CallToolResult envelope
   * (content / structuredContent / isError) WITHOUT parsing and WITHOUT
   * retry.
   *
   * This is the proxy's forwarding path: the proxy relays envelopes
   * verbatim to its downstream MCP client, which owns error semantics —
   * parsing or retrying here would change downstream-visible behavior.
   * SDK users want callTool() instead.
   */
  async callToolRaw(name: string, args: Record<string, any>): Promise<any> {
    this.assertNotClosed();
    if (!this.isConnected) await this.connect();

    // Log arg KEYS only — prompt/content values may be sensitive.
    debugLog("tool", `callToolRaw ${name}`, { argKeys: Object.keys(args) });

    return this.client.callTool({ name, arguments: args }, undefined, {
      timeout: this.config.timeout,
    });
  }

  /**
   * Make a direct REST POST to the Stitch API.
   *
   * Used for endpoints not available as MCP tools (e.g. BatchCreateScreens).
   * Reuses the same auth headers as callTool — both API key and OAuth Bearer
   * token are supported by all current REST POST endpoints.
   *
   * Throws StitchError on HTTP errors. Common failure modes:
   *   - 401 CREDENTIALS_MISSING → the API key was empty (source .env first)
   *   - 403 PERMISSION_DENIED   → the key doesn't own the target project
   *   Neither means "API keys are unsupported." See upload-handler.ts for full context.
   */
  async httpPost<T>(path: string, body: unknown): Promise<T> {
    this.assertNotClosed();
    const url = `${this.config.baseUrl.replace(/\/mcp$/, "").replace(/\/$/, "")}/v1/${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...this.buildAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // NO retry here: httpPost is used exclusively for mutating REST
    // endpoints (BatchCreateScreens uploads). Auto-retrying a mutation
    // risks duplicate server-side writes — the D6 idempotent-reads-only
    // rule means retry lives in callTool, gated on get_*/list_* names.
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const code = classifyError({ status: response.status, text });
      throw new StitchError({
        code,
        message: `HTTP ${response.status}: ${text || response.statusText}`,
        recoverable: isRecoverable(code),
      });
    }

    return response.json() as Promise<T>;
  }

  /**
   * List remote tools and return the RAW result — schemas exactly as the
   * server served them, with NO repair and NO local virtual tools appended.
   *
   * Used where the raw schemas are the source of truth: the capture
   * pipeline (tools-manifest must not be coupled to repair heuristics)
   * and the proxy (repair happens at serving time in its listTools
   * handler). SDK users want listTools() instead.
   *
   * CRITICAL: We use a raw request() instead of this.client.listTools()
   * because Client.listTools() eagerly compiles outputSchema with AJV
   * via cacheToolMetadata(). If the Stitch backend returns schemas with
   * $ref to missing $defs (e.g. #/$defs/ScreenInstance), AJV throws a
   * MissingRefError BEFORE any schema repair code can run.
   */
  async listToolsRaw(): Promise<{ tools: Tool[] }> {
    this.assertNotClosed();
    if (!this.isConnected) await this.connect();

    const remoteTools = await (this.client as any).request(
      { method: "tools/list", params: {} },
      ListToolsResultSchema,
    );

    return { tools: remoteTools.tools || [] };
  }

  async listTools() {
    const { tools } = await this.listToolsRaw();

    // Resilient Schema Repair: Inject missing $defs BEFORE any AJV
    // compilation can occur. Repairs both inputSchema and outputSchema.
    repairToolSchemas(tools);

    const localTools = this.localVirtualTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      source: t.source,
    }));
    return {
      tools: [...tools, ...localTools],
    };
  }

  /**
   * Recover screens for `projectId` from `EntityManager` and `get_project`'s
   * `screenInstances` when the MCP `list_screens` endpoint returns empty
   * prior to a Stitch web UI visit (Issue #149).
   */
  private async recoverScreensFromProject(
    projectId: string,
  ): Promise<Record<string, any>[]> {
    const byId = new Map<string, Record<string, any>>();

    for (const cached of this.entities.getCachedScreensData(projectId)) {
      const id = cached.id || cached.name?.split("/").pop();
      if (id) byId.set(id, cached);
    }

    try {
      const project = await this.callTool<any>("get_project", {
        name: `projects/${projectId}`,
      });
      const instances = Array.isArray(project?.screenInstances)
        ? project.screenInstances
        : [];
      for (const inst of instances) {
        const sourceScreen =
          typeof inst?.sourceScreen === "string" ? inst.sourceScreen : "";
        const screenId = sourceScreen.includes("/screens/")
          ? sourceScreen.split("/screens/").pop()
          : undefined;
        if (!screenId) continue;

        const existing = byId.get(screenId);
        if (existing?.htmlCode?.downloadUrl) continue;

        try {
          const full = await this.callTool<any>("get_screen", {
            projectId,
            screenId,
            name: `projects/${projectId}/screens/${screenId}`,
          });
          if (full && typeof full === "object") {
            byId.set(screenId, {
              id: screenId,
              name: `projects/${projectId}/screens/${screenId}`,
              title: inst.label,
              ...full,
            });
            continue;
          }
        } catch {
          // Fall back to metadata on ScreenInstance
        }
        byId.set(screenId, {
          id: screenId,
          name: sourceScreen || `projects/${projectId}/screens/${screenId}`,
          title: inst.label,
          width: inst.width,
          height: inst.height,
          ...(existing ?? {}),
        });
      }
    } catch {
      // Ignore get_project errors and return any cached in-session screens
    }

    return Array.from(byId.values());
  }

  /**
   * Close the connection. TERMINAL: after close(), every subsequent
   * connect/callTool/httpPost/listTools throws CLIENT_CLOSED — create a
   * new StitchToolClient instead. Calling close() again is a no-op.
   */
  async close() {
    if (this.isClosed) return;
    this.isClosed = true;
    this.isConnected = false;
    this.connectPromise = null;
    debugLog("lifecycle", "close() called — client is now terminal");
    if (this.transport) {
      await this.transport.close().catch(() => {});
      this.transport = null;
    }
  }
}
