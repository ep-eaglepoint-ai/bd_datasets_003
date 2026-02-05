const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

function isoNow() {
	return new Date().toISOString()
}

function ensureDir(p) {
	fs.mkdirSync(p, { recursive: true })
}

function truncate(s, limit = 4000) {
	s = (s || '').toString().trim()
	if (s.length <= limit) return s
	return s.slice(0, limit) + '\n... (truncated)'
}

function envInfo() {
	return {
		node_version: process.version,
		platform: os.platform(),
		platform_release: os.release(),
		arch: os.arch(),
		cpu: os.cpus()?.[0]?.model || '',
		cwd: process.cwd(),
	}
}

function runJest(projectRoot, targetRepo) {
	const started = Date.now()

	const jestBin = path.join(
		projectRoot,
		'repository_after',
		'kanban_app',
		'node_modules',
		'jest',
		'bin',
		'jest.js',
	)

	const metaConfig = path.join(projectRoot, 'jest.meta.config.js')

	const proc = spawnSync(
		'node',
		[jestBin, '--config', metaConfig, '--runInBand', '--silent'],
		{
			cwd: projectRoot,
			encoding: 'utf8',
			env: {
				...process.env,
				CI: 'true',
				NODE_ENV: 'test',
				NEXT_TELEMETRY_DISABLED: '1',
				TARGET_REPO: targetRepo,
			},
		},
	)

	const finished = Date.now()
	const passed = proc.status === 0

	const stdout = truncate(proc.stdout)
	const stderr = truncate(proc.stderr)
	const combined = truncate((stderr + '\n' + stdout).trim())

	return {
		passed,
		return_code: proc.status ?? 1,
		duration_ms: finished - started,
		output: passed ? 'All tests passed.' : combined || 'Tests failed.',
	}
}

function main() {
	const run_id = crypto.randomUUID()
	const started_at = isoNow()
	const t0 = Date.now()

	const projectRoot = path.resolve(__dirname, '..') // /app
	const repoBefore = path.join(projectRoot, 'repository_before')
	const repoAfter = path.join(projectRoot, 'repository_after')

	const reportDir = path.join(projectRoot, 'evaluation', 'reports')
	ensureDir(reportDir)
	const reportPath = path.join(reportDir, 'report.json')

	let error = null

	if (!fs.existsSync(repoBefore))
		error = `Missing repository_before at: ${repoBefore}`
	if (!fs.existsSync(repoAfter))
		error = error
			? `${error}\nMissing repository_after at: ${repoAfter}`
			: `Missing repository_after at: ${repoAfter}`

	let before = null
	let after = null

	try {
		if (!error) {
			before = runJest(projectRoot, 'repository_before')
			after = runJest(projectRoot, 'repository_after')
		}
	} catch (e) {
		error = `Evaluation runner error: ${e?.name || 'Error'}: ${e?.message || String(e)}`
	}

	const finished_at = isoNow()
	const t1 = Date.now()

	const success =
		!error &&
		before &&
		after &&
		before.passed === false &&
		after.passed === true

	const report = {
		run_id,
		started_at,
		finished_at,
		duration_seconds: Number(((t1 - t0) / 1000).toFixed(3)),
		environment: envInfo(),
		tests: { before, after },
		success,
		error,
	}

	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')

	console.log(`Evaluation complete. Success: ${success}`)
	console.log(`Report written to: ${reportPath}`)

	process.exit(success ? 0 : 1)
}

main()
