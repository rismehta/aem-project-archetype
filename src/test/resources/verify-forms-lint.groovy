import groovy.json.JsonSlurper

def projectsDir = new File(properties['projectsDir'])
def fixtures = projectsDir.exists() ? projectsDir.listFiles().findAll {
    it.isDirectory() && new File(it, 'archetype.properties').exists()
} : []

fixtures.each { fixture ->
    def options = new Properties()
    new File(fixture, 'archetype.properties').withInputStream { options.load(it) }
    def project = new File(fixture, "project/${options.artifactId}")
    if (!project.exists() || options.frontendModule != 'general') {
        return
    }
    def frontend = new File(project, 'ui.frontend')
    def manifest = new JsonSlurper().parse(new File(frontend, 'package.json'))
    def forms = ['includeForms', 'includeFormsenrollment', 'includeFormscommunications',
                 'includeFormsheadless'].any { options.getProperty(it) == 'y' }
    if (!forms) {
        assert !manifest.scripts.containsKey('lint:forms')
        assert !manifest.devDependencies.containsKey('@aemforms/eslint-plugin')
        assert !new File(frontend, '.forms-eslint.cjs').exists()
        return
    }
    assert manifest.scripts.prod.startsWith('npm run lint:forms && ')
    assert manifest.devDependencies['@aemforms/eslint-plugin'] == '1.0.25'
    assert new File(frontend, 'target/forms-eslint.json').exists()
    def node = new File(frontend, System.getProperty('os.name').startsWith('Windows') ?
        'node/node.exe' : 'node/node')
    assert node.exists()
    def source = new File(project, "ui.apps/src/main/content/jcr_root/apps/${options.appId}/forms-lint-regression.js")
    def ignored = new File(source.parentFile, 'forms-lint-regression.bundle.js')
    assert !source.exists() && !ignored.exists()
    try {
        source.text = '''
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
'''
        ignored.text = 'this is deliberately invalid generated JavaScript !'
        def run = {
            def process = new ProcessBuilder(node.absolutePath, 'scripts/lint-forms.mjs')
                .directory(frontend).redirectErrorStream(true).start()
            def output = process.inputStream.getText('UTF-8')
            def exit = process.waitFor()
            println output
            [exit: exit, report: new JsonSlurper().parse(new File(frontend, 'target/forms-eslint.json'))]
        }
        def result = run()
        assert result.exit == 0
        assert !result.report.any { it.filePath.endsWith(ignored.name) }
        def findings = result.report.find { it.filePath.endsWith(source.name) }.messages
        assert findings.size() == 1
        assert findings[0].ruleId == '@aemforms/custom-fn-correctness'
        assert findings[0].severity == 1
        source.text = 'function broken( {'
        result = run()
        assert result.exit != 0
        assert result.report.find { it.filePath.endsWith(source.name) }.fatalErrorCount == 1
    } finally {
        assert source.delete()
        assert ignored.delete()
    }
    println "Forms lint verification passed: ${fixture.name}"
}
