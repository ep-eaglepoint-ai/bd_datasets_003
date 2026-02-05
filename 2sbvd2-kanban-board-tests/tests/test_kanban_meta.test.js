const fs = require('fs')
const path = require('path')

const { loadSuiteText } = require('./helpers/loadSuiteText')
const { runJestInTempProject } = require('./helpers/runJestInTempProject')

const RES_DIR = path.resolve(__dirname, 'resources', 'kanban')

function loadResource(filename) {
	return fs.readFileSync(path.join(RES_DIR, filename), 'utf8')
}

function loadDataJson() {
	const targetRepo = process.env.TARGET_REPO || 'repository_after'

	const jsonPath = path.resolve(
		__dirname,
		'..',
		targetRepo,
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
		15 * 60 * 1000, // timeout (15 min)
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
})
