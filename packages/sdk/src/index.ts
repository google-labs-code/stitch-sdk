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

// Types (config + data interfaces)
export type { StitchConfig, StitchConfigInput } from "./spec/client.js";
export type {
  ProjectData,
  GenerateScreenParams,
  DesignTheme,
  ScreenInstance,
  ThumbnailScreenshot,
} from "./types.js";
