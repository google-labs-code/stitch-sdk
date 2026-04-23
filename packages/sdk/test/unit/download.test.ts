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

import { describe, it, expect, vi } from 'vitest';
import { DownloadAssetsHandler, sanitizeFilename } from '../../src/download-handler.js';

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...real,
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  };
});

describe('DownloadAssetsHandler', () => {
  it('can be instantiated', () => {
    const handler = new DownloadAssetsHandler({} as any);
    expect(handler).toBeDefined();
  });

  it('sanitizes asset filenames', async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockClear();
    
    const mockClient = {
      callTool: vi.fn().mockResolvedValue({
        screens: [{ id: 's1', name: 'projects/p1/screens/s1' }] // Mock screen object
      }),
    } as any;
    
    // Wait, getHtml is a method on Screen class in generated code!
    // If I mock callTool('list_screens') it returns raw objects!
    const mockScreen = {
      id: 's1',
      htmlCode: { downloadUrl: 'http://fake/s1.html' }
    };
    mockClient.callTool.mockResolvedValue({ screens: [mockScreen] });

    const mockFetch = vi.fn().mockImplementation((url) => {
      if (url === 'http://fake/s1.html') {
        return Promise.resolve({ text: () => Promise.resolve('<html><img src="http://example.com/bad name.png"></html>') });
      }
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    });
    vi.stubGlobal('fetch', mockFetch);

    const handler = new DownloadAssetsHandler(mockClient);
    await handler.execute({ projectId: 'p1', outputDir: '/tmp/out' });

    // Temp paths contain only random bytes — the sanitized filename only appears in rename dest.
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.tmp-'),
      expect.any(Object),
      expect.objectContaining({ flag: 'wx', mode: 0o600 })
    );

    expect(fs.rename).toHaveBeenCalledWith(
      expect.stringContaining('.tmp-'),
      expect.stringContaining('badname')
    );
  });

  it('prevents directory traversal', async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    vi.mocked(fs.writeFile).mockClear();
    
    const mockClient = {
      callTool: vi.fn().mockResolvedValue({
        screens: [{ id: 's1', name: 'projects/p1/screens/s1' }]
      }),
    } as any;
    
    const mockScreen = {
      id: 's1',
      getHtml: vi.fn().mockResolvedValue('http://fake/s1.html'),
    };
    mockClient.callTool.mockResolvedValue({ screens: [mockScreen] });

    const mockFetch = vi.fn().mockImplementation((url) => {
      if (url === 'http://fake/s1.html') {
        return Promise.resolve({ text: () => Promise.resolve('<html><img src="http://example.com/%2e%2e/etc/passwd"></html>') });
      }
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    });
    vi.stubGlobal('fetch', mockFetch);

    const handler = new DownloadAssetsHandler(mockClient);
    await handler.execute({ projectId: 'p1', outputDir: '/tmp/out' });

    const calls = vi.mocked(fs.writeFile).mock.calls;
    for (const [filePath] of calls) {
      expect(typeof filePath).toBe('string');
      if (typeof filePath === 'string') {
        if (filePath.includes('/assets/')) {
          expect(filePath).toContain('/tmp/out/s1/assets/');
          const filename = path.basename(filePath);
          expect(filename).not.toContain('..');
        } else {
          expect(filePath).toBe('/tmp/out/s1/code.html');
        }
      }
    }
  });

  it('returns failure if list_screens fails', async () => {
    const mockClient = {
      callTool: vi.fn().mockRejectedValue(new Error('API Error')),
    } as any;

    const handler = new DownloadAssetsHandler(mockClient);
    const result = await handler.execute({ projectId: 'p1', outputDir: '/tmp/out' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNKNOWN_ERROR');
    }
  });

  it('respects custom fileMode option', async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockClear();

    const mockClient = { callTool: vi.fn() } as any;
    const mockScreen = { id: 's1', htmlCode: { downloadUrl: 'http://fake/s1.html' } };
    mockClient.callTool.mockResolvedValue({ screens: [mockScreen] });

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url === 'http://fake/s1.html') {
        return Promise.resolve({ text: () => Promise.resolve('<html></html>') });
      }
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    }));

    const handler = new DownloadAssetsHandler(mockClient);
    await handler.execute({ projectId: 'p1', outputDir: '/tmp/out', fileMode: 0o644 });

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ mode: 0o644 })
    );
  });

  it('uses custom assetsSubdir option', async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.mkdir).mockClear();
    vi.mocked(fs.writeFile).mockClear();

    const mockClient = { callTool: vi.fn() } as any;
    const mockScreen = {
      id: 's1',
      htmlCode: { downloadUrl: 'http://fake/s1.html' }
    };
    mockClient.callTool.mockResolvedValue({ screens: [mockScreen] });

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url === 'http://fake/s1.html') {
        return Promise.resolve({ text: () => Promise.resolve('<html><img src="http://example.com/img.png"></html>') });
      }
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    }));

    const handler = new DownloadAssetsHandler(mockClient);
    await handler.execute({ projectId: 'p1', outputDir: '/tmp/out', assetsSubdir: 'static' });

    expect(fs.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('static'),
      expect.anything()
    );
  });

  it('uses custom tempDir for atomic temp files', async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockClear();
    vi.mocked(fs.rename).mockClear();

    const mockClient = { callTool: vi.fn() } as any;
    const mockScreen = { id: 's1', htmlCode: { downloadUrl: 'http://fake/s1.html' } };
    mockClient.callTool.mockResolvedValue({ screens: [mockScreen] });

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url === 'http://fake/s1.html') {
        return Promise.resolve({ text: () => Promise.resolve('<html></html>') });
      }
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    }));

    const handler = new DownloadAssetsHandler(mockClient);
    await handler.execute({ projectId: 'p1', outputDir: '/tmp/out', tempDir: '/custom/tmp' });

    // Temp writes go to /custom/tmp, final rename targets go to /tmp/out
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('/custom/tmp/'),
      expect.anything(),
      expect.objectContaining({ flag: 'wx' })
    );
    expect(fs.rename).toHaveBeenCalledWith(
      expect.stringContaining('/custom/tmp/'),
      expect.stringContaining('/tmp/out/')
    );
  });

  it('extracts screen ID from name if id is missing', async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.rename).mockClear();

    const mockClient = {
      callTool: vi.fn().mockResolvedValue({
        screens: [{ name: 'projects/p1/screens/s123', htmlCode: { downloadUrl: 'http://fake/s123.html' } }]
      }),
    } as any;

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      return Promise.resolve({ text: () => Promise.resolve('<html></html>') });
    }));

    const handler = new DownloadAssetsHandler(mockClient);
    await handler.execute({ projectId: 'p1', outputDir: '/tmp/out' });

    expect(fs.rename).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('/tmp/out/s123/code.html')
    );
  });

  it('downloads screenshot if available', async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockClear();
    vi.mocked(fs.rename).mockClear();

    const mockClient = { callTool: vi.fn() } as any;
    const mockScreen = { 
      id: 's1', 
      htmlCode: { downloadUrl: 'http://fake/s1.html' },
      screenshot: { downloadUrl: 'http://fake/s1.png' }
    };
    mockClient.callTool.mockResolvedValue({ screens: [mockScreen] });

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => {
      if (url === 'http://fake/s1.html') {
        return Promise.resolve({ text: () => Promise.resolve('<html></html>') });
      }
      if (url === 'http://fake/s1.png') {
        return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
      }
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    }));

    const handler = new DownloadAssetsHandler(mockClient);
    await handler.execute({ projectId: 'p1', outputDir: '/tmp/out' });

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.tmp-screen-'),
      expect.any(Buffer),
      expect.any(Object)
    );
    
    expect(fs.rename).toHaveBeenCalledWith(
      expect.stringContaining('.tmp-screen-'),
      expect.stringContaining('/tmp/out/s1/screen.png')
    );
  });

  it('exports design system if available', async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockClear();
    vi.mocked(fs.rename).mockClear();
    vi.mocked(fs.mkdir).mockClear();

    const mockClient = { callTool: vi.fn() } as any;
    mockClient.callTool.mockImplementation((tool: string, args: Record<string, unknown>) => {
      if (tool === 'list_screens') {
        return Promise.resolve({ screens: [] });
      }
      if (tool === 'list_design_systems') {
        return Promise.resolve({
          designSystems: [
            {
              name: 'assets/ds1',
              designSystem: {
                displayName: 'My Design System',
                theme: {
                  designMd: '# High Contrast Design'
                }
              }
            }
          ]
        });
      }
      return Promise.resolve({});
    });

    const handler = new DownloadAssetsHandler(mockClient);
    await handler.execute({ projectId: 'p1', outputDir: '/tmp/out' });

    expect(fs.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/out/my_design_system'),
      expect.anything()
    );

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('.tmp-ds-'),
      '# High Contrast Design',
      expect.any(Object)
    );

    expect(fs.rename).toHaveBeenCalledWith(
      expect.stringContaining('.tmp-ds-'),
      expect.stringContaining('/tmp/out/my_design_system/DESIGN.md')
    );
  });

  it('returns a detailed trace of downloaded screens in result', async () => {
    const mockClient = {
      callTool: vi.fn().mockResolvedValue({
        screens: [{ id: 's1', title: 'Home Screen', htmlCode: { downloadUrl: 'http://fake/s1.html' } }]
      }),
    } as any;

    const mockFetch = vi.fn().mockImplementation((_url) => {
      return Promise.resolve({ text: () => Promise.resolve('<html></html>') });
    });
    vi.stubGlobal('fetch', mockFetch);

    const handler = new DownloadAssetsHandler(mockClient);
    const result = await handler.execute({ projectId: 'p1', outputDir: '/tmp/out' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.downloadedScreens).toEqual([
      {
        screenId: 's1',
        screenSlug: 'home_screen',
        filePath: 'home_screen/code.html',
      }
    ]);
  });
});


