const fs = require('fs')
const path = require('path')

function listTestFiles(rootDir) {
	const out = []

	function walk(dir) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name)
			if (entry.isDirectory()) walk(full)
			else if (entry.isFile() && entry.name.endsWith('.test.js'))
				out.push(full)
		}
	}

	walk(rootDir)
	return out
}

describe('Meta: no focused tests', () => {
	it('should not contain describe.only, it.only, or test.only when scanning test files', () => {
		const testsRoot = path.resolve(__dirname, '..')
		const files = listTestFiles(testsRoot)

		const offenders = []

		const onlyPattern = /\b(describe|it|test)\s*\.\s*only\s*\(/

		files.forEach((file) => {
			const content = fs.readFileSync(file, 'utf8')
			if (onlyPattern.test(content)) {
				offenders.push(file)
			}
		})

		if (offenders.length > 0) {
			throw new Error(
				`Focused tests (.only) found in:\n- ${offenders.join('\n- ')}\n\n` +
					`Remove .only() before committing to ensure full suite runs.`,
			)
		}
	})
})
