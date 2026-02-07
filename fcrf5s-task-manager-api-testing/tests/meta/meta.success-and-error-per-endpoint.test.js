const fs = require('fs')
const path = require('path')
const { app } = require('../helpers/testServer')
const { getRoutes } = require('../helpers/routeIntrospection')

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

function readAllTestsText() {
	const testsRoot = path.resolve(__dirname, '..')
	const files = walk(testsRoot)
	return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n\n')
}

function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}


function endpointHasExpectations(text, method, routePath) {
	const header = `${method} ${routePath}`

	const describeRe = new RegExp(
		String.raw`describe\s*\(\s*['"\`]${escapeRegExp(header)}['"\`]\s*,\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\}\s*\)`,
		'm',
	)

	const m = text.match(describeRe)
	const block = m ? m[1] : null
	const searchArea = block || text

	const hasSuccess = /\.\s*expect\s*\(\s*20[0-9]\s*\)/.test(searchArea)

	const hasErrorStatus =
		/\.\s*expect\s*\(\s*4[0-9]{2}\s*\)|\.\s*expect\s*\(\s*5[0-9]{2}\s*\)/.test(
			searchArea,
		)

	const hasErrorAssertion =
		/expect\s*\(\s*res\.body(\.error|\)\s*\.toHaveProperty\s*\(\s*['"`]error['"`]\s*\)|\.errors|\.message)/.test(
			searchArea,
		) ||
		/toHaveProperty\s*\(\s*['"`](error|errors|message)['"`]\s*\)/.test(
			searchArea,
		)

	const hasError = hasErrorStatus || hasErrorAssertion

	return { hasSuccess, hasError }
}

describe('Meta: success and error coverage per endpoint', () => {
	it('should have at least one success and one error test for every endpoint when analyzing test expectations', () => {
		const routes = getRoutes(app)
		const text = readAllTestsText()

		const missingSuccess = []
		const missingError = []

		for (const r of routes) {
			const { hasSuccess, hasError } = endpointHasExpectations(
				text,
				r.method,
				r.path,
			)

			if (!hasSuccess) missingSuccess.push(`${r.method} ${r.path}`)
			if (!hasError) missingError.push(`${r.method} ${r.path}`)
		}

		if (missingSuccess.length) {
			throw new Error(
				`Missing success tests for endpoints:\n- ${missingSuccess.join('\n- ')}`,
			)
		}
		if (missingError.length) {
			throw new Error(
				`Missing error tests for endpoints:\n- ${missingError.join('\n- ')}`,
			)
		}
	})
})
