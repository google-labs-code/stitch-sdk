import { Stitch } from "../generated/src/stitch.js";
import { StitchToolClient } from "./client.js";

/** Lazily-initialized default Stitch instance */
let _stitch: Stitch | null = null;

function getStitchInstance(): Stitch {
  if (!_stitch) {
    const client = new StitchToolClient({
      apiKey: process.env.STITCH_API_KEY,
      baseUrl: process.env.STITCH_HOST || "https://stitch.googleapis.com/mcp",
    });
    _stitch = new Stitch(client);
  }
  return _stitch;
}

/**
 * Default Stitch instance using environment variables.
 * Lazily initialized on first access.
 * 
 * @example
 * import { stitch } from '@google/stitch-sdk';
 * const projects = await stitch.projects();
 */
export const stitch = new Proxy<Stitch>({} as Stitch, {
  get(_target, prop: string | symbol) {
    const instance = getStitchInstance();
    const value = instance[prop as keyof Stitch];
    // Bind methods to preserve `this` context
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});
