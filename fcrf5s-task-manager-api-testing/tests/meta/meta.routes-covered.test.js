const fs = require('fs')
const path = require('path')

const { app } = require('../helpers/testServer')
const { getRoutes } = require('../helpers/routeIntrospection')

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

function readAllTestsText() {
	const testsRoot = path.resolve(__dirname, '..')
	const files = listTestFiles(testsRoot)

	const filtered = files.filter(
		(f) => !f.includes(`${path.sep}meta${path.sep}`),
	)
	return filtered.map((f) => fs.readFileSync(f, 'utf8')).join('\n\n')
}

function hasCoverageForRoute(allText, route) {
	const method = route.method.toUpperCase()
	const expressPath = route.path

	const describeNeedle = `${method} ${expressPath}`
	const describeRe = new RegExp(
		String.raw`describe\s*\(\s*['"\`]${escapeRegExp(describeNeedle)}['"\`]`,
		'm',
	)
	if (describeRe.test(allText)) return true

	const callMethod = method.toLowerCase()


	const parts = expressPath.split('/:') 
	const prefix = parts[0] 

	
	const trailingStatic = expressPath
		.split('/')
		.filter((seg) => seg.length > 0 && !seg.startsWith(':'))
		.map((seg) => `/${escapeRegExp(seg)}`)
		.join('')

	const callRe = new RegExp(
		String.raw`request\s*\.\s*${escapeRegExp(callMethod)}\s*\(\s*['"\`][^'"\`]*${escapeRegExp(
			prefix,
		)}[^'"\`]*${trailingStatic}[^'"\`]*['"\`]`,
		'm',
	)

	return callRe.test(allText)
}

function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('Meta: route coverage', () => {
	it('should have at least one test that exercises every defined route when routes are introspected', () => {
		const routes = getRoutes(app)

		const allTestsText = readAllTestsText()

		const missing = routes
			.filter((r) => !hasCoverageForRoute(allTestsText, r))
			.map((r) => `${r.method} ${r.path}`)

		if (missing.length > 0) {
			throw new Error(
				`Missing test coverage for routes:\n- ${missing.join('\n- ')}\n\n` +
					`Tip: ensure each endpoint has a describe("METHOD /path", ...) block and at least one request.METHOD(...) call.`,
			)
		}
	})
})
