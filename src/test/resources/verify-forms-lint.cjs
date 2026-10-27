const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projects = path.resolve(process.argv[2] || 'target/test-classes/projects');
let formsChecked = 0;
let sitesChecked = 0;

for (const fixture of fs.readdirSync(projects, { withFileTypes: true })) {
    const propertiesFile = path.join(projects, fixture.name, 'archetype.properties');
    if (!fixture.isDirectory() || !fs.existsSync(propertiesFile)) {
        continue;
    }
    const properties = Object.fromEntries(fs.readFileSync(propertiesFile, 'utf8')
        .split(/\r?\n/).map(line => line.match(/^([^#!=\s]+)\s*=\s*(.*)$/))
        .filter(Boolean).map(match => [match[1], match[2].trim()]));
    const project = path.join(projects, fixture.name, 'project', properties.artifactId);
    if (!fs.existsSync(project) || properties.frontendModule !== 'general') {
        continue;
    }
    const frontend = path.join(project, 'ui.frontend');
    const manifest = JSON.parse(fs.readFileSync(path.join(frontend, 'package.json'), 'utf8'));
    const forms = ['includeForms', 'includeFormsenrollment',
        'includeFormscommunications', 'includeFormsheadless'].some(key => properties[key] === 'y');
    if (!forms) {
        assert(!Object.prototype.hasOwnProperty.call(manifest.scripts, 'lint:forms'));
        assert(!Object.prototype.hasOwnProperty.call(manifest.devDependencies, '@aemforms/eslint-plugin'));
        assert(!fs.existsSync(path.join(frontend, '.forms-eslint.cjs')));
        sitesChecked++;
        continue;
    }
    assert(manifest.scripts.prod.startsWith('npm run lint:forms && '));
    assert.equal(manifest.devDependencies['@aemforms/eslint-plugin'], '1.0.26');
    const reportFile = path.join(frontend, 'target', 'forms-eslint.json');
    const originalReport = fs.readFileSync(reportFile);
    const node = path.join(frontend, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
    assert(fs.existsSync(node));
    const source = path.join(project, 'ui.apps/src/main/content/jcr_root/apps',
        properties.appId, 'forms-lint-regression.js');
    const ignored = path.join(path.dirname(source), 'forms-lint-regression.bundle.js');
    assert(!fs.existsSync(source) && !fs.existsSync(ignored));
    const run = () => {
        const result = spawnSync(node, ['scripts/lint-forms.mjs'], {
            cwd: frontend,
            encoding: 'utf8'
        });
        assert.ifError(result.error);
        assert.equal(result.signal, null, result.stderr);
        console.log(result.stdout);
        return { status: result.status, report: JSON.parse(fs.readFileSync(reportFile, 'utf8')) };
    };
    try {
        fs.writeFileSync(source, `
/* eslint-disable import/no-extraneous-dependencies */
function checkPrivateAccess() {
    const form = guideBridge.getFormModel();
    return form._options;
}
function customerOptions() {
    const customer = { _options: {} };
    window.dispatchEvent(new CustomEvent('commerce'));
    return customer._options;
}
`);
        fs.writeFileSync(ignored, 'this is deliberately invalid generated JavaScript !');
        let result = run();
        assert.equal(result.status, 0);
        assert(!result.report.some(file => file.filePath.endsWith(path.basename(ignored))));
        const findings = result.report.find(file => file.filePath.endsWith(path.basename(source))).messages;
        assert.equal(findings.length, 1);
        assert.equal(findings[0].ruleId, '@aemforms/custom-fn-correctness');
        assert.equal(findings[0].severity, 1);
        fs.writeFileSync(source, 'function broken( {');
        result = run();
        assert.notEqual(result.status, 0);
        assert.equal(result.report.find(file =>
            file.filePath.endsWith(path.basename(source))).fatalErrorCount, 1);
    } finally {
        if (fs.existsSync(source)) fs.unlinkSync(source);
        if (fs.existsSync(ignored)) fs.unlinkSync(ignored);
        fs.writeFileSync(reportFile, originalReport);
    }
    formsChecked++;
    console.log('Forms lint verification passed: ' + fixture.name);
}
assert(formsChecked > 0, 'No generated Forms/general project was verified');
assert(sitesChecked > 0, 'No generated Sites/general project was verified');
