import { z } from 'zod';

/**
 * Exhaustive error codes for Stitch operations.
 * Add new codes here as needed.
 */
export const StitchErrorCode = z.enum([
  'AUTH_FAILED',
  'NOT_FOUND',
  'PERMISSION_DENIED',
  'RATE_LIMITED',
  'NETWORK_ERROR',
  'VALIDATION_ERROR',
  'UNKNOWN_ERROR',
]);

export type StitchErrorCode = z.infer<typeof StitchErrorCode>;

/**
 * Structured error data for internal Result types.
 */
export interface StitchErrorData {
  code: StitchErrorCode;
  message: string;
  suggestion?: string;
  recoverable: boolean;
}

/**
 * Throwable error class for the public API.
 * Extends Error so it works with try/catch and instanceof checks.
 */
export class StitchError extends Error {
  public readonly code: StitchErrorCode;
  public readonly suggestion?: string;
  public readonly recoverable: boolean;

  constructor(data: StitchErrorData) {
    super(data.message);
    this.name = 'StitchError';
    this.code = data.code;
    this.suggestion = data.suggestion;
    this.recoverable = data.recoverable;
  }

/**
 * Create a StitchError from an unknown caught error.
 */
  static fromUnknown(error: unknown): StitchError {
    if (error instanceof StitchError) return error;
    return new StitchError({
      code: 'UNKNOWN_ERROR',
      message: error instanceof Error ? error.message : String(error),
      recoverable: false,
    });
  }
}
