const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')

const SUITE_PATH = path.join(ROOT, 'tests', 'suite.jsx')

const RESOURCES = path.join(ROOT, 'tests', 'resources', 'dino')

function loadSuiteText() {
	if (!fs.existsSync(SUITE_PATH)) {
		throw new Error(
			`Missing suite file.\nExpected: ${SUITE_PATH}\nCreate tests/suite.jsx (this is your Jest+RTL test suite).`,
		)
	}
	return fs.readFileSync(SUITE_PATH, 'utf8')
}

function loadImpl(name) {
	return fs.readFileSync(path.join(RESOURCES, name), 'utf8')
}

function makeTempProject(implCode, suiteCode) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dino-meta-'))

	fs.mkdirSync(path.join(dir, 'src', '__tests__'), { recursive: true })

	fs.writeFileSync(
		path.join(dir, 'package.json'),
		JSON.stringify(
			{
				name: 'dino-meta-temp',
				version: '1.0.0',
				private: true,
				scripts: {
					test: 'jest --runInBand --no-coverage',
				},
				dependencies: {
					react: '^18.2.0',
					'react-dom': '^18.2.0',
				},
				devDependencies: {
					jest: '^29.7.0',
					'jest-environment-jsdom': '^29.7.0',
					'@testing-library/react': '^14.0.0',
					'@testing-library/user-event': '^14.4.3',
					'@testing-library/jest-dom': '^6.1.4',
					'babel-jest': '^29.7.0',
					'@babel/core': '^7.23.0',
					'@babel/preset-env': '^7.22.15',
					'@babel/preset-react': '^7.22.15',
				},
				jest: {
					testEnvironment: 'jsdom',
					setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
				},
			},
			null,
			2,
		),
	)

	fs.writeFileSync(
		path.join(dir, 'babel.config.js'),
		`module.exports = {
  presets: [
    ['@babel/preset-env', {targets: {node: 'current'}}],
    ['@babel/preset-react', {runtime: 'automatic'}]
  ]
};`,
	)

	fs.writeFileSync(
		path.join(dir, 'src', 'setupTests.js'),
		`import '@testing-library/jest-dom';`,
	)

	fs.writeFileSync(path.join(dir, 'src', 'DinoGame.jsx'), implCode)

	const fixedSuiteCode = suiteCode
		.replace(
			"import DinoGame from '../DinoGame'",
			"import DinoGame from '../DinoGame.jsx'",
		)
		.replace(
			'import DinoGame from "../DinoGame"',
			'import DinoGame from "../DinoGame.jsx"',
		)

	fs.writeFileSync(
		path.join(dir, 'src', '__tests__', 'DinoGame.test.jsx'),
		fixedSuiteCode,
	)

	return dir
}

function runJest(dir) {
	try {
		execSync('npm install', { cwd: dir, stdio: 'pipe', timeout: 300000 })
		execSync('npm test', { cwd: dir, stdio: 'pipe', timeout: 180000 })
		return { passed: true }
	} catch (err) {
		return {
			passed: false,
			error: err.message,
			stdout: err.stdout?.toString(),
			stderr: err.stderr?.toString(),
		}
	}
}

async function runMetaTests() {
	console.log('=== Running DinoGame Meta Tests ===\n')

	const suiteText = loadSuiteText()

	const tests = [
		{ name: 'broken_double_jump', shouldPass: false },
		{ name: 'broken_no_collision', shouldPass: false },
		{ name: 'broken_no_delta', shouldPass: false },
		{ name: 'broken_no_localstorage', shouldPass: false },
		{ name: 'broken_spawn_unbounded', shouldPass: false },
		{ name: 'correct', shouldPass: true },
	]

	let allPassed = true

	for (const t of tests) {
		console.log(`Testing: ${t.name}`)

		const dir = makeTempProject(loadImpl(`${t.name}.jsx`), suiteText)
		const result = runJest(dir)

		const gotPass = result.passed
		const expectedPass = t.shouldPass
		const ok = gotPass === expectedPass

		if (ok) {
			console.log(`  ✓ ${expectedPass ? 'PASSED' : 'FAILED'} as expected`)
		} else {
			console.log(
				`  ✗ Expected ${expectedPass ? 'PASS' : 'FAIL'}, got ${gotPass ? 'PASS' : 'FAIL'}`,
			)
			console.log('--- JEST STDOUT ---')
			console.log(result.stdout || '(none)')
			console.log('--- JEST STDERR ---')
			console.log(result.stderr || '(none)')
			allPassed = false
		}

		try {
			fs.rmSync(dir, { recursive: true, force: true })
		} catch {}

		console.log()
	}

	console.log('=== Summary ===')
	if (allPassed) console.log('✅ All meta tests passed!')
	else {
		console.log('❌ Some meta tests failed.')
		process.exit(1)
	}
}

process.on('uncaughtException', (error) => {
	console.error('Uncaught Exception:', error)
	process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection at:', promise, 'reason:', reason)
	process.exit(1)
})

runMetaTests().catch((error) => {
	console.error('Test runner failed:', error)
	process.exit(1)
})
