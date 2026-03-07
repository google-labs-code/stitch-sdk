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

import swc from "@swc/core";

const HEX_COLOR_REGEX = /#[0-9A-Fa-f]{6}/g;

export interface ValidationResult {
  valid: boolean;
  hasPropsInterface: boolean;
  hardcodedHexValues: string[];
  hasDefaultExport: boolean;
  parseError?: string;
}

/**
 * Validates a React TSX component using SWC AST analysis.
 *
 * Adapted from the react-components skill's validate.js.
 * Checks:
 * - Has a TypeScript interface ending in `Props`
 * - No hardcoded hex color values in className attributes
 * - Has a default export
 */
export async function validateComponent(code: string): Promise<ValidationResult> {
  let ast: swc.Module;
  try {
    ast = await swc.parse(code, { syntax: "typescript", tsx: true });
  } catch (err: any) {
    return {
      valid: false,
      hasPropsInterface: false,
      hardcodedHexValues: [],
      hasDefaultExport: false,
      parseError: err.message,
    };
  }

  let hasPropsInterface = false;
  let hasDefaultExport = false;
  const hardcodedHexValues: string[] = [];

  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;

    // Check for *Props interface
    if (node.type === "TsInterfaceDeclaration" && node.id?.value?.endsWith("Props")) {
      hasPropsInterface = true;
    }

    // Check for hardcoded hex in className
    if (node.type === "JSXAttribute" && node.name?.value === "className") {
      const value = node.value;
      if (value?.type === "StringLiteral" && HEX_COLOR_REGEX.test(value.value)) {
        const matches = value.value.match(HEX_COLOR_REGEX);
        if (matches) hardcodedHexValues.push(...matches);
      }
      // Also check template literals
      if (value?.type === "JSXExpressionContainer") {
        const expr = value.expression;
        if (expr?.type === "TemplateLiteral") {
          for (const quasi of expr.quasis || []) {
            if (quasi.raw && HEX_COLOR_REGEX.test(quasi.raw)) {
              const matches = quasi.raw.match(HEX_COLOR_REGEX);
              if (matches) hardcodedHexValues.push(...matches);
            }
          }
        }
      }
    }

    // Check for default export
    if (node.type === "ExportDefaultExpression" || node.type === "ExportDefaultDeclaration") {
      hasDefaultExport = true;
    }

    // Recurse into all child properties
    for (const key in node) {
      const child = node[key];
      if (Array.isArray(child)) {
        child.forEach(walk);
      } else if (child && typeof child === "object") {
        walk(child);
      }
    }
  };

  walk(ast);

  const valid = hasPropsInterface && hardcodedHexValues.length === 0 && hasDefaultExport;

  return {
    valid,
    hasPropsInterface,
    hardcodedHexValues,
    hasDefaultExport,
  };
}
