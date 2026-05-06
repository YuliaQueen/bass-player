import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Копируем шрифты и soundfont alphaTab в public, чтобы фронт мог их забрать с /alphatab/...
export default defineConfig({
    plugins: [
        viteStaticCopy({
            targets: [
                { src: 'node_modules/@coderline/alphatab/dist/font/*', dest: 'alphatab/font' },
                { src: 'node_modules/@coderline/alphatab/dist/soundfont/*', dest: 'alphatab/soundfont' },
            ],
        }),
    ],
    server: {
        proxy: {
            // Laravel в Sail на 8001
            '/api': 'http://localhost:8001',
            '/tabs': 'http://localhost:8001',
            '/sanctum': 'http://localhost:8001',
            '/login': 'http://localhost:8001',
            '/logout': 'http://localhost:8001',
        },
    },
    optimizeDeps: {
        // alphaTab использует web workers — пусть Vite не пытается их пре-бандлить
        exclude: ['@coderline/alphatab'],
    },
    build: {
        // ES2022 нужен для top-level await в main.ts (initLibrary через await)
        target: 'es2022',
    },
});