describe('sanitizeFilename', () => {
  it('removes special characters', () => {
    const result = sanitizeFilename('bad name!@#$%^&*().png', '.png');
    expect(result).toBe('badname');
  });

  it('keeps alphanumeric, hyphen, and underscore', () => {
    const result = sanitizeFilename('good-name_123.png', '.png');
    expect(result).toBe('good-name_123');
  });

  it('slices to 100 characters', () => {
    const longName = 'a'.repeat(150) + '.png';
    const result = sanitizeFilename(longName, '.png');
    expect(result.length).toBe(100);
    expect(result).toBe('a'.repeat(100));
  });

  it('handles empty base name after sanitization', () => {
    const result = sanitizeFilename('!!!.png', '.png');
    expect(result).toBe('');
  });
});

describe('DownloadAssetsHandler warnings', () => {
  it('collects warning for failed screenshot download', async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockClear();
    vi.mocked(fs.rename).mockClear();
    vi.mocked(fs.mkdir).mockClear();

    const mockClient = { callTool: vi.fn() } as any;
    mockClient.callTool.mockImplementation((tool: string) => {
      if (tool === 'list_screens') {
        return Promise.resolve({
          screens: [{
            id: 's1',
            htmlCode: { downloadUrl: 'http://fake/s1.html' },
            screenshot: { downloadUrl: 'http://fake/screenshot.png' }
          }]
        });
      }
      if (tool === 'list_design_systems') {
        return Promise.resolve({ designSystems: [] });
      }
      return Promise.resolve({});
    });

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === 'http://fake/s1.html') {
        return Promise.resolve({ text: () => Promise.resolve('<html><body>Hello</body></html>') });
      }
      if (url === 'http://fake/screenshot.png') {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    }));

    const handler = new DownloadAssetsHandler(mockClient);
    const result = await handler.execute({ projectId: 'p1', outputDir: '/tmp/out' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
      expect(result.warnings![0].toLowerCase()).toContain('screenshot');
    }
  });

  it('collects warning when design system export fails', async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockClear();
    vi.mocked(fs.rename).mockClear();
    vi.mocked(fs.mkdir).mockClear();

    const mockClient = { callTool: vi.fn() } as any;
    mockClient.callTool.mockImplementation((tool: string) => {
      if (tool === 'list_screens') {
        return Promise.resolve({ screens: [] });
      }
      if (tool === 'list_design_systems') {
        return Promise.reject(new Error('API unavailable'));
      }
      return Promise.resolve({});
    });

    const handler = new DownloadAssetsHandler(mockClient);
    const result = await handler.execute({ projectId: 'p1', outputDir: '/tmp/out' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.toLowerCase().includes('design system'))).toBe(true);
    }
  });
});

