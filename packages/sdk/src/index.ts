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

// Domain classes
export { Stitch } from "./stitch-ext.js";
export { Project } from "./project-ext.js";  // Extended: includes uploadImage(), downloadAssets()
export { Screen } from "../generated/src/screen.js";
export { DesignSystem } from "../generated/src/designsystem.js";


// Infrastructure (handwritten)
export { StitchToolClient } from "./client.js";
export { StitchProxy } from "./proxy/core.js";

// Virtual Tools
export {
  downloadAssetsTool,
} from "./proxy/virtual-tools.js";
export type { VirtualToolDefinition } from "./spec/client.js";

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
export { StitchProxyConfigSchema } from "./spec/proxy.js";
export type {
  ProjectData,
  GenerateScreenParams,
  DesignTheme,
  ScreenInstance,
  ThumbnailScreenshot,
} from "./types.js";

// Upload types
export type {
  UploadImageInput,
  UploadImageResult,
  UploadImageErrorCode,
} from "./spec/upload.js";

// Download types
export type {
  DownloadAssetsInput,
  DownloadAssetsOutput,
  DownloadAssetsResult,
  DownloadedScreenTrace,
  DownloadAssetsErrorCode,
} from "./spec/download.js";
