import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: false,
        include: ['src/**/*.test.js', 'server/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.js', 'server/**/*.js'],
            exclude: ['**/*.test.js', 'src/main.js'],
            reporter: ['text', 'html'],
        },
    },
});
