import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
    {
        ignores: ['node_modules/**', 'dist/**', 'tabs/**', 'public/alphatab/**'],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-console': 'off',
            'prefer-const': 'warn',
            eqeqeq: ['warn', 'smart'],
            'no-var': 'error',
            'object-shorthand': 'warn',
            'prefer-arrow-callback': 'warn',
        },
    },
    {
        files: ['server/**/*.js'],
        languageOptions: { globals: globals.node },
    },
    {
        files: ['src/**/*.js'],
        languageOptions: { globals: globals.browser },
    },
    prettier,
];
