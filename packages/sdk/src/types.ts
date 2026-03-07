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
