import { describe, it, expect, vi } from 'vitest';
import { Stitch } from '../../generated/src/stitch.js';
import { StitchToolClient } from '../../src/client.js';

describe('SDK Extension Resolution', () => {
  it('should return instances containing handwritten extension methods', async () => {
    // 1. Mock the underlying client to prevent real network calls
    const mockClient = new StitchToolClient({ apiKey: 'fake' });
    vi.spyOn(mockClient, 'callTool').mockResolvedValue({
      projects: [{ name: 'projects/123' }]
    });

    // 2. Instantiate the Stitch entrypoint
    const stitch = new Stitch(mockClient);

    // 3. Call a generated method that returns Project instances
    const projects = await stitch.projects();
    const project = projects[0];

    // 4. Assert that the returned object is actually the extended subclass
    // By verifying the existence of the handwritten uploadImage method
    expect(project).toBeDefined();
    expect(typeof project!.uploadImage).toBe('function');
  });
});
