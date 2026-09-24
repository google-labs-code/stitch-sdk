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

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "test/integration/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "generated/src/**/*.ts"],
      exclude: [
        "src/version.ts",
        "generated/src/tool-definitions.ts",
        "generated/src/types.generated.ts",
        "generated/src/responses.generated.ts",
      ],
      // Floors, not targets. The two most regression-prone modules are
      // held at 100% — both shipped subtle bugs that tests would have
      // caught [V1_PLAN §4.1].
      thresholds: {
        "src/entity-manager.ts": { lines: 100, functions: 100 },
        "src/spec/error-mapping.ts": { lines: 100, functions: 100 },
        lines: 70,
      },
    },
  },
});
