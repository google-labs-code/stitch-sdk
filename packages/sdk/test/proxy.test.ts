import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StitchProxy } from '../src/proxy/index.js';
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

// Mock fetch
const globalFetch = global.fetch;

describe('StitchProxy', () => {
  let mockFetch: any;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = globalFetch;
    vi.clearAllMocks();
  });

  it('should initialize with valid config', () => {
    const proxy = new StitchProxy({ apiKey: 'test-key' });
    expect(proxy).toBeDefined();
  });

  it('should throw if no API key is provided', () => {
    delete process.env.STITCH_API_KEY;
    expect(() => new StitchProxy({})).toThrow("StitchProxy requires an API key");
  });

  it('should connect to stitch and fetch tools on start', async () => {
    const proxy = new StitchProxy({ apiKey: 'test-key' });

    // Mock responses for initialize, initialized, and tools/list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { protocolVersion: '2024-11-05' } })
    } as Response); // initialize

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({})
    } as Response); // notifications/initialized (fire and forget, might not be awaited immediately but mocked anyway if called)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { tools: [{ name: 'test-tool' }] } })
    } as Response); // tools/list

    const mockTransport = {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      onmessage: undefined,
      onclose: undefined,
      onerror: undefined,
      send: vi.fn().mockResolvedValue(undefined)
    } as unknown as Transport;

    await proxy.start(mockTransport);

    // Expect 3 calls: initialize, notifications/initialized (which might complete quickly), and tools/list
    // Since notifications/initialized is fire-and-forget but we mock fetch, it counts if called.
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockTransport.start).toHaveBeenCalled();
  });
});
