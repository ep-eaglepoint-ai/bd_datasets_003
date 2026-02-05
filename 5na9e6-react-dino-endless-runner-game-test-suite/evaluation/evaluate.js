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
		arch: process.arch,
		cpus: os.cpus()?.length || 1,
	}
}

function ensureDir(p) {
	fs.mkdirSync(p, { recursive: true })
}

function runMetaTests() {
	const started = Date.now()

	const cmd = 'node'
	const args = ['test_dino_meta.test.js']

	const proc = spawnSync(cmd, args, {
		cwd: process.cwd(),
		env: { ...process.env, CI: 'true' },
		encoding: 'utf-8',
		stdio: ['ignore', 'pipe', 'pipe'],
	})

	const finished = Date.now()
	const passed = proc.status === 0

	const stderr = (proc.stderr || '').trim()
	const stdout = (proc.stdout || '').trim()
	const output = (stderr || stdout || '').slice(0, 2000)

	return {
		passed,
		return_code: typeof proc.status === 'number' ? proc.status : 1,
		duration_ms: finished - started,
		output: passed
			? 'All meta tests passed.'
			: output || 'Meta tests failed.',
	}
}

function main() {
	const runId = crypto.randomUUID
		? crypto.randomUUID()
		: crypto.randomBytes(16).toString('hex')
	const startedAt = isoNow()
	const t0 = Date.now()

	const result = runMetaTests()

	const t1 = Date.now()
	const finishedAt = isoNow()

	const reportDir = path.resolve(process.cwd(), '..', 'evaluation', 'reports')
	ensureDir(reportDir)

	const report = {
		run_id: runId,
		started_at: startedAt,
		finished_at: finishedAt,
		duration_seconds: Number(((t1 - t0) / 1000).toFixed(3)),
		environment: envInfo(),
		meta_test: result,
		success: result.passed,
		error: null,
	}

	const reportPath = path.join(reportDir, 'report.json')
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8')

	console.log(`Evaluation complete. Success: ${report.success}`)
	console.log(`Report written to: ${reportPath}`)

	process.exit(report.success ? 0 : 1)
}

main()
