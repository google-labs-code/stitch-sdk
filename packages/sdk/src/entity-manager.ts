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

import { parseResourceName } from "./utils.js";

/** Extract all ID segments from a standard resource name (e.g. projects/123/screens/456) */
export function parseAllSegments(name: string): Record<string, string> {
  if (!name || !name.includes("/")) return {};
  const parts = name.split("/");
  const result: Record<string, string> = {};
  for (let i = 0; i < parts.length - 1; i += 2) {
    let key = parts[i];
    if (key.endsWith("s")) key = key.slice(0, -1);
    result[key + "Id"] = parts[i + 1];
  }
  return result;
}

/**
 * A domain-entity class reference. Typed via `prototype` (not a
 * construct signature) so classes with PROTECTED constructors — all
 * generated entities — can be passed. Construction happens only inside
 * the EntityManager.
 */
export type EntityClassRef<T> = Function & {
  prototype: T;
  entityKey?: string;
};

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * Deep merge utility for plain JSON entity data (V1_PLAN D3/Ticket 3).
 * Recursively merges plain objects while replacing arrays and primitive leaves.
 */
export function mergeEntityData(target: unknown, source: unknown): unknown {
  if (!isPlainObject(target) || !isPlainObject(source)) {
    return source;
  }
  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeEntityData(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export class EntityManager {
  private cache = new Map<string, any>();
  private client: any;
  /** When false, every resolve returns a fresh instance (value-object mode). */
  private enabled: boolean;

  /**
   * Canonical implementations by entityKey. Extension modules (e.g.
   * project-ext, screen-ext) register themselves here so that EVERY
   * resolve — including generated self-references like Screen.edit
   * returning Screens — instantiates the extended class, without the
   * generated base module ever importing its own extension (which
   * would be an ESM cycle with TDZ hazards).
   */
  private static implementations = new Map<string, Function>();

  static registerImplementation(entityKey: string, ctor: Function): void {
    EntityManager.implementations.set(entityKey, ctor);
  }

  constructor(client: any, opts?: { enabled?: boolean }) {
    this.client = client;
    this.enabled = opts?.enabled ?? true;
  }

  /**
   * Resolves an entity instance, ensuring referential equality for the
   * same fully-qualified identity.
   *
   * The cache key is the COMPOSITE of all reference keys (e.g.
   * projectId + screenId), never just the last segment: the same screen
   * ID under two different projects must yield two distinct instances.
   *
   * Entities whose identity cannot be fully derived from the data are
   * returned UNCACHED — caching them under a partial or shared key
   * would alias unrelated instances.
   */
  resolve<T>(
    EntityClass: EntityClassRef<T>,
    referenceKeys: string[],
    data: any,
  ): T {
    const parsedValues: Record<string, string> = {};
    const lastKey = referenceKeys[referenceKeys.length - 1];

    if (typeof data === "string") {
      Object.assign(parsedValues, parseAllSegments(data));
      // Bare ID: it can only ever satisfy the last reference key
      if (lastKey && !parsedValues[lastKey]) {
        parsedValues[lastKey] = parseResourceName(data);
      }
    } else if (data && typeof data === "object") {
      if (typeof data.name === "string") {
        Object.assign(parsedValues, parseAllSegments(data.name));
      }
      // Explicit fields win over name-derived segments
      for (const key of referenceKeys) {
        if (data[key]) parsedValues[key] = data[key];
      }
      if (lastKey && !parsedValues[lastKey] && data.id) {
        parsedValues[lastKey] = data.id;
      }
      if (lastKey && !parsedValues[lastKey] && typeof data.name === "string") {
        parsedValues[lastKey] = parseResourceName(data.name);
      }
    }

    // Generated classes carry a static entityKey; EntityClass.name is the
    // fallback but is unsafe under minified consumer bundles.
    const entityKey: string =
      (EntityClass as any).entityKey ?? EntityClass.name;
    const keyValues = referenceKeys.map((k) => parsedValues[k]);
    const identifiable =
      referenceKeys.length > 0 &&
      keyValues.every((v) => typeof v === "string" && v.length > 0);

    if (!this.enabled) {
      return this.instantiate(EntityClass, referenceKeys, parsedValues, data);
    }

    if (!identifiable) {
      if (process.env.STITCH_DEBUG) {
        console.warn(
          `[stitch-sdk] EntityManager: could not derive full identity ` +
            `(${referenceKeys.join(", ")}) for ${entityKey}; ` +
            `returning uncached instance.`,
        );
      }
      return this.instantiate(EntityClass, referenceKeys, parsedValues, data);
    }

    const cacheKey = `${entityKey}:${JSON.stringify(keyValues)}`;

    if (this.cache.has(cacheKey)) {
      const instance = this.cache.get(cacheKey);
      if (data && typeof data === "object") {
        instance.data = mergeEntityData(instance.data, data);
      }
      return instance;
    }

    const instance = this.instantiate(
      EntityClass,
      referenceKeys,
      parsedValues,
      data,
    ) as any;
    this.cache.set(cacheKey, instance);
    return instance;
  }

  private instantiate<T>(
    EntityClass: EntityClassRef<T>,
    referenceKeys: string[],
    parsedValues: Record<string, string>,
    data: any,
  ): T {
    // Upgrade to the registered extension implementation when one exists
    const entityKey: string =
      (EntityClass as any).entityKey ?? EntityClass.name;
    const Impl = EntityManager.implementations.get(entityKey) ?? EntityClass;
    // Generated constructors are PROTECTED — the identity map is the one
    // sanctioned construction path. The cast is deliberate.
    const instance = new (Impl as new (...args: any[]) => any)(
      this.client,
      typeof data === "object" ? data : undefined,
    );
    for (const key of referenceKeys) {
      if (parsedValues[key]) {
        instance[key] = parsedValues[key];
      }
    }
    if (typeof instance.onCreate === "function") {
      instance.onCreate();
    }
    return instance;
  }

  /**
   * Disposes of a specific entity.
   */
  dispose(entity: any) {
    if (!entity) return;
    if (Array.isArray(entity.screens)) {
      for (const s of entity.screens) {
        if (s !== entity) this.dispose(s);
      }
    }
    if (typeof entity.onDispose === "function") {
      entity.onDispose();
    }
    for (const [key, val] of this.cache.entries()) {
      if (val === entity || (entity.first && val === entity.first)) {
        this.cache.delete(key);
        break;
      }
    }
  }

  /**
   * Clears the entire identity map cache.
   */
  clear() {
    for (const val of this.cache.values()) {
      if (typeof val.onDispose === "function") {
        val.onDispose();
      }
    }
    this.cache.clear();
  }
}
