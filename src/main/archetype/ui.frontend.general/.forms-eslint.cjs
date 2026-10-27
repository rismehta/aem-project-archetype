module.exports = {
    root: true,
    plugins: ['@aemforms'],
    env: {
        browser: true,
        node: true,
        es2022: true
    },
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true
        }
    },
    ignorePatterns: [
        '**/node_modules/**',
        '**/target/**',
        '**/dist/**',
        '**/*.bundle.js',
        'ui.apps/src/main/content/jcr_root/apps/${appId}/clientlibs/clientlib-site/**',
        'ui.apps/src/main/content/jcr_root/apps/${appId}/clientlibs/clientlib-dependencies/**'
    ],
    rules: {
        '@aemforms/custom-fn-correctness': 'warn'
    }
};
