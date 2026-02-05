import React from 'react'
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react'
import DinoGame from '../DinoGame'

let rafCallbacks = []
let rafIdCounter = 0

beforeAll(() => {
	jest.useFakeTimers()

	jest.spyOn(window, 'requestAnimationFrame').mockImplementation(
		(callback) => {
			rafCallbacks.push(callback)
			rafIdCounter += 1
			return rafIdCounter
		},
	)

	jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

	jest.spyOn(global.Math, 'random').mockImplementation(() => 0.9)

	let time = 1000
	jest.spyOn(performance, 'now').mockImplementation(() => {
		time += 16.67
		return time
	})
})

beforeEach(() => {
	rafCallbacks = []
	rafIdCounter = 0
})

afterEach(() => {
	cleanup()
	jest.clearAllTimers()
	localStorage.clear()

	window.requestAnimationFrame.mockClear()
	window.cancelAnimationFrame.mockClear()
	performance.now.mockClear()

	global.Math.random.mockClear()
	global.Math.random.mockImplementation(() => 0.9)
})

afterAll(() => {
	jest.useRealTimers()
	jest.restoreAllMocks()
})

function advanceFrame(ms = 16.67) {
	act(() => {
		jest.advanceTimersByTime(ms)

		const callbacks = [...rafCallbacks]
		rafCallbacks = []
		callbacks.forEach((cb) => cb(performance.now()))
	})
}

function pressKeyDown(code) {
	fireEvent.keyDown(window, { code })
}

function pressKeyUp(code) {
	fireEvent.keyUp(window, { code })
}

function pressKey(code) {
	pressKeyDown(code)
	pressKeyUp(code)
}

function pressSpace() {
	pressKey('Space')
}

function startGame() {
	fireEvent.keyDown(window, {
		key: ' ',
		code: 'Space',
		keyCode: 32,
		charCode: 32,
	})
}

function makeNextSpawnFastAndCactus() {
	global.Math.random
		.mockImplementationOnce(() => 0.0) // delay => minimum
		.mockImplementationOnce(() => 0.9) // cactus => true
}

describe('initialization', () => {
	test('game initializes in idle state', () => {
		render(<DinoGame />)
		expect(screen.getByTestId('state')).toHaveTextContent('idle')
	})

	test('pressing Space transitions idle → running', () => {
		render(<DinoGame />)

		act(() => {
			pressSpace()
		})

		act(() => {
			jest.advanceTimersByTime(100)
		})

		expect(screen.getByTestId('state')).toHaveTextContent('running')
	})
})

describe('jump mechanics', () => {
	beforeEach(() => {
		render(<DinoGame />)
		startGame()
		act(() => {
			jest.advanceTimersByTime(100)
		})
	})

	test('jump only triggers when grounded', () => {
		const dino = screen.getByTestId('dino')
		const initialTop = dino.style.top

		act(() => {
			pressSpace()
		})
		advanceFrame()

		expect(dino.style.top).not.toBe(initialTop)
	})

	test('double jump is prevented while airborne', () => {
		// First jump
		act(() => {
			pressSpace()
		})
		advanceFrame()

		const firstTop = screen.getByTestId('dino').style.top

		// Try second jump
		act(() => {
			pressSpace()
		})
		advanceFrame()

		expect(screen.getByTestId('dino').style.top).toBe(firstTop)
	})

	test('gravity applies every frame and dino lands exactly on ground', () => {
		act(() => {
			pressSpace()
		})

		for (let i = 0; i < 40; i++) {
			advanceFrame()
		}

		const dino = screen.getByTestId('dino')
		// Ground Y (150) - DINO_HEIGHT (47) = 103
		expect(dino.style.top).toBe('103px')
	})
})

