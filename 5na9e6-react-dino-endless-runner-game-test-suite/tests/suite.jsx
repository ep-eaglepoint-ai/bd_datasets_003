import React from 'react'
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'
import DinoGame from '../DinoGame'

let rafQueue = []
let rafId = 0

function mockNow() {
	let t = 1000
	jest.spyOn(performance, 'now').mockImplementation(() => {
		t += 16.67
		return t
	})
}

function flushRafOnce() {
	act(() => {
		const cbs = [...rafQueue]
		rafQueue = []
		cbs.forEach((cb) => cb(performance.now()))
	})
}

function flushRafFrames(n) {
	for (let i = 0; i < n; i++) flushRafOnce()
}

function advanceTimers(ms) {
	act(() => {
		jest.advanceTimersByTime(ms)
	})
}

function keyDown(code) {
	act(() => fireEvent.keyDown(window, { code }))
}
function keyUp(code) {
	act(() => fireEvent.keyUp(window, { code }))
}
function press(code) {
	keyDown(code)
	keyUp(code)
}

function startGame() {
	press('Space')
	advanceTimers(60)
	flushRafOnce()
}

function setDeterministicRandomForSpawns() {
	const seq = [0.0, 0.9, 0.9, 0.9, 0.9]
	let i = 0
	Math.random.mockImplementation(() => {
		const v = seq[i % seq.length]
		i += 1
		return v
	})
}

function expectObstacleSpawned() {
	const obs = screen.queryAllByTestId('obstacle')
	expect(obs.length).toBeGreaterThan(0)
	return obs
}

function runUntilGameOver(maxFrames = 600) {
	for (let i = 0; i < maxFrames; i++) {
		flushRafOnce()
		if (screen.getByTestId('state').textContent.includes('gameOver'))
			return true
	}
	return false
}

beforeAll(() => {
	jest.useFakeTimers()

	jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
		rafQueue.push(cb)
		rafId += 1
		return rafId
	})

	jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

	jest.spyOn(Math, 'random').mockImplementation(() => 0.9)

	mockNow()
})

beforeEach(() => {
	rafQueue = []
	rafId = 0
})

afterEach(() => {
	cleanup()
	jest.clearAllTimers()
	try {
		localStorage.clear()
	} catch {}
})

afterAll(() => {
	jest.useRealTimers()
	jest.restoreAllMocks()
})

describe('1) initialization + start', () => {
	test('initial state is idle on mount', () => {
		render(<DinoGame />)
		expect(screen.getByTestId('state')).toHaveTextContent('idle')
	})

	test('pressing Space transitions idle -> running', () => {
		render(<DinoGame />)
		startGame()
		expect(screen.getByTestId('state')).toHaveTextContent('running')
	})
})

describe('2) jump mechanics + gravity', () => {
	beforeEach(() => {
		render(<DinoGame />)
		startGame()
	})

	test('pressing Space triggers a jump only when grounded', () => {
		const groundedTop = screen.getByTestId('dino').style.top
		press('Space')
		flushRafOnce()
		expect(screen.getByTestId('dino').style.top).not.toBe(groundedTop)
	})

	test('gravity applies every frame (dino continues moving after jump)', () => {
		press('Space')
		flushRafOnce()
		const t1 = screen.getByTestId('dino').style.top
		flushRafOnce()
		const t2 = screen.getByTestId('dino').style.top
		expect(t2).not.toBe(t1)
	})

	test('double jump is prevented while airborne', () => {
		press('Space')
		flushRafOnce()
		const afterFirst = screen.getByTestId('dino').style.top
		press('Space')
		flushRafOnce()
		const afterSecond = screen.getByTestId('dino').style.top
		expect(afterSecond).not.toBe(afterFirst)
	})

	test('dino lands at ground level and jump state resets', () => {
		press('Space')
		flushRafFrames(80)
		expect(screen.getByTestId('dino').style.top).toBe('103px')
	})
})

