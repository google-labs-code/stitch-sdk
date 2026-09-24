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
export { Stitch } from "../generated/src/stitch.js";
export { Project } from "./project-ext.js"; // Extended: includes upload(), downloadAssets()
export { Screen } from "./screen-ext.js"; // Extended: getHtml()/getImage() fetch content; URL accessors are generated
export { DesignSystem } from "../generated/src/designsystem.js";
export { Generation } from "./generation.js";

// Infrastructure (handwritten)
export { StitchToolClient } from "./client.js";
export { StitchProxy } from "./proxy/core.js";

// Virtual Tools
export { downloadAssetsTool } from "./proxy/virtual-tools.js";
export type { VirtualToolDefinition } from "./spec/client.js";

// Singleton
export { stitch, resetStitchSingleton } from "./singleton.js";

// Error handling
export { StitchError, StitchErrorCode } from "./spec/errors.js";

// Resource name utilities
export { parseResourceName } from "./utils.js";

// Tool catalog (re-exported with deprecation for 0.4.0 bridge; preferred subpath is @google/stitch-sdk/tools)
/** @deprecated Import from "@google/stitch-sdk/tools" to optimize bundle size. */
export { toolDefinitions, toolMap } from "./tools.js";

// Types (config + data interfaces)
export type { StitchConfig, StitchConfigInput } from "./spec/client.js";
export type { StitchProxyConfig } from "./spec/proxy.js";
export type { ProjectData, ThumbnailScreenshot } from "./types.js";

// Generated tool I/O types — the types public method signatures use
// (VariantOptions, DesignSystemInput, SelectedScreenInstance, every
// *Response, ...). Consumers must be able to NAME argument types.
export type * from "../generated/src/types.generated.js";
export type * from "../generated/src/responses.generated.js";

// Upload types
export type {
  UploadInput,
  UploadResult,
  UploadErrorCode,
} from "./spec/upload.js";

// Download types
export type {
  DownloadAssetsInput,
  DownloadAssetsOutput,
  DownloadAssetsResult,
  DownloadedScreenTrace,
  DownloadAssetsErrorCode,
} from "./spec/download.js";
