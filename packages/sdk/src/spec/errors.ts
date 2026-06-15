import { z } from "zod";

/**
 * Exhaustive error codes for Stitch operations.
 * Add new codes here as needed.
 */
export const StitchErrorCode = z.enum([
  "AUTH_FAILED",
  "NOT_FOUND",
  "PERMISSION_DENIED",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "NETWORK_ERROR",
  "VALIDATION_ERROR",
  "CLIENT_CLOSED",
  "UNKNOWN_ERROR",
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
  /** HTTP status, when the failure came from an HTTP response. */
  status?: number;
  /** MCP tool name, when the failure came from a tool call. */
  toolName?: string;
  /** Delay in milliseconds requested by the server before retrying. */
  retryAfter?: number;
  raw?: unknown;
}

/**
 * Throwable error class for the public API.
 * Extends Error so it works with try/catch and instanceof checks.
 */
export class StitchError extends Error {
  public readonly code: StitchErrorCode;
  public readonly suggestion?: string;
  public readonly recoverable: boolean;
  /** HTTP status, when the failure came from an HTTP response. */
  public readonly status?: number;
  /** MCP tool name, when the failure came from a tool call. */
  public readonly toolName?: string;
  /** Delay in milliseconds requested by the server before retrying. */
  public readonly retryAfter?: number;
  public readonly raw?: unknown;

  constructor(data: StitchErrorData) {
    super(data.message);
    this.name = "StitchError";
    this.code = data.code;
    this.suggestion = data.suggestion;
    this.recoverable = data.recoverable;
    this.status = data.status;
    this.toolName = data.toolName;
    this.retryAfter = data.retryAfter;
    this.raw = data.raw;
  }

  /**
   * Create a StitchError from an unknown caught error.
   */
  static fromUnknown(error: unknown): StitchError {
    if (error instanceof StitchError) return error;
    return new StitchError({
      code: "UNKNOWN_ERROR",
      message: error instanceof Error ? error.message : String(error),
      recoverable: false,
    });
  }
}
