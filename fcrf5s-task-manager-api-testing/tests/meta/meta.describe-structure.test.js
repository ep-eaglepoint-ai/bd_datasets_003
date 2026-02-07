const fs = require('fs')
const path = require('path')

const { app } = require('../helpers/testServer')
const { getRoutes } = require('../helpers/routeIntrospection')

function listApiTestFiles() {
	const apiDir = path.resolve(__dirname, '..', 'api')
	const files = []

	function walk(dir) {
		if (!fs.existsSync(dir)) return
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name)
			if (entry.isDirectory()) walk(full)
			else if (entry.isFile() && entry.name.endsWith('.test.js'))
				files.push(full)
		}
	}

	walk(apiDir)
	return files
}

function readApiTestsText() {
	const files = listApiTestFiles()
	return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n\n')
}

describe('Meta: describe structure matches API routes', () => {
	it('should define describe blocks matching every route when comparing test structure to Express routes', () => {
		const routes = getRoutes(app)
		const apiTestsText = readApiTestsText()

		const missingDescribe = []

		routes.forEach((route) => {
			const expectedDescribe = `${route.method} ${route.path}`

			const describeRegex = new RegExp(
				String.raw`describe\s*\(\s*['"\`]${escapeRegExp(expectedDescribe)}['"\`]`,
				'm',
			)

			if (!describeRegex.test(apiTestsText)) {
				missingDescribe.push(expectedDescribe)
			}
		})

		if (missingDescribe.length > 0) {
			throw new Error(
				`Missing describe blocks for routes:\n- ${missingDescribe.join('\n- ')}\n\n` +
					`Each endpoint must have describe("METHOD /path", ...)`,
			)
		}
	})
})

function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
