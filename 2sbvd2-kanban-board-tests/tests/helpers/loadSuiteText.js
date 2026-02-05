// tests/helpers/loadSuiteText.js
const fs = require('fs')
const path = require('path')

function loadSuiteText() {
	const targetRepo = process.env.TARGET_REPO || 'repository_after'

	const suitePath = path.resolve(
		__dirname,
		'..',
		'..',
		targetRepo,
		'kanban_app',
		'app',
		'page.test.js',
	)

	return fs.readFileSync(suitePath, 'utf8')
}

module.exports = { loadSuiteText }
