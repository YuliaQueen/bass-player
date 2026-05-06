import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listTabs, uploadTab, deleteTab } from './api.js';

const okJson = (data) => ({
    ok: true,
    status: 200,
    json: async () => data,
});

const errJson = (status, data) => ({
    ok: false,
    status,
    json: async () => data,
});

describe('api wrappers', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });

    describe('listTabs', () => {
        it('делает GET /api/tabs и возвращает массив', async () => {
            globalThis.fetch.mockResolvedValueOnce(okJson([{ name: 'a.gp' }, { name: 'b.gp' }]));
            const result = await listTabs();
            expect(globalThis.fetch).toHaveBeenCalledWith('/api/tabs');
            expect(result).toEqual([{ name: 'a.gp' }, { name: 'b.gp' }]);
        });

        it('бросает ошибку с error из тела при !ok', async () => {
            globalThis.fetch.mockResolvedValueOnce(errJson(500, { error: 'oops' }));
            await expect(listTabs()).rejects.toThrow('oops');
        });

        it('бросает дефолтную ошибку если в теле нет error', async () => {
            globalThis.fetch.mockResolvedValueOnce(errJson(503, {}));
            await expect(listTabs()).rejects.toThrow('HTTP 503');
        });
    });

    describe('uploadTab', () => {
        it('делает POST с FormData и полем file', async () => {
            globalThis.fetch.mockResolvedValueOnce(okJson({ uploaded: 'x.gp', tabs: [] }));
            const file = new Blob(['fake'], { type: 'application/octet-stream' });
            await uploadTab(file);

            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
            const [url, init] = globalThis.fetch.mock.calls[0];
            expect(url).toBe('/api/tabs');
            expect(init.method).toBe('POST');
            expect(init.body).toBeInstanceOf(FormData);
            // FormData оборачивает Blob в File, поэтому === не сходится — сверяем по размеру/типу
            const sent = init.body.get('file');
            expect(sent).toBeInstanceOf(Blob);
            expect(sent.size).toBe(file.size);
            expect(sent.type).toBe(file.type);
        });
    });

    describe('deleteTab', () => {
        it('делает DELETE с url-encoded именем', async () => {
            globalThis.fetch.mockResolvedValueOnce(okJson({ deleted: 'a b.gp', tabs: [] }));
            await deleteTab('a b.gp');

            const [url, init] = globalThis.fetch.mock.calls[0];
            expect(url).toBe('/api/tabs/a%20b.gp');
            expect(init.method).toBe('DELETE');
        });

        it('кодирует кириллицу в URL', async () => {
            globalThis.fetch.mockResolvedValueOnce(okJson({}));
            await deleteTab('Кино.gp');
            const [url] = globalThis.fetch.mock.calls[0];
            expect(url).toBe(`/api/tabs/${encodeURIComponent('Кино.gp')}`);
        });
    });
});
