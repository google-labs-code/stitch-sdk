import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = resolve(__dirname, "../..");

/**
 * Circular Dependency Guard
 *
 * The extension files in src/ (e.g., project-ext.ts) are imported by
 * generated files in generated/src/ (e.g., stitch.ts via extensionPath).
 * If an extension file imports back from a generated file that consumes it,
 * this creates a circular dependency that can cause ReferenceError at runtime.
 *
 * Allowed: project-ext.ts → generated/src/project.ts (its own base class)
 * Forbidden: project-ext.ts → generated/src/stitch.ts (its consumer)
 */
describe("Circular Dependency Guard", () => {
  it("extension files must not import from generated files that consume them", () => {
    // Step 1: Identify which generated files import which extensions
    const generatedDir = resolve(SDK_ROOT, "generated/src");
    const generatedFiles = readdirSync(generatedDir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".d.ts"),
    );

    // Build a map: extension path → list of generated files that import it
    const consumers = new Map<string, string[]>();

    for (const file of generatedFiles) {
      const content = readFileSync(resolve(generatedDir, file), "utf-8");
      // Find imports from ../../src/*-ext.js
      const extImports =
        content.match(/from\s+["']\.\.\/\.\.\/src\/([^"']+)["']/g) || [];
      for (const imp of extImports) {
        const match = imp.match(/from\s+["']\.\.\/\.\.\/src\/([^"']+)["']/);
        if (match) {
          const extPath = match[1].replace(".js", ".ts");
          const list = consumers.get(extPath) || [];
          list.push(file);
          consumers.set(extPath, list);
        }
      }
    }

    // Step 2: For each extension file, verify it doesn't import its consumers
    const violations: string[] = [];

    for (const [extFile, consumerFiles] of consumers) {
      const extPath = resolve(SDK_ROOT, "src", extFile);
      let extContent: string;
      try {
        extContent = readFileSync(extPath, "utf-8");
      } catch {
        continue; // file doesn't exist, skip
      }

      for (const consumer of consumerFiles) {
        // Check if the extension imports the consuming generated file
        const consumerBase = consumer.replace(".ts", "");
        // Look for imports from generated/src/<consumer>
        const patterns = [
          `../generated/src/${consumerBase}`,
          `../../generated/src/${consumerBase}`,
        ];
        for (const pattern of patterns) {
          if (extContent.includes(pattern)) {
            violations.push(
              `CIRCULAR: src/${extFile} imports generated/src/${consumer}, ` +
                `but generated/src/${consumer} imports src/${extFile}`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("extension files must not import from singleton.ts", () => {
    // The singleton imports the Stitch class which imports extensions.
    // Any extension importing singleton creates a guaranteed deadlock.
    const srcDir = resolve(SDK_ROOT, "src");
    const extFiles = readdirSync(srcDir).filter((f) => f.endsWith("-ext.ts"));

    const violations: string[] = [];
    for (const file of extFiles) {
      const content = readFileSync(resolve(srcDir, file), "utf-8");
      if (
        content.includes("./singleton") ||
        content.includes("../src/singleton")
      ) {
        violations.push(
          `src/${file} imports singleton.ts — creates circular dependency`,
        );
      }
    }

    expect(violations).toEqual([]);
  });
});