describe('DownloadAssetsHandler concurrency', () => {
  it('limits concurrent asset fetches to CONCURRENCY_LIMIT', async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockClear();
    vi.mocked(fs.rename).mockClear();
    vi.mocked(fs.mkdir).mockClear();

    // Build HTML with 10 images
    const imgTags = Array.from({ length: 10 }, (_, i) =>
      `<img src="http://cdn.example.com/asset-${i}.png">`
    ).join('');
    const html = `<html><body>${imgTags}</body></html>`;

    const mockClient = { callTool: vi.fn() } as any;
    mockClient.callTool.mockImplementation((tool: string) => {
      if (tool === 'list_screens') {
        return Promise.resolve({
          screens: [{ id: 's1', htmlCode: { downloadUrl: 'http://fake/s1.html' } }]
        });
      }
      if (tool === 'list_design_systems') {
        return Promise.resolve({ designSystems: [] });
      }
      return Promise.resolve({});
    });

    let active = 0;
    let peak = 0;

    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url === 'http://fake/s1.html') {
        return { text: () => Promise.resolve(html) };
      }
      // Asset fetch — track concurrency
      active++;
      peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 20));
      active--;
      return { arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
    }));

    const handler = new DownloadAssetsHandler(mockClient);
    await handler.execute({ projectId: 'p1', outputDir: '/tmp/out' });

    expect(peak).toBeLessThanOrEqual(5);
  });
});

