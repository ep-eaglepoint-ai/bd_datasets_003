// tests/helpers/runJestInTempProject.js
const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')

// ✅ IMPORTANT: run against whichever repo the evaluator sets
//   TARGET_REPO=repository_before  OR  TARGET_REPO=repository_after
const TARGET_REPO = process.env.TARGET_REPO || 'repository_after'

const KANBAN_APP_DIR = path.resolve(
	__dirname,
	'..',
	'..',
	TARGET_REPO,
	'kanban_app',
)

const NODE_MODULES_DIR = path.join(KANBAN_APP_DIR, 'node_modules')
const JEST_JS = path.join(NODE_MODULES_DIR, 'jest', 'bin', 'jest.js')

let BASE_DIR = null

function safeWrite(filePath, content) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, content, 'utf8')
}

function ensureBaseProject() {
	if (BASE_DIR) return BASE_DIR

	const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-meta-base-'))

	// ✅ next/babel transform expects a project root with a package.json
	safeWrite(
		path.join(baseDir, 'package.json'),
		JSON.stringify(
			{ name: 'kanban-meta-temp', private: true, version: '0.0.0' },
			null,
			2,
		) + '\n',
	)

	safeWrite(
		path.join(baseDir, 'jest.setup.js'),
		'import "@testing-library/jest-dom";\n',
	)

	safeWrite(
		path.join(baseDir, '__mocks__', 'styleMock.js'),
		'module.exports = {};\n',
	)

	safeWrite(
		path.join(baseDir, 'babel.config.js'),
		'module.exports = { presets: ["next/babel"] };\n',
	)

	safeWrite(
		path.join(baseDir, 'jest.config.js'),
		`
module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["<rootDir>/app/**/*.test.js"],
  transform: {
    "^.+\\\\.(js|jsx|mjs|cjs)$": "babel-jest",
  },
  moduleNameMapper: {
    "\\\\.(css|less|scss|sass)$": "<rootDir>/__mocks__/styleMock.js",
  },
  clearMocks: true,
  verbose: false,
  maxWorkers: 1,
};
`.trim() + '\n',
	)

	// ✅ One symlink only (fast). Each run gets its own runDir but shares deps/cache.
	const linkPath = path.join(baseDir, 'node_modules')
	try {
		fs.symlinkSync(NODE_MODULES_DIR, linkPath, 'dir')
	} catch (e) {
		// If symlink already exists, ignore; else throw with detail
		if (!fs.existsSync(linkPath)) {
			throw new Error(
				`Failed to symlink node_modules into temp base project.\nFrom: ${NODE_MODULES_DIR}\nTo:   ${linkPath}\nError: ${e.message}`,
			)
		}
	}

	fs.mkdirSync(path.join(baseDir, '.jest-cache'), { recursive: true })

	BASE_DIR = baseDir
	return baseDir
}

function runJestInTempProject({ pageImplText, suiteText, dataJsonText }) {
	const baseDir = ensureBaseProject()

	// ✅ isolate per run so module cache doesn't leak between broken/correct pages
	const runDir = fs.mkdtempSync(path.join(baseDir, 'run-'))
	const appDir = path.join(runDir, 'app')
	fs.mkdirSync(appDir, { recursive: true })

	// copy minimal config files into runDir
	for (const f of [
		'package.json',
		'jest.setup.js',
		'jest.config.js',
		'babel.config.js',
	]) {
		safeWrite(
			path.join(runDir, f),
			fs.readFileSync(path.join(baseDir, f), 'utf8'),
		)
	}

	fs.mkdirSync(path.join(runDir, '__mocks__'), { recursive: true })
	safeWrite(
		path.join(runDir, '__mocks__', 'styleMock.js'),
		fs.readFileSync(
			path.join(baseDir, '__mocks__', 'styleMock.js'),
			'utf8',
		),
	)

	// ✅ symlink base node_modules into runDir
	try {
		fs.symlinkSync(
			path.join(baseDir, 'node_modules'),
			path.join(runDir, 'node_modules'),
			'dir',
		)
	} catch (e) {
		if (!fs.existsSync(path.join(runDir, 'node_modules'))) {
			throw e
		}
	}

	// write test inputs
	safeWrite(path.join(appDir, 'page.js'), (pageImplText || '') + '\n')
	safeWrite(path.join(appDir, 'page.test.js'), (suiteText || '') + '\n')
	safeWrite(
		path.join(runDir, 'data.json'),
		(dataJsonText || '').trim() + '\n',
	)

	return new Promise((resolve) => {
		const args = [
			JEST_JS,
			'--config',
			path.join(runDir, 'jest.config.js'),
			'--runInBand',
			'--cacheDirectory',
			path.join(baseDir, '.jest-cache'), // ✅ shared cache across runs
			'--runTestsByPath',
			path.join(appDir, 'page.test.js'),
			'--silent',
			'--forceExit',
		]

		const child = spawn('node', args, {
			cwd: runDir,
			env: {
				...process.env,
				CI: 'true',
				NODE_ENV: 'test',
				NEXT_TELEMETRY_DISABLED: '1',
				// ✅ Make it explicit inside the inner run too (useful for debugging)
				TARGET_REPO,
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		})

		let stdout = ''
		let stderr = ''

		child.stdout.on('data', (d) => (stdout += d.toString()))
		child.stderr.on('data', (d) => (stderr += d.toString()))

		child.on('close', (code) => {
			resolve({
				failed: code !== 0,
				code,
				stdout,
				stderr,
				tempDir: runDir,
			})
		})
	})
}

module.exports = { runJestInTempProject }
