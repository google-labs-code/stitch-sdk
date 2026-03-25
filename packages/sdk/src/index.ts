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

// Domain classes (generated)
export { Stitch } from "../generated/src/stitch.js";
export { Project } from "../generated/src/project.js";
export { Screen } from "../generated/src/screen.js";

// Infrastructure (handwritten)
export { StitchToolClient } from "./client.js";
export { StitchProxy } from "./proxy/core.js";

// Singleton
export { stitch } from "./singleton.js";

// Error handling
export { StitchError, StitchErrorCode } from "./spec/errors.js";

// FIFE URL utilities
export { buildFifeSuffix, type FifeImageOptions } from "./fife.js";

// Tool catalog (generated)
export {
  toolDefinitions,
  type ToolDefinition,
  type ToolInputSchema,
  type ToolPropertySchema,
} from "../generated/src/tool-definitions.js";
export { toolMap, type ToolParam, type ToolInfo } from "./tool-map.js";

// Types (config + data interfaces)
export type { StitchConfig, StitchConfigInput } from "./spec/client.js";
export type {
  ProjectData,
  GenerateScreenParams,
  DesignTheme,
  ScreenInstance,
  ThumbnailScreenshot,
} from "./types.js";
