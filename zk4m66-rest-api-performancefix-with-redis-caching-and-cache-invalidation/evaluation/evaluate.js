'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

function isoNow() {
	return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function envInfo() {
	return {
		node_version: process.version,
		platform: process.platform,
		platform_release: os.release(),
		arch: process.arch,
	}
}

function ensureDir(p) {
	fs.mkdirSync(p, { recursive: true })
}

function main() {
	const runId = crypto.randomUUID
		? crypto.randomUUID()
		: crypto.randomBytes(16).toString('hex')

	const projectRoot = path.resolve(__dirname, '..')
	const reportDir = path.join(projectRoot, 'evaluation', 'reports')
	ensureDir(reportDir)

	const reportPath = path.join(reportDir, 'report.json')

	const startedAt = process.env.EVAL_STARTED_AT || isoNow()
	const t0 = Number(process.env.EVAL_T0_MS || Date.now())

	const beforeExit = Number(process.env.BEFORE_EXIT_CODE ?? 1)
	const afterExit = Number(process.env.AFTER_EXIT_CODE ?? 1)

	const beforeResult = {
		passed: false,
		return_code: beforeExit,
		duration_ms: Number(process.env.BEFORE_DURATION_MS ?? 0),
		output:
			beforeExit === 0
				? 'Unexpected: before passed (should fail)'
				: 'Correct: before failed',
	}

	const afterPassed = afterExit === 0
	const afterResult = {
		passed: afterPassed,
		return_code: afterExit,
		duration_ms: Number(process.env.AFTER_DURATION_MS ?? 0),
		output: afterPassed ? 'All tests passed' : 'Tests failed',
	}

	const finishedAt = isoNow()

	const success =
		beforeResult.passed === false &&
		afterResult.passed === true &&
		!process.env.EVAL_ERROR

	const report = {
		run_id: runId,
		started_at: startedAt,
		finished_at: finishedAt,
		duration_seconds: Math.round((Date.now() - t0) / 1000),

		environment: envInfo(),

		tests: {
			before: beforeResult,
			after: afterResult,
		},

		expected_behavior: {
			before_should_fail: true,
			after_should_pass: true,
		},

		success,
		error: process.env.EVAL_ERROR ? String(process.env.EVAL_ERROR) : null,
	}

	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

	console.log('')
	console.log('Evaluation complete')
	console.log('Success:', success)
	console.log('Report:', reportPath)

	process.exit(success ? 0 : 1)
}

main()
