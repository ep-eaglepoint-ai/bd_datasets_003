const fs = require('fs')
const path = require('path')

const { runJestInTempProject } = require('./helpers/runJestInTempProject')

const RES_DIR = path.resolve(__dirname, 'resources', 'kanban')
const TARGET_REPO = process.env.TARGET_REPO || 'repository_after'

function shouldSkipPath(p) {
	return (
		p.includes(`${path.sep}node_modules${path.sep}`) ||
		p.includes(`${path.sep}.next${path.sep}`) ||
		p.includes(`${path.sep}.git${path.sep}`) ||
		p.includes(`${path.sep}dist${path.sep}`) ||
		p.includes(`${path.sep}build${path.sep}`) ||
		p.includes(`${path.sep}coverage${path.sep}`)
	)
}

function listJsFilesRecursive(dir) {
	const out = []
	if (!fs.existsSync(dir)) return out
	if (shouldSkipPath(dir)) return out

	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name)
		if (shouldSkipPath(p)) continue

		if (entry.isDirectory()) out.push(...listJsFilesRecursive(p))
		else if (entry.isFile() && p.endsWith('.js')) out.push(p)
	}
	return out
}

function assertNoOnlyOrSkipInRepo(repoRoot) {
	const files = listJsFilesRecursive(repoRoot).filter(
		(p) =>
			(p.includes(`${path.sep}app${path.sep}`) ||
				p.includes(`${path.sep}tests${path.sep}`)) &&
			!shouldSkipPath(p),
	)

	const offenders = []
	for (const file of files) {
		const txt = fs.readFileSync(file, 'utf8')
		if (
			/\b(?:it|test|describe)\.only\s*\(/.test(txt) ||
			/\b(?:it|test|describe)\.skip\s*\(/.test(txt)
		) {
			offenders.push(file)
		}
	}

	expect(offenders).toEqual([])
}

function assertNamingConvention(suiteText) {
	const TEST_TITLE_RE = /\btest\s*\(\s*['"`]([^'"`]+)['"`]/g
	const IT_TITLE_RE = /\bit\s*\(\s*['"`]([^'"`]+)['"`]/g

	const titles = []
	let m
	while ((m = TEST_TITLE_RE.exec(suiteText))) titles.push(m[1])
	while ((m = IT_TITLE_RE.exec(suiteText))) titles.push(m[1])

	expect(titles.length).toBeGreaterThan(0)

	const ALLOWED_PREFIX =
		/^(renders|shows|displays|creates|updates|moves|handles|prevents|allows|checks|verifies|ensures|should)\b/i

	for (const t of titles) {
		const ok = ALLOWED_PREFIX.test(t.trim())
		if (!ok) {
			throw new Error(
				`Bad test title (naming convention). Rename this test to start with an allowed verb.\nTitle: "${t}"`,
			)
		}
	}
}

function assertSuiteCoversMajorComponentsAndEdges(suiteText) {
	expect(suiteText).toMatch(/describe\s*\(\s*['"`]Board/i)
	expect(suiteText).toMatch(/describe\s*\(\s*['"`]Column/i)
	expect(suiteText).toMatch(/describe\s*\(\s*['"`]Card/i)

	const edgeCount = (suiteText.match(/renders edge case:/gi) || []).length
	expect(edgeCount).toBeGreaterThanOrEqual(2)
}

function assertSuiteIsDataDriven(suiteText) {
	expect(suiteText).toMatch(
		/import\s+data\s+from\s+['"`]\.\.\/data\.json['"`]/,
	)

	expect(suiteText).toMatch(/data\.boards\[0\]\.columns/)
	expect(suiteText).toMatch(/forEach\s*\(\s*\(column\)/)
	expect(suiteText).toMatch(/column\.cards\.forEach/)

	expect(suiteText).toMatch(/getByText\s*\(\s*card\.title\s*\)/)
	expect(suiteText).toMatch(/getByText\s*\(\s*card\.description\s*\)/)
	expect(suiteText).toMatch(/getByText\s*\(\s*card\.assignee\s*\)/)
	expect(suiteText).toMatch(/getByText\s*\(\s*card\.dueDate\s*\)/)

	expect(suiteText).toMatch(/getByRole\s*\(\s*['"`]heading['"`]/)
}

function assertSuiteHierarchyShape(suiteText) {
	const boardIdx = suiteText.search(/describe\s*\(\s*['"`]Board/i)
	const colIdx = suiteText.search(/describe\s*\(\s*['"`]Column/i)
	const cardIdx = suiteText.search(/describe\s*\(\s*['"`]Card/i)

	expect(boardIdx).toBeGreaterThanOrEqual(0)
	expect(colIdx).toBeGreaterThanOrEqual(0)
	expect(cardIdx).toBeGreaterThanOrEqual(0)

	expect(boardIdx).toBeLessThan(colIdx)
	expect(colIdx).toBeLessThan(cardIdx)
}

function loadResource(filename) {
	return fs.readFileSync(path.join(RES_DIR, filename), 'utf8')
}

function loadSuiteText() {
	const suitePath = path.resolve(
		__dirname,
		'..',
		TARGET_REPO,
		'kanban_app',
		'app',
		'page.test.js',
	)
	return fs.readFileSync(suitePath, 'utf8')
}

function loadDataJson() {
	const jsonPath = path.resolve(
		__dirname,
		'..',
		TARGET_REPO,
		'kanban_app',
		'data.json',
	)
	return fs.readFileSync(jsonPath, 'utf8')
}

function expectInnerFail(result, label) {
	expect(result.failed).toBe(true)
	if (result.failed !== true) {
		throw new Error(`Expected inner suite to FAIL for: ${label}`)
	}
}

function expectInnerPass(result, label) {
	if (result.failed) {
		console.log(`\n===== INNER SUITE FAILED for: ${label} =====`)
		console.log('TempDir:', result.tempDir)
		console.log('----- STDOUT -----\n', result.stdout)
		console.log('----- STDERR -----\n', result.stderr)
	}
	expect(result.failed).toBe(false)
}

async function runWithLimit(limit, tasks) {
	const results = []
	let i = 0

	async function worker() {
		while (i < tasks.length) {
			const idx = i++
			results[idx] = await tasks[idx]()
		}
	}

	const workers = Array.from({ length: Math.max(1, limit) }, () => worker())
	await Promise.all(workers)
	return results
}

describe('Kanban Meta Test Suite', () => {
	const suiteText = loadSuiteText()
	const dataJsonText = loadDataJson()

	test('meta: suite quality gates (requirements 12–17)', () => {
		const repoRoot = path.resolve(
			__dirname,
			'..',
			TARGET_REPO,
			'kanban_app',
		)

		assertNoOnlyOrSkipInRepo(repoRoot)
		assertNamingConvention(suiteText)
		assertSuiteCoversMajorComponentsAndEdges(suiteText)
		assertSuiteIsDataDriven(suiteText)
		assertSuiteHierarchyShape(suiteText)
	})

	const casesFail = [
		{
			label: 'broken_missing_subtitle.page.js',
			file: 'broken_missing_subtitle.page.js',
		},
		{
			label: 'broken_wrong_column_titles.page.js',
			file: 'broken_wrong_column_titles.page.js',
		},
		{
			label: 'broken_wrong_card_counts.page.js',
			file: 'broken_wrong_card_counts.page.js',
		},
		{
			label: 'broken_missing_priority_class.page.js',
			file: 'broken_missing_priority_class.page.js',
		},
		{
			label: 'broken_missing_initials.page.js',
			file: 'broken_missing_initials.page.js',
		},
		{
			label: 'broken_missing_testids.page.js',
			file: 'broken_missing_testids.page.js',
		},
		{
			label: 'broken_total_cards_not_8.page.js',
			file: 'broken_total_cards_not_8.page.js',
		},
	]

	test(
		'suite fails for all broken implementations (parallel, limited)',
		async () => {
			const CONCURRENCY = 2

			const tasks = casesFail.map(({ label, file }) => async () => {
				const pageImplText = loadResource(file)
				const result = await runJestInTempProject({
					pageImplText,
					suiteText,
					dataJsonText,
				})
				return { label, result }
			})

			const out = await runWithLimit(CONCURRENCY, tasks)

			for (const { label, result } of out) {
				expectInnerFail(result, label)
			}
		},
		15 * 60 * 1000,
	)

	test(
		'suite passes for correct page implementation',
		async () => {
			const pageImplText = loadResource('correct.page.js')
			const result = await runJestInTempProject({
				pageImplText,
				suiteText,
				dataJsonText,
			})
			expectInnerPass(result, 'correct.page.js')
		},
		5 * 60 * 1000,
	)
	test(
		'meta: enforces >= 90% coverage on correct implementation (requirement 18)',
		async () => {
			const pageImplText = loadResource('correct.page.js')

			const result = await runJestInTempProject({
				pageImplText,
				suiteText,
				dataJsonText,
				enableCoverage: true,
			})

			if (result.failed) {
				console.log('\n===== COVERAGE RUN FAILED =====')
				console.log('TempDir:', result.tempDir)
				console.log('----- STDOUT -----\n', result.stdout || '(empty)')
				console.log('----- STDERR -----\n', result.stderr || '(empty)')
				throw new Error('Coverage run failed. See logs above.')
			}
		},
		10 * 60 * 1000,
	)
})
