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

export class EntityManager {
  private cache = new Map<string, any>();
  private client: any;

  constructor(client: any) {
    this.client = client;
  }

  /**
   * Resolves an entity instance, ensuring referential equality for the same ID.
   * Logic is driven by the generated schema's reference keys.
   */
  resolve<T>(
    EntityClass: new (...args: any[]) => T,
    referenceKeys: string[],
    data: any,
  ): T {
    let canonicalId = "";
    const parsedValues: Record<string, string> = {};

    if (typeof data === "string") {
      canonicalId = parseResourceName(data);
      Object.assign(parsedValues, parseAllSegments(data));
      // Fallback if data is just the bare ID
      if (!parsedValues[referenceKeys[referenceKeys.length - 1]]) {
        parsedValues[referenceKeys[referenceKeys.length - 1]] = canonicalId;
      }
    } else if (data && typeof data === "object") {
      if (data.name) {
        canonicalId = parseResourceName(data.name);
        Object.assign(parsedValues, parseAllSegments(data.name));
      } else {
        // Fallback to reading the last reference key or 'id'
        const lastKey = referenceKeys[referenceKeys.length - 1];
        canonicalId = data[lastKey] || data.id || "";
      }

      // Populate keys from data
      for (const key of referenceKeys) {
        if (data[key]) {
          parsedValues[key] = data[key];
        }
      }

      // If the last key is still missing, fallback to id or canonicalId
      const lastKey = referenceKeys[referenceKeys.length - 1];
      if (!parsedValues[lastKey]) {
        parsedValues[lastKey] = data.id || canonicalId;
      }
    }

    if (!canonicalId) {
      // In cases where we just get an empty object or something, fallback
      canonicalId = "unknown";
    }

    const className = EntityClass.name;
    const cacheKey = `${className}:${canonicalId}`;

    if (this.cache.has(cacheKey)) {
      const instance = this.cache.get(cacheKey);
      if (data && typeof data === "object") {
        instance.data = { ...instance.data, ...data };
      }
      return instance;
    }

    // Direct instantiation is restricted for users, but allowed here
    const instance = new EntityClass(this.client, data) as any;

    // Assign reference keys dynamically based on parsed values
    for (const key of referenceKeys) {
      if (parsedValues[key]) {
        instance[key] = parsedValues[key];
      }
    }

    if (typeof instance.onCreate === "function") {
      instance.onCreate();
    }

    this.cache.set(cacheKey, instance);
    return instance;
  }

  /**
   * Disposes of a specific entity.
   */
  dispose(entity: any) {
    if (typeof entity.onDispose === "function") {
      entity.onDispose();
    }
    for (const [key, val] of this.cache.entries()) {
      if (val === entity) {
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
