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

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contract tests: ensure example files use correct API field names.
 * These are static analysis tests — they parse example source code
 * and verify correctness without executing against the live API.
 */
describe("Example Contract Tests", () => {
  const examplesDir = resolve(import.meta.dirname, "../../examples");

  describe("generate-variants.ts", () => {
    const source = readFileSync(
      resolve(examplesDir, "generate-variants.ts"),
      "utf8"
    );

    it("should use 'variantCount' not 'numVariants' in variantOptions", () => {
      // The API schema (VariantOptions) uses 'variantCount', not 'numVariants'.
      expect(source).not.toContain("numVariants");
      expect(source).toContain("variantCount");
    });
  });
});
