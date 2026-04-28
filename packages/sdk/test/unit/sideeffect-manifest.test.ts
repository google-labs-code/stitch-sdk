import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = resolve(__dirname, '../..');

/**
 * Side-Effect Manifest Guard
 *
 * Validates the formal membrane between generated and handwritten code:
 * 1. Every method on an extension class must be declared in sideEffects
 * 2. Every sideEffect declaration must have a corresponding method
 * 3. No sideEffect method name can collide with a generated binding
 */
describe('Side-Effect Manifest Guard', () => {
  const domainMap = JSON.parse(
    readFileSync(resolve(SDK_ROOT, 'generated/domain-map.json'), 'utf-8'),
  );

  it('every method on an extension class must be declared as a sideEffect', () => {
    const violations: string[] = [];

    for (const [className, config] of Object.entries(domainMap.classes) as [string, any][]) {
      if (!config.extensionPath) continue;

      // Resolve the extension file
      const extAbsPath = resolve(SDK_ROOT, 'generated/src', config.extensionPath);
      const extTsPath = extAbsPath.replace(/\.js$/, '.ts');
      let extContent: string;
      try {
        extContent = readFileSync(extTsPath, 'utf-8');
      } catch {
        continue; // File doesn't exist — caught by ghost-method-guard
      }

      // If it's a passthrough re-export, skip
      if (!extContent.includes(`class ${className}`)) continue;

      // Extract method names from the extension class using method declaration patterns
      // Class methods appear as: `  async methodName(` or `  methodName(`
      // We exclude common keywords that could be false positives
      const KEYWORDS = new Set([
        'if', 'else', 'for', 'while', 'switch', 'case', 'return',
        'throw', 'try', 'catch', 'finally', 'new', 'typeof', 'delete',
      ]);
      const methodRegex = /^\s+(?:async\s+)?([a-zA-Z]\w*)\s*\(/gm;
      const extMethods: string[] = [];
      let match;
      while ((match = methodRegex.exec(extContent)) !== null) {
        const name = match[1];
        // Skip constructor, private methods, and language keywords
        if (name === 'constructor' || name.startsWith('_') || KEYWORDS.has(name)) continue;
        extMethods.push(name);
      }

      // Check each method is declared in sideEffects
      const declaredMethods = new Set(
        (config.sideEffects ?? []).map((se: any) => se.method),
      );

      for (const method of extMethods) {
        if (!declaredMethods.has(method)) {
          violations.push(
            `${className}.${method}() exists in extension but is NOT declared ` +
            `as a sideEffect in domain-map.json`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('every declared sideEffect must have a corresponding method on the extension', () => {
    const violations: string[] = [];

    for (const [className, config] of Object.entries(domainMap.classes) as [string, any][]) {
      if (!config.sideEffects?.length) continue;
      if (!config.extensionPath) {
        violations.push(
          `${className} has sideEffects but no extensionPath — nowhere to put them`,
        );
        continue;
      }

      const extAbsPath = resolve(SDK_ROOT, 'generated/src', config.extensionPath);
      const extTsPath = extAbsPath.replace(/\.js$/, '.ts');
      let extContent: string;
      try {
        extContent = readFileSync(extTsPath, 'utf-8');
      } catch {
        violations.push(
          `${className} declares sideEffects but extension file ${extTsPath} does not exist`,
        );
        continue;
      }

      for (const se of config.sideEffects as any[]) {
        // Check method exists in the extension file
        const methodPattern = new RegExp(`\\b${se.method}\\s*\\(`);
        if (!methodPattern.test(extContent)) {
          violations.push(
            `${className}.${se.method}() is declared as sideEffect but does NOT exist ` +
            `in the extension file`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('no sideEffect method name collides with a generated binding', () => {
    const violations: string[] = [];

    for (const [className, config] of Object.entries(domainMap.classes) as [string, any][]) {
      if (!config.sideEffects?.length) continue;

      const generatedMethods = new Set(
        domainMap.bindings
          .filter((b: any) => b.class === className)
          .map((b: any) => b.method),
      );

      for (const se of config.sideEffects as any[]) {
        if (generatedMethods.has(se.method)) {
          violations.push(
            `${className}.${se.method}() is declared as BOTH a generated binding ` +
            `AND a sideEffect — this would cause method shadowing`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
