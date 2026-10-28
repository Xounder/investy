import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadExport } from './settings';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('binary export', () => {
  it('posts CSV and downloads the ZIP with the server filename', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(['contents']), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="investy-export.zip"' } }));
    vi.stubGlobal('fetch', fetchMock);
    const create = vi.fn(() => 'blob:test');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('investy-export.zip');
      expect(this.href).toBe('blob:test');
    });
    await downloadExport('csv');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/export?format=csv', { method: 'POST', credentials: 'include' });
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });

  it('surfaces nested API errors without starting a download', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { message: 'Exportação indisponível' } }, { status: 503 })));
    await expect(downloadExport('json')).rejects.toMatchObject({ status: 503, message: 'Exportação indisponível' });
  });
});
