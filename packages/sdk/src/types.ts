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

export { StitchConfig, StitchConfigInput, StitchConfigSchema } from './spec/client.js';

export interface ThumbnailScreenshot {
  name: string;
  downloadUrl: string;
}

export interface DesignTheme {
  colorMode?: string;
  font?: string;
  roundness?: string;
  customColor?: string;
  saturation?: number;
}

export interface ScreenInstance {
  id: string;
  sourceScreen: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export interface ProjectData {
  name: string;
  title?: string;
  visibility: string;
  createTime: string;
  updateTime: string;
  projectType?: string;
  origin?: string;
  deviceType?: string;
  thumbnailScreenshot?: ThumbnailScreenshot;
  designTheme: DesignTheme;
  screenInstances?: ScreenInstance[];
}

export interface GenerateScreenParams {
  prompt: string;
  deviceType?: "MOBILE" | "DESKTOP" | "DEVICE_TYPE_UNSPECIFIED";
}
