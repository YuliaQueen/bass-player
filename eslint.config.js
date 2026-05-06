import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
    {
        ignores: ['node_modules/**', 'dist/**', 'public/alphatab/**', 'backend/**', 'design-prototype/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
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
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            'no-console': 'off',
            'prefer-const': 'warn',
            eqeqeq: ['warn', 'smart'],
            'no-var': 'error',
            'object-shorthand': 'warn',
            'prefer-arrow-callback': 'warn',
        },
    },
    {
        files: ['server/**/*.{js,ts}'],
        languageOptions: { globals: globals.node },
    },
    {
        files: ['src/**/*.{js,ts}'],
        languageOptions: { globals: globals.browser },
    },
    prettier,
];