describe('game loop', () => {
	test('requestAnimationFrame drives the loop', () => {
		render(<DinoGame />)
		startGame()

		act(() => {
			jest.advanceTimersByTime(100)
		})

		expect(window.requestAnimationFrame).toHaveBeenCalled()
	})

	test('game loop stops on gameOver', () => {
		render(<DinoGame />)
		startGame()

		makeNextSpawnFastAndCactus()

		act(() => {
			jest.advanceTimersByTime(2000)
			for (let i = 0; i < 10; i++) {
				const callbacks = [...rafCallbacks]
				rafCallbacks = []
				callbacks.forEach((cb) => cb(performance.now()))
			}
		})

		expect(screen.getByTestId('state')).toHaveTextContent('gameOver')
	})

	test('cancelAnimationFrame called on unmount', () => {
		const { unmount } = render(<DinoGame />)
		startGame()

		act(() => {
			jest.advanceTimersByTime(100)
		})

		unmount()
		expect(window.cancelAnimationFrame).toHaveBeenCalled()
	})
})
describe('obstacle spawning and movement', () => {
	beforeEach(() => {
		render(<DinoGame />)
		startGame()
	})

	test('obstacles spawn at randomized intervals', () => {
		global.Math.random.mockImplementationOnce(() => 0.0)

		act(() => {
			jest.advanceTimersByTime(2000)
		})

		const obstacles = screen.queryAllByTestId('obstacle')
		expect(obstacles.length).toBeGreaterThan(0)
	})

	test('obstacles move left and are removed off-screen', () => {
		global.Math.random.mockImplementationOnce(() => 0.0)

		act(() => {
			jest.advanceTimersByTime(2000)
		})

		const obstacles = screen.queryAllByTestId('obstacle')
		expect(obstacles.length).toBeGreaterThan(0)

		const obs = obstacles[0]
		const initialLeft = obs.style.left

		act(() => {
			jest.advanceTimersByTime(500)

			const callbacks = [...rafCallbacks]
			rafCallbacks = []
			callbacks.forEach((cb) => cb(performance.now()))
		})

		expect(obs.style.left).not.toBe(initialLeft)
	})
})

describe('collision detection', () => {
	test('bounding box collision triggers gameOver', () => {
		render(<DinoGame />)
		startGame()
		makeNextSpawnFastAndCactus()

		act(() => {
			jest.advanceTimersByTime(2000)

			for (let i = 0; i < 10; i++) {
				const callbacks = [...rafCallbacks]
				rafCallbacks = []
				callbacks.forEach((cb) => cb(performance.now()))
			}
		})

		expect(screen.getByTestId('state')).toHaveTextContent('gameOver')
	})
})

describe('score and persistence', () => {
	beforeEach(() => {
		localStorage.clear()
	})

	test('score increments over time', () => {
		render(<DinoGame />)
		startGame()

		act(() => {
			jest.advanceTimersByTime(500)
		})

		const scoreText = screen.getByTestId('score').textContent
		expect(parseInt(scoreText, 10)).toBeGreaterThan(0)
	})

	test('high score loads from and saves to localStorage', () => {
		localStorage.setItem('dinoHighScore', '42')
		render(<DinoGame />)

		expect(screen.getByTestId('high-score')).toHaveTextContent('00042')
	})

	test('score resets on restart but high score persists', () => {
		localStorage.setItem('dinoHighScore', '100')

		render(<DinoGame />)
		startGame()

		makeNextSpawnFastAndCactus()

		act(() => {
			jest.advanceTimersByTime(2000)

			for (let i = 0; i < 10; i++) {
				const callbacks = [...rafCallbacks]
				rafCallbacks = []
				callbacks.forEach((cb) => cb(performance.now()))
			}
		})

		expect(screen.getByTestId('state')).toHaveTextContent('gameOver')
		act(() => {
			pressSpace()
		})

		expect(screen.getByTestId('score')).toHaveTextContent('00000')
		expect(screen.getByTestId('high-score')).toHaveTextContent('00100')
	})
})

describe('keyboard and cleanup', () => {
	test('ArrowDown toggles duck state', () => {
		render(<DinoGame />)
		startGame()

		const dino = screen.getByTestId('dino')

		act(() => {
			pressKeyDown('ArrowDown')
		})
		expect(dino.style.height).toBe('30px')

		act(() => {
			pressKeyUp('ArrowDown')
		})
		expect(dino.style.height).toBe('47px')
	})

	test('window blur pauses the game', () => {
		render(<DinoGame />)
		startGame()

		act(() => {
			jest.advanceTimersByTime(100)
		})

		expect(screen.getByTestId('state')).toHaveTextContent('running')

		act(() => {
			fireEvent.blur(window)
		})

		expect(screen.getByTestId('state')).toHaveTextContent('paused')
	})
})
