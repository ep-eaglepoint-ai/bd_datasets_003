const fs = require('fs')
const path = require('path')

function walk(dir, out = []) {
	if (!fs.existsSync(dir)) return out
	for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, ent.name)
		if (ent.isDirectory()) {
			if (ent.name === 'node_modules') continue
			walk(full, out)
		} else if (ent.isFile() && ent.name.endsWith('.test.js')) {
			out.push(full)
		}
	}
	return out
}

describe('Meta: no skipped tests', () => {
	it('should not contain describe.skip, it.skip, test.skip, or xit when scanning test files', () => {
		const testsRoot = path.resolve(__dirname, '..')
		const files = walk(testsRoot)

		const self = path.resolve(__filename)

		const offenders = []
		const pattern = /\b(describe\.skip|it\.skip|test\.skip|xit)\b/

		for (const f of files) {
			if (path.resolve(f) === self) continue

			const text = fs.readFileSync(f, 'utf8')
			if (pattern.test(text)) offenders.push(f)
		}

		if (offenders.length) {
			throw new Error(
				`Skipped tests found in:\n- ${offenders.join('\n- ')}\n\nRemove .skip() or xit() before committing.`,
			)
		}
	})
})
