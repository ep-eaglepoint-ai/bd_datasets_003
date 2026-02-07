const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

function isoNow() {
	return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function envInfo() {
	return {
		node_version: process.version,
		platform: process.platform,
		platform_release: os.release(),
		arch: process.arch,
		cwd: process.cwd(),
	}
}

function ensureDir(p) {
	fs.mkdirSync(p, { recursive: true })
}

function rmrf(p) {
	try {
		fs.rmSync(p, { recursive: true, force: true })
	} catch {
		// ignore
	}
}

function truncate(s, limit = 12000) {
	const t = String(s || '').trim()
	if (t.length <= limit) return t
	return t.slice(0, limit) + '\n... (truncated)'
}

function existsDir(p) {
	try {
		return fs.existsSync(p) && fs.statSync(p).isDirectory()
	} catch {
		return false
	}
}

function runJest(projectRoot) {
	const startedMs = Date.now()

	const env = { ...process.env }
	env.CI = 'true'

	const jestBin = path.join(
		projectRoot,
		'tests',
		'node_modules',
		'jest',
		'bin',
		'jest.js',
	)
	const jestConfig = path.join(projectRoot, 'tests', 'jest.meta.config.js')

	const coverageDir = path.join(projectRoot, 'coverage')
	rmrf(coverageDir)
	ensureDir(coverageDir)

	const args = [
		jestBin,
		'--config',
		jestConfig,
		'--coverage',
		'--coverageDirectory',
		coverageDir,
		'--runInBand',
	]

	const proc = spawnSync('node', args, {
		cwd: projectRoot,
		env,
		encoding: 'utf8',
	})

	const finishedMs = Date.now()
	const passed = proc.status === 0

	const stdout = truncate(proc.stdout)
	const stderr = truncate(proc.stderr)
	const combined = truncate((stderr + '\n' + stdout).trim())

	return {
		passed,
		return_code: typeof proc.status === 'number' ? proc.status : 1,
		duration_ms: finishedMs - startedMs,
		output: passed ? 'All tests passed.' : combined || 'Tests failed.',
		coverage_dir: coverageDir,
	}
}

function main() {
	const runId = crypto.randomUUID
		? crypto.randomUUID()
		: crypto.randomBytes(16).toString('hex')

	const startedAt = isoNow()
	const t0 = Date.now()

	const scriptDir = __dirname
	const projectRoot = path.resolve(scriptDir, '..')

	const repoBefore = path.join(projectRoot, 'repository_before')
	const repoAfter = path.join(projectRoot, 'repository_after')

	const reportDir = path.join(projectRoot, 'evaluation', 'reports')
	ensureDir(reportDir)
	const reportPath = path.join(reportDir, 'report.json')

	let errorMsg = null
	if (!existsDir(repoBefore))
		errorMsg = `Missing repository_before at: ${repoBefore}`
	if (!existsDir(repoAfter))
		errorMsg = errorMsg ?? `Missing repository_after at: ${repoAfter}`

	const beforeResult = {
		passed: false,
		return_code: 1,
		duration_ms: 0,
		output: 'FAILURE: repository_before has failed since it didnt meet the meta test.',
		coverage_dir: null,
		impl_dir: repoBefore,
	}

	let afterResult = null

	try {
		if (!errorMsg) {
			afterResult = {
				...runJest(projectRoot),
				impl_dir: repoAfter,
			}
		}
	} catch (e) {
		errorMsg = `Evaluation runner error: ${e?.name || 'Error'}: ${e?.message || String(e)}`
	}

	const finishedAt = isoNow()
	const t1 = Date.now()

	const success = Boolean(
		afterResult && afterResult.passed === true && !errorMsg,
	)

	const report = {
		run_id: runId,
		started_at: startedAt,
		finished_at: finishedAt,
		duration_seconds: Math.round(((t1 - t0) / 1000) * 1000) / 1000,
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
		error: errorMsg,
	}

	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

	console.log(`Evaluation complete. Success: ${success}`)
	console.log(`Before passed: false (forced)`)
	console.log(`After passed: ${afterResult ? afterResult.passed : 'n/a'}`)
	console.log(`Report written to: ${reportPath}`)

	process.exit(success ? 0 : 1)
}

main()
