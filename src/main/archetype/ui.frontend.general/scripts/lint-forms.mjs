import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import formsPlugin from '@aemforms/eslint-plugin';

const require = createRequire(import.meta.url);
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.resolve(frontend, '..');
const config = require(path.join(frontend, '.forms-eslint.cjs'));
const eslint = new ESLint({
    cwd: project,
    useEslintrc: false,
    errorOnUnmatchedPattern: false,
    overrideConfig: config,
    plugins: { '@aemforms': formsPlugin }
});
const results = await eslint.lintFiles([
    'ui.frontend/src/**/*.js',
    'ui.apps*/src/main/content/jcr_root/apps/**/*.js'
]);
const formatter = await eslint.loadFormatter('stylish');
console.log(formatter.format(results));
console.log('Forms lint: ' + results.length + ' files, ' +
    results.reduce((sum, file) => sum + file.warningCount, 0) + ' warnings, ' +
    results.reduce((sum, file) => sum + file.errorCount, 0) + ' errors.');

const report = path.join(frontend, 'target', 'forms-eslint.json');
await mkdir(path.dirname(report), { recursive: true });
await writeFile(report, JSON.stringify(results, null, 2) + '\n');
if (results.some(file => file.errorCount > 0)) {
    process.exitCode = 1;
}
