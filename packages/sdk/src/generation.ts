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

import type { Screen } from "./screen-ext.js";
import { StitchError } from "./spec/errors.js";

/**
 * Result container for generative operations (generate / edit /
 * variants / apply) [V1_PLAN §3.1, amended].
 *
 * Stitch returns MANY screens per generation (across multiple output
 * components). Projecting a single screen out of that response silently
 * dropped the rest — the original 1.0-blocking bug. A Generation always
 * carries ALL screens plus the raw response, so future response
 * enrichment (progress updates, feedback) is additive, not breaking.
 *
 * Polymorphic compatibility (0.4.0 Non-Breaking Bridge):
 * Generation extends Screen conceptually and proxies all Screen properties
 * to `this.first`. This ensures `Promise<Generation<Screen>>` is assignable
 * to `Promise<Screen>` for existing 0.x code, while exposing `.screens`
 * and iteration for multi-screen code.
 */
export interface Generation<TItem = Screen, TRaw = unknown>
  extends Screen, Iterable<TItem> {}

export class Generation<TItem = Screen, TRaw = unknown> {
  // Constructed only by generated methods, which throw on an empty response
  // BEFORE calling this — so `first` is always present in practice. A
  // consumer who hand-constructs an empty Generation gets `first === undefined`.
  constructor(
    /** Every screen produced by the operation, across all output components. */
    public readonly screens: readonly TItem[],
    /** The full tool response (typed), incl. fields the SDK doesn't model. */
    public readonly raw: TRaw,
  ) {
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop in target) {
          const val = Reflect.get(target, prop, receiver);
          return typeof val === "function" ? (val as any).bind(target) : val;
        }
        if (target.first && typeof target.first === "object") {
          const val = Reflect.get(target.first as any, prop);
          return typeof val === "function"
            ? (val as any).bind(target.first)
            : val;
        }
        return undefined;
      },
      set(target, prop, value, receiver) {
        if (prop in target) {
          return Reflect.set(target, prop, value, receiver);
        }
        if (target.first && typeof target.first === "object") {
          return Reflect.set(target.first as any, prop, value);
        }
        return Reflect.set(target, prop, value, receiver);
      },
      has(target, prop) {
        if (prop in target) return true;
        if (target.first && typeof target.first === "object") {
          return prop in (target.first as any);
        }
        return false;
      },
      ownKeys(target) {
        const keys = new Set<string | symbol>(Reflect.ownKeys(target));
        if (target.first && typeof target.first === "object") {
          for (const k of Reflect.ownKeys(target.first as object)) {
            if (k !== "client") keys.add(k);
          }
        }
        return Array.from(keys);
      },
      getOwnPropertyDescriptor(target, prop) {
        const own = Reflect.getOwnPropertyDescriptor(target, prop);
        if (own) return own;
        if (target.first && typeof target.first === "object") {
          const firstDesc = Reflect.getOwnPropertyDescriptor(
            target.first as object,
            prop,
          );
          if (firstDesc) {
            return { ...firstDesc, configurable: true };
          }
        }
        return undefined;
      },
    });
  }

  /**
   * The first screen of the response. Generated methods guarantee a
   * non-empty Generation (an empty response throws at the call site),
   * so this is always present.
   */
  get first(): TItem {
    return this.screens[0];
  }

  /** Number of screens produced. */
  get length(): number {
    return this.screens.length;
  }

  [Symbol.iterator](): Iterator<TItem> {
    return this.screens[Symbol.iterator]();
  }
}

/**
 * The error a generated method throws when a generative tool returns no
 * screens, so that `Generation` stays non-empty.
 *
 * Stitch's agent can answer with a question instead of a design: the
 * response then carries `outputComponents[].text` (the question) and
 * `outputComponents[].suggestion` (proposed replies) but no
 * `design.screens`. That is a conversational turn, not a broken response,
 * so it surfaces as a recoverable `CLARIFICATION_REQUIRED` with the
 * question attached. A response with neither screens nor text is still an
 * incomplete response (`UNKNOWN_ERROR`).
 */
export function emptyGenerationError(
  toolName: string,
  raw: unknown,
): StitchError {
  const components: unknown[] = Array.isArray(
    (raw as { outputComponents?: unknown })?.outputComponents,
  )
    ? (raw as { outputComponents: unknown[] }).outputComponents
    : [];
  const strings = (key: "text" | "suggestion") =>
    components
      .map((c) => (c as Record<string, unknown> | null)?.[key])
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);

  const question = strings("text").join("\n\n");
  if (!question) {
    return new StitchError({
      code: "UNKNOWN_ERROR",
      message: `Incomplete API response from ${toolName}: no screens in response`,
      recoverable: false,
      toolName,
    });
  }
  const suggestions = strings("suggestion");
  return new StitchError({
    code: "CLARIFICATION_REQUIRED",
    message: `Stitch asked a question instead of generating screens: ${question}`,
    suggestion:
      suggestions.length > 0
        ? `Call again with a prompt that answers it, e.g. "${suggestions[0]}".`
        : "Call again with a prompt that answers the question.",
    recoverable: true,
    toolName,
    clarification: { question, suggestions },
  });
}