describe('Project.downloadAssets() facade', () => {
  it('surfaces warnings from handler in result', async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockClear();
    vi.mocked(fs.rename).mockClear();
    vi.mocked(fs.mkdir).mockClear();

    const { Project } = await import('../../src/project-ext.js');

    const mockClient = { callTool: vi.fn(), httpPost: vi.fn() } as any;
    mockClient.callTool.mockImplementation((tool: string) => {
      if (tool === 'list_screens') {
        return Promise.resolve({
          screens: [{
            id: 's1',
            htmlCode: { downloadUrl: 'http://fake/s1.html' },
            screenshot: { downloadUrl: 'http://fake/screenshot.png' }
          }]
        });
      }
      if (tool === 'list_design_systems') {
        return Promise.resolve({ designSystems: [] });
      }
      return Promise.resolve({});
    });

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url === 'http://fake/s1.html') {
        return Promise.resolve({ text: () => Promise.resolve('<html><body>Hello</body></html>') });
      }
      if (url === 'http://fake/screenshot.png') {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    }));

    const project = new Project(mockClient, 'p1');
    const result = await project.downloadAssets('/tmp/out');

    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].toLowerCase()).toContain('screenshot');
    expect(result.screens.length).toBe(1);
  });

  it('returns empty warnings array on clean run', async () => {
    const fs = await import("node:fs/promises");
    vi.mocked(fs.writeFile).mockClear();
    vi.mocked(fs.rename).mockClear();
    vi.mocked(fs.mkdir).mockClear();

    const { Project } = await import('../../src/project-ext.js');

    const mockClient = { callTool: vi.fn(), httpPost: vi.fn() } as any;
    mockClient.callTool.mockImplementation((tool: string) => {
      if (tool === 'list_screens') {
        return Promise.resolve({
          screens: [{ id: 's1', htmlCode: { downloadUrl: 'http://fake/s1.html' } }]
        });
      }
      if (tool === 'list_design_systems') {
        return Promise.resolve({ designSystems: [] });
      }
      return Promise.resolve({});
    });

    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      return Promise.resolve({ text: () => Promise.resolve('<html><body>OK</body></html>') });
    }));

    const project = new Project(mockClient, 'p1');
    const result = await project.downloadAssets('/tmp/out');

    expect(result.warnings).toEqual([]);
    expect(result.screens.length).toBe(1);
  });
});
