// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listTabs, uploadTab, deleteTab } from './api.ts';

const okJson = (data: unknown) =>
    ({
        ok: true,
        status: 200,
        json: async () => data,
    }) as Response;

const errJson = (status: number, data: unknown) =>
    ({
        ok: false,
        status,
        json: async () => data,
    }) as Response;

describe('api wrappers', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
    });

    describe('listTabs', () => {
        it('делает GET /api/tabs с credentials и возвращает массив', async () => {
            fetchMock.mockResolvedValueOnce(okJson([{ name: 'a.gp' }, { name: 'b.gp' }]));
            const result = await listTabs();
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe('/api/tabs');
            expect(init.credentials).toBe('include');
            expect(result).toEqual([{ name: 'a.gp' }, { name: 'b.gp' }]);
        });

        it('бросает ошибку с error из тела при !ok', async () => {
            fetchMock.mockResolvedValueOnce(errJson(500, { error: 'oops' }));
            await expect(listTabs()).rejects.toThrow('oops');
        });

        it('бросает дефолтную ошибку если в теле нет error', async () => {
            fetchMock.mockResolvedValueOnce(errJson(503, {}));
            await expect(listTabs()).rejects.toThrow('HTTP 503');
        });
    });

    describe('uploadTab', () => {
        it('делает POST с FormData и полем file', async () => {
            fetchMock.mockResolvedValueOnce(okJson({ uploaded: 'x.gp', tabs: [] }));
            const file = new Blob(['fake'], { type: 'application/octet-stream' });
            await uploadTab(file);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe('/api/tabs');
            expect(init.method).toBe('POST');
            expect(init.body).toBeInstanceOf(FormData);
            const sent = (init.body as FormData).get('file') as Blob;
            expect(sent).toBeInstanceOf(Blob);
            expect(sent.size).toBe(file.size);
            expect(sent.type).toBe(file.type);
        });
    });

    describe('deleteTab', () => {
        it('делает DELETE с url-encoded именем', async () => {
            fetchMock.mockResolvedValueOnce(okJson({ deleted: 'a b.gp', tabs: [] }));
            await deleteTab('a b.gp');

            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe('/api/tabs/a%20b.gp');
            expect(init.method).toBe('DELETE');
        });

        it('кодирует кириллицу в URL', async () => {
            fetchMock.mockResolvedValueOnce(okJson({}));
            await deleteTab('Кино.gp');
            const [url] = fetchMock.mock.calls[0] as [string];
            expect(url).toBe(`/api/tabs/${encodeURIComponent('Кино.gp')}`);
        });
    });
});
