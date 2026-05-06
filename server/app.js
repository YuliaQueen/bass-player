import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';

export const ALLOWED_EXT = /\.(gp|gp3|gp4|gp5|gpx|gp7|gp8)$/i;
export const MAX_SIZE = 10 * 1024 * 1024;

/**
 * Декодируем имя файла из latin1 в utf-8 — multer по дефолту парсит multipart-имена
 * как latin1, из-за чего кириллица превращается в кракозябры.
 */
const decodeFilename = (originalname) => Buffer.from(originalname, 'latin1').toString('utf8');

/**
 * Создаёт настроенное Express-приложение. Принимает путь к папке с табами,
 * чтобы тесты могли подсунуть временную директорию.
 *
 * @param {Object} opts
 * @param {string} opts.tabsDir — абсолютный путь к папке с .gp файлами
 * @returns {express.Express}
 */
export const createApp = ({ tabsDir }) => {
    const app = express();
    app.use(cors());

    const storage = multer.diskStorage({
        destination: tabsDir,
        filename: (req, file, cb) => {
            const decoded = decodeFilename(file.originalname);
            cb(null, path.basename(decoded));
        },
    });

    const upload = multer({
        storage,
        limits: { fileSize: MAX_SIZE },
        fileFilter: (req, file, cb) => {
            const decoded = decodeFilename(file.originalname);
            ALLOWED_EXT.test(decoded)
                ? cb(null, true)
                : cb(
                      new Error(
                          `Поддерживаются только .gp/.gp3/.gp4/.gp5/.gpx/.gp7/.gp8 (получен: ${decoded})`,
                      ),
                  );
        },
    });

    const listTabs = async () => {
        const files = await fs.readdir(tabsDir);
        const tabs = await Promise.all(
            files
                .filter((name) => ALLOWED_EXT.test(name))
                .map(async (name) => {
                    const stat = await fs.stat(path.join(tabsDir, name));
                    return { name, size: stat.size, mtime: stat.mtime };
                }),
        );
        tabs.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        return tabs;
    };

    app.get('/api/health', (_req, res) => res.json({ ok: true }));

    app.get('/api/tabs', async (_req, res) => {
        try {
            res.json(await listTabs());
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/tabs', (req, res) => {
        upload.single('file')(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: err.message });
            }
            if (!req.file) {
                return res.status(400).json({ error: 'Файл не получен' });
            }
            try {
                res.json({ uploaded: req.file.filename, tabs: await listTabs() });
            } catch (e) {
                res.status(500).json({ error: e.message });
            }
        });
    });

    app.delete('/api/tabs/:name', async (req, res) => {
        const safeName = path.basename(req.params.name);
        if (!ALLOWED_EXT.test(safeName)) {
            return res.status(400).json({ error: 'Недопустимое имя файла' });
        }
        try {
            await fs.unlink(path.join(tabsDir, safeName));
            res.json({ deleted: safeName, tabs: await listTabs() });
        } catch (err) {
            const status = err.code === 'ENOENT' ? 404 : 500;
            res.status(status).json({ error: err.message });
        }
    });

    app.get('/tabs/:name', (req, res) => {
        const safeName = path.basename(req.params.name);
        res.sendFile(path.join(tabsDir, safeName), (err) => {
            if (err) {
                res.status(404).json({ error: 'Файл не найден', name: safeName });
            }
        });
    });

    return app;
};
