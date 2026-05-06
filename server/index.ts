import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TABS_DIR = path.resolve(__dirname, '..', 'tabs');
const PORT = 3001;

await fs.mkdir(TABS_DIR, { recursive: true });

const app = createApp({ tabsDir: TABS_DIR });

app.listen(PORT, () => {
    console.log(`[server] tabs dir: ${TABS_DIR}`);
    console.log(`[server] listening on http://localhost:${PORT}`);
});
