const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

function isoNow() {
	return new Date().toISOString()
}

function envInfo() {
	return {
		node_version: process.version,
		platform: process.platform,
		platform_release: os.release?.() || '',
		arch: process.arch,
		cpus: os.cpus()?.length || 1,
		cwd: process.cwd(),
	}
}

function ensureDir(p) {
	fs.mkdirSync(p, { recursive: true })
}

function truncate(s, limit = 4000) {
	s = (s || '').trim()
	if (s.length <= limit) return s
	return s.slice(0, limit) + '\n... (truncated)'
}

function runMetaTests(projectRoot) {
	const startedMs = Date.now()

	// We run from /app/tests so we can call test_dino_meta.test.js directly
	const testsDir = path.join(projectRoot, 'tests')
	const cmd = 'node'
	const args = ['test_dino_meta.test.js']

	const proc = spawnSync(cmd, args, {
		cwd: testsDir,
		env: { ...process.env, CI: 'true' },
		encoding: 'utf-8',
		stdio: ['ignore', 'pipe', 'pipe'],
	})

	const finishedMs = Date.now()
	const passed = proc.status === 0

	const stdout = truncate(proc.stdout || '')
	const stderr = truncate(proc.stderr || '')
	const combined = truncate((stderr + '\n' + stdout).trim())

	return {
		passed,
		return_code: typeof proc.status === 'number' ? proc.status : 1,
		duration_ms: finishedMs - startedMs,
		output: passed
			? 'All meta tests passed.'
			: combined || 'Meta tests failed.',
	}
}

function main() {
	const runId = crypto.randomUUID
		? crypto.randomUUID()
		: crypto.randomBytes(16).toString('hex')

	const startedAt = isoNow()
	const t0 = Date.now()

	const projectRoot = path.resolve(__dirname, '..') // /app/evaluation/.. => /app
	const reportDir = path.join(projectRoot, 'evaluation', 'reports')
	ensureDir(reportDir)

	let errorMsg = null
	let result = null

	try {
		result = runMetaTests(projectRoot)
	} catch (e) {
		errorMsg = `Evaluation runner error: ${e?.name || 'Error'}: ${e?.message || String(e)}`
	}

	const finishedAt = isoNow()
	const t1 = Date.now()

	const success = Boolean(
		result && result.passed === true && errorMsg == null,
	)

	const report = {
		run_id: runId,
		started_at: startedAt,
		finished_at: finishedAt,
		duration_seconds: Number(((t1 - t0) / 1000).toFixed(3)),
		environment: envInfo(),
		meta_test: result,
		success,
		error: errorMsg,
	}

	const reportPath = path.join(reportDir, 'report.json')
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')

	console.log(`Evaluation complete. Success: ${success}`)
	console.log(`Report written to: ${reportPath}`)

	process.exit(success ? 0 : 1)
}

main()
