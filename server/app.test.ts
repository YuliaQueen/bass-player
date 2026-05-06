import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import type { Express } from 'express';
import { createApp, MAX_SIZE } from './app.ts';

let tabsDir: string;
let app: Express;

beforeEach(async () => {
    tabsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bass-tabs-test-'));
    app = createApp({ tabsDir });
});

afterEach(async () => {
    await fs.rm(tabsDir, { recursive: true, force: true });
});

describe('GET /api/health', () => {
    it('отдаёт ok=true', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
    });
});

describe('GET /api/tabs', () => {
    it('возвращает пустой массив для пустой папки', async () => {
        const res = await request(app).get('/api/tabs');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it('возвращает только файлы с разрешёнными расширениями', async () => {
        await fs.writeFile(path.join(tabsDir, 'song.gp'), 'data');
        await fs.writeFile(path.join(tabsDir, 'note.txt'), 'irrelevant');
        await fs.writeFile(path.join(tabsDir, 'other.gpx'), 'data');

        const res = await request(app).get('/api/tabs');
        expect(res.status).toBe(200);
        expect(res.body.map((t: { name: string }) => t.name).sort()).toEqual(['other.gpx', 'song.gp']);
    });

    it('сортирует по имени с учётом локали', async () => {
        await fs.writeFile(path.join(tabsDir, 'Яндекс.gp'), '');
        await fs.writeFile(path.join(tabsDir, 'Альфа.gp'), '');
        await fs.writeFile(path.join(tabsDir, 'Браво.gp'), '');

        const res = await request(app).get('/api/tabs');
        expect(res.body.map((t: { name: string }) => t.name)).toEqual(['Альфа.gp', 'Браво.gp', 'Яндекс.gp']);
    });
});

describe('POST /api/tabs', () => {
    it('сохраняет валидный .gp файл', async () => {
        const res = await request(app)
            .post('/api/tabs')
            .attach('file', Buffer.from('fake gp content'), 'song.gp');

        expect(res.status).toBe(200);
        expect(res.body.uploaded).toBe('song.gp');
        expect(res.body.tabs).toHaveLength(1);

        const onDisk = await fs.readFile(path.join(tabsDir, 'song.gp'), 'utf8');
        expect(onDisk).toBe('fake gp content');
    });

    it('отвергает файл с недопустимым расширением', async () => {
        const res = await request(app).post('/api/tabs').attach('file', Buffer.from('virus'), 'malware.exe');

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Поддерживаются только/);

        const files = await fs.readdir(tabsDir);
        expect(files).toEqual([]);
    });

    it('защищает от path traversal — берёт только basename', async () => {
        const res = await request(app)
            .post('/api/tabs')
            .attach('file', Buffer.from('hack'), '../../../etc/passwd.gp');

        expect(res.status).toBe(200);
        // Файл сохранится как passwd.gp, без выхода за tabsDir
        expect(res.body.uploaded).toBe('passwd.gp');
        const files = await fs.readdir(tabsDir);
        expect(files).toContain('passwd.gp');
    });

    it('отвергает файлы больше MAX_SIZE', async () => {
        const oversize = Buffer.alloc(MAX_SIZE + 1);
        const res = await request(app).post('/api/tabs').attach('file', oversize, 'big.gp');

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/File too large/i);
    });

    it('отвечает 400 если файл вообще не приложен', async () => {
        const res = await request(app).post('/api/tabs');
        expect(res.status).toBe(400);
    });

    it('сохраняет имя с кириллицей корректно', async () => {
        const filename = 'Кино-Спокойная.gp';
        const res = await request(app).post('/api/tabs').attach('file', Buffer.from('x'), filename);

        expect(res.status).toBe(200);
        expect(res.body.uploaded).toBe(filename);
        const files = await fs.readdir(tabsDir);
        expect(files).toContain(filename);
    });
});

describe('DELETE /api/tabs/:name', () => {
    it('удаляет существующий файл', async () => {
        await fs.writeFile(path.join(tabsDir, 'song.gp'), '');

        const res = await request(app).delete('/api/tabs/song.gp');
        expect(res.status).toBe(200);
        expect(res.body.deleted).toBe('song.gp');
        expect(res.body.tabs).toEqual([]);

        await expect(fs.access(path.join(tabsDir, 'song.gp'))).rejects.toThrow();
    });

    it('возвращает 404 если файла нет', async () => {
        const res = await request(app).delete('/api/tabs/nonexistent.gp');
        expect(res.status).toBe(404);
    });

    it('отвергает имя с недопустимым расширением', async () => {
        const res = await request(app).delete('/api/tabs/something.exe');
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Недопустимое/);
    });

    it('защищает от path traversal в имени', async () => {
        await fs.writeFile(path.join(tabsDir, 'real.gp'), '');
        const res = await request(app).delete('/api/tabs/' + encodeURIComponent('../../real.gp'));
        // basename('../../real.gp') === 'real.gp' → удалится файл из нашей tabsDir
        expect(res.status).toBe(200);
        expect(res.body.deleted).toBe('real.gp');
    });
});

describe('GET /tabs/:name', () => {
    it('отдаёт содержимое файла', async () => {
        await fs.writeFile(path.join(tabsDir, 'song.gp'), 'binary-content');
        const res = await request(app)
            .get('/tabs/song.gp')
            .buffer(true)
            .parse((response, cb) => {
                const chunks: Buffer[] = [];
                response.on('data', (c: Buffer) => chunks.push(c));
                response.on('end', () => cb(null, Buffer.concat(chunks)));
            });
        expect(res.status).toBe(200);
        expect((res.body as Buffer).toString('utf8')).toBe('binary-content');
    });

    it('возвращает 404 для несуществующего файла', async () => {
        const res = await request(app).get('/tabs/missing.gp');
        expect(res.status).toBe(404);
    });
});