describe('3) game loop + cleanup', () => {
	test('requestAnimationFrame starts the loop when running', () => {
		render(<DinoGame />)
		startGame()
		expect(window.requestAnimationFrame).toHaveBeenCalled()
	})

	test('loop stops when gameState becomes gameOver', () => {
		setDeterministicRandomForSpawns()

		render(<DinoGame />)
		startGame()

		advanceTimers(1700)
		flushRafOnce()

		expectObstacleSpawned()

		const ok = runUntilGameOver(600)
		expect(ok).toBe(true)
		expect(screen.getByTestId('state')).toHaveTextContent('gameOver')

		const callsAfter = window.requestAnimationFrame.mock.calls.length
		flushRafOnce()
		expect(window.requestAnimationFrame.mock.calls.length).toBe(callsAfter)
	})

	test('cancelAnimationFrame called on unmount', () => {
		const { unmount } = render(<DinoGame />)
		startGame()
		unmount()
		expect(window.cancelAnimationFrame).toHaveBeenCalled()
	})
})

describe('4) obstacle spawning + movement', () => {
	beforeEach(() => {
		setDeterministicRandomForSpawns()
		render(<DinoGame />)
		startGame()
	})

	test('obstacles spawn at randomized intervals (deterministic min delay)', () => {
		advanceTimers(1700)
		flushRafOnce()
		expectObstacleSpawned()
	})

	test('obstacles move left over frames', () => {
		advanceTimers(1700)
		flushRafOnce()

		const obs = expectObstacleSpawned()[0]
		const left1 = obs.style.left

		flushRafFrames(30)
		const left2 = screen.getAllByTestId('obstacle')[0].style.left
		expect(left2).not.toBe(left1)
	})
})

describe('5) collision detection', () => {
	test('collision triggers gameOver', () => {
		setDeterministicRandomForSpawns()

		render(<DinoGame />)
		startGame()

		advanceTimers(1700)
		flushRafOnce()
		expectObstacleSpawned()

		const ok = runUntilGameOver(600)
		expect(ok).toBe(true)
		expect(screen.getByTestId('state')).toHaveTextContent('gameOver')
	})
})

describe('6) score + localStorage', () => {
	test('score increments over time', () => {
		render(<DinoGame />)
		startGame()

		advanceTimers(500)
		flushRafOnce()

		const s = parseInt(screen.getByTestId('score').textContent, 10)
		expect(s).toBeGreaterThan(0)
	})

	test('high score loads from localStorage on mount', () => {
		localStorage.setItem('dinoHighScore', '42')
		render(<DinoGame />)
		expect(screen.getByTestId('high-score')).toHaveTextContent('00042')
	})

	test('score resets on restart but high score persists', () => {
		setDeterministicRandomForSpawns()
		localStorage.setItem('dinoHighScore', '100')

		render(<DinoGame />)
		startGame()

		advanceTimers(1700)
		flushRafOnce()
		expectObstacleSpawned()

		const ok = runUntilGameOver(600)
		expect(ok).toBe(true)
		expect(screen.getByTestId('state')).toHaveTextContent('gameOver')

		press('Space')
		flushRafOnce()

		expect(screen.getByTestId('score')).toHaveTextContent('00000')
		expect(screen.getByTestId('high-score')).toHaveTextContent('00100')
	})
})

describe('7) keyboard + blur', () => {
	test('ArrowDown toggles duck state (height changes)', () => {
		render(<DinoGame />)
		startGame()

		const dino = screen.getByTestId('dino')

		keyDown('ArrowDown')
		flushRafOnce()
		expect(dino.style.height).toBe('30px')

		keyUp('ArrowDown')
		flushRafOnce()
		expect(dino.style.height).toBe('47px')
	})

	test('window blur pauses when running', () => {
		render(<DinoGame />)
		startGame()

		act(() => {
			fireEvent.blur(window)
		})
		flushRafOnce()

		expect(screen.getByTestId('state')).toHaveTextContent('paused')
	})
})
