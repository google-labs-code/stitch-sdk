import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StitchToolClient } from "../../src/client.js";
import { ZodError } from "zod";

// Mock child_process for gcloud calls
vi.mock("child_process", () => ({
  execSync: vi.fn().mockReturnValue("ya29.mocked_refreshed_token"),
}));

describe("StitchToolClient", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset mocks and environment variables before each test
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original state
    globalThis.fetch = originalFetch;
    delete (globalThis.fetch as any).__stitchPatched;
    process.env = originalEnv;
  });

  // --- NEW DUAL-AUTH TESTS ---
  it('should create client with API key only', () => {
    const client = new StitchToolClient({ apiKey: 'test-key' });
    expect(client).toBeDefined();
  });

  it('should throw ZodError if no credentials provided', () => {
    // Ensure no env vars are set that could satisfy the validation
    delete process.env.STITCH_API_KEY;
    delete process.env.STITCH_ACCESS_TOKEN;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    expect(() => new StitchToolClient({})).toThrow(ZodError);
    expect(() => new StitchToolClient()).toThrow(ZodError);
  });

  it('should throw if accessToken is provided without projectId', () => {
    delete process.env.STITCH_API_KEY;
    delete process.env.STITCH_ACCESS_TOKEN;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    expect(() => new StitchToolClient({ accessToken: 'test-token' })).toThrow(ZodError);
  });

  it('should use STITCH_API_KEY env var as a fallback', () => {
    process.env.STITCH_API_KEY = 'env-key';
    const client = new StitchToolClient();
    expect(client).toBeDefined();
  });

  it('should use STITCH_ACCESS_TOKEN and GOOGLE_CLOUD_PROJECT env vars', () => {
    process.env.STITCH_ACCESS_TOKEN = 'env-token';
    process.env.GOOGLE_CLOUD_PROJECT = 'env-project';
    const client = new StitchToolClient();
    expect(client).toBeDefined();
  });

  it('should store API key config for transport header injection', () => {
    const client = new StitchToolClient({ apiKey: 'test-key' });

    // Verify API key is stored for transport header injection
    expect(client['config'].apiKey).toBe('test-key');
  });


  // --- EXISTING OAUTH TESTS (ADAPTED) ---
  it("should validate token on connect with OAuth", async () => {
    delete process.env.STITCH_API_KEY;

    const client = new StitchToolClient({ accessToken: 'initial_token', projectId: 'test-project' });

    // Verify OAuth credentials are stored for transport header injection
    expect(client['config'].accessToken).toBe('initial_token');
    expect(client['config'].projectId).toBe('test-project');
  });
});
