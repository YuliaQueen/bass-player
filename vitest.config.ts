import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: false,
        include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts', 'server/**/*.ts'],
            exclude: ['**/*.test.ts', 'src/main.ts'],
            reporter: ['text', 'html'],
        },
    },
});
