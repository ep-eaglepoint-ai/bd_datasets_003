const fs = require('fs')
const path = require('path')

const DESCRIPTION_REGEX = /^should\s+[a-z]+\s+.+\s+when\s+.+$/i

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

function extractTestDescriptions(fileText) {
	const results = []

	const patterns = [
		/\bit\s*\(\s*(['"`])([\s\S]*?)\1\s*,/g,
		/\btest\s*\(\s*(['"`])([\s\S]*?)\1\s*,/g,
	]

	for (const re of patterns) {
		let m
		while ((m = re.exec(fileText)) !== null) {
			results.push(m[2])
		}
	}
	return results
}

function findInvalidDescriptions(testsRoot) {
	const files = walk(testsRoot)
	const invalid = []

	for (const file of files) {
		const text = fs.readFileSync(file, 'utf8')
		const descriptions = extractTestDescriptions(text)

		for (const d of descriptions) {
			const desc = String(d).replace(/\s+/g, ' ').trim()
			if (!DESCRIPTION_REGEX.test(desc)) {
				invalid.push({ file, description: desc })
			}
		}
	}

	return invalid
}

module.exports = {
	DESCRIPTION_REGEX,
	findInvalidDescriptions,
}
