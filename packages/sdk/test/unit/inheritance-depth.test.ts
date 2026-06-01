import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = resolve(__dirname, "../..");

describe("Inheritance Depth: extension imports in ALL generated files", () => {
  it("every generated file must import the extension class (not base) when extensionPath exists", () => {
    const domainMap = JSON.parse(
      readFileSync(resolve(SDK_ROOT, "generated/domain-map.json"), "utf-8"),
    );

    // Build lookup: className → extensionPath (only for classes with extensions)
    const extensionMap = new Map<string, string>();
    for (const [className, config] of Object.entries(domainMap.classes) as [
      string,
      any,
    ][]) {
      if (config.extensionPath) {
        extensionMap.set(className, config.extensionPath);
      }
    }

    if (extensionMap.size === 0) {
      // Nothing to test if no extensions registered
      return;
    }

    // Scan each generated file for class imports
    const generatedDir = resolve(SDK_ROOT, "generated/src");
    const generatedFiles = readdirSync(generatedDir).filter(
      (f) =>
        f.endsWith(".ts") &&
        !f.endsWith(".d.ts") &&
        f !== "index.ts" &&
        f !== "tool-definitions.ts",
    );

    const violations: string[] = [];

    for (const file of generatedFiles) {
      const content = readFileSync(resolve(generatedDir, file), "utf-8");

      for (const [className, extPath] of extensionMap) {
        // Check if this file imports the class from its LOCAL base (e.g., ./project.js)
        // instead of from the extension path
        const baseImportPattern = new RegExp(
          `import\\s+\\{[^}]*\\b${className}\\b[^}]*\\}\\s+from\\s+["']\\.\\/${className.toLowerCase()}\\.js["']`,
        );

        if (baseImportPattern.test(content)) {
          // This generated file imports the base class directly
          // It should import from the extension path instead
          violations.push(
            `generated/src/${file} imports ${className} from local base ` +
              `(./${className.toLowerCase()}.js) but should use extensionPath (${extPath})`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
