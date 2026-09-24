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

/**
 * Tool catalog entry point: `@google/stitch-sdk/tools` [V1_PLAN §3.8].
 *
 * The static tool definitions are ~2K lines of inlined JSON schema.
 * They live behind this subpath so the ROOT entry stays lean — most
 * consumers never need the raw catalog (the AI/ADK adapters import it
 * directly themselves).
 */

export {
  toolDefinitions,
  type ToolDefinition,
  type ToolInputSchema,
  type ToolPropertySchema,
} from "../generated/src/tool-definitions.js";
export { toolMap, type ToolParam, type ToolInfo } from "./tool-map.js";
