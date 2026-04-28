import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = resolve(__dirname, '../..');

describe('Ghost Method Guard: barrel exports vs domain-map extensionPath', () => {
  it('every domain class exported from a -ext file must have extensionPath in domain-map', () => {
    const indexContent = readFileSync(
      resolve(SDK_ROOT, 'src/index.ts'),
      'utf-8',
    );
    const domainMap = JSON.parse(
      readFileSync(resolve(SDK_ROOT, 'generated/domain-map.json'), 'utf-8'),
    );

    // Find all domain class exports that come from -ext files
    // Pattern: export { ClassName } from "./something-ext.js";
    const extExportRegex = /export\s+\{\s*(\w+)\s*\}\s+from\s+["'].\/(\w+-ext)\.js["']/g;
    const extExports: Array<{ className: string; extModule: string }> = [];
    let match;
    while ((match = extExportRegex.exec(indexContent)) !== null) {
      extExports.push({ className: match[1], extModule: match[2] });
    }

    // For each ext export, verify domain-map has extensionPath
    // Skip passthrough re-exports (files that don't define a class)
    const violations: string[] = [];
    for (const { className, extModule } of extExports) {
      // Read the ext file to check if it actually defines a class
      const extContent = readFileSync(
        resolve(SDK_ROOT, 'src', `${extModule}.ts`),
        'utf-8',
      );
      // If the file is just a re-export (no class definition), skip it
      if (!extContent.includes(`class ${className}`)) continue;

      const classConfig = domainMap.classes?.[className];
      if (!classConfig) {
        violations.push(
          `${className} exported from ${extModule}.js but not found in domain-map.json classes`,
        );
        continue;
      }
      if (!classConfig.extensionPath) {
        violations.push(
          `${className} exported from ${extModule}.js but domain-map.json has no extensionPath — ` +
          `generator will instantiate base class, causing "method is not a function" at runtime`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it('every extensionPath in domain-map must point to an existing file', () => {
    const domainMap = JSON.parse(
      readFileSync(resolve(SDK_ROOT, 'generated/domain-map.json'), 'utf-8'),
    );

    const violations: string[] = [];
    for (const [className, config] of Object.entries(domainMap.classes) as [string, any][]) {
      if (config.extensionPath) {
        // extensionPath is relative to generated/src/, resolve from there
        const absPath = resolve(SDK_ROOT, 'generated/src', config.extensionPath);
        // Convert .js to .ts for source check
        const tsPath = absPath.replace(/\.js$/, '.ts');
        try {
          readFileSync(tsPath);
        } catch {
          violations.push(
            `${className} has extensionPath "${config.extensionPath}" but file does not exist at ${tsPath}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('every generated file importing an extension must reference a valid extensionPath class', () => {
    const domainMap = JSON.parse(
      readFileSync(resolve(SDK_ROOT, 'generated/domain-map.json'), 'utf-8'),
    );

    // Collect all extensionPath values from domain-map
    const extensionPaths = new Set<string>();
    for (const config of Object.values(domainMap.classes) as any[]) {
      if (config.extensionPath) {
        extensionPaths.add(config.extensionPath);
      }
    }

    // Read each generated file and verify any ../../src/ imports match an extensionPath
    const { readdirSync } = require('node:fs');
    const generatedDir = resolve(SDK_ROOT, 'generated/src');
    const generatedFiles = readdirSync(generatedDir)
      .filter((f: string) => f.endsWith('.ts') && !f.endsWith('.d.ts'));

    const violations: string[] = [];
    for (const file of generatedFiles) {
      const content = readFileSync(resolve(generatedDir, file), 'utf-8');
      const srcImports = content.match(/from\s+["'](\.\.\/\.\.\/src\/[^"']+)["']/g) || [];
      for (const imp of srcImports) {
        const match = imp.match(/from\s+["'](\.\.\/\.\.\/src\/[^"']+)["']/);
        if (match) {
          const importPath = match[1];
          // Skip non-ext imports (client, errors, etc.)
          if (!importPath.includes('-ext')) continue;
          if (!extensionPaths.has(importPath)) {
            violations.push(
              `generated/src/${file} imports "${importPath}" but this is not registered as an extensionPath in domain-map.json`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
