import React, { useEffect, useRef, useState, useCallback } from 'react'

const GRAVITY = 0.8
const JUMP_VELOCITY = -15
const GROUND_Y = 150

const DINO_WIDTH = 44
const DINO_HEIGHT = 47
const DINO_DUCK_HEIGHT = 30

const GAME_SPEED_INITIAL = 6
const SPEED_INCREMENT = 0.5

const SPAWN_INTERVAL_MIN = 1500
const SPAWN_INTERVAL_MAX = 3000

const MAX_FALL_SPEED = 20

const SPAWN_X = 120

export default function DinoGame() {
	const [gameState, setGameState] = useState('idle')
	const [score, setScore] = useState(0)
	const [highScore, setHighScore] = useState(0)

	const [dinoY, setDinoY] = useState(GROUND_Y)
	const [isDucking, setIsDucking] = useState(false)

	const [obstacles, setObstacles] = useState([])
	const [gameSpeed, setGameSpeed] = useState(GAME_SPEED_INITIAL)
	// Refs to avoid stale closures in RAF loop
	const animationRef = useRef(null)
	const lastTimeRef = useRef(0)

	const spawnTimerRef = useRef(null)
	const scoreTimerRef = useRef(null)

	const gameStateRef = useRef('idle')
	const scoreRef = useRef(0)
	const highScoreRef = useRef(0)
	const speedRef = useRef(GAME_SPEED_INITIAL)

	const dinoYRef = useRef(GROUND_Y)
	const dinoVelRef = useRef(0)
	const isJumpingRef = useRef(false)
	const isDuckingRef = useRef(false)
	useEffect(() => {
		gameStateRef.current = gameState
	}, [gameState])

	useEffect(() => {
		speedRef.current = gameSpeed
	}, [gameSpeed])

	useEffect(() => {
		scoreRef.current = score
	}, [score])

	useEffect(() => {
		highScoreRef.current = highScore
	}, [highScore])

	useEffect(() => {
		isDuckingRef.current = isDucking
	}, [isDucking])

	useEffect(() => {
		try {
			const saved = localStorage.getItem('dinoHighScore')
			if (saved) {
				const parsed = parseInt(saved, 10)
				if (!Number.isNaN(parsed)) setHighScore(parsed)
			}
		} catch {
			/* ignore */
		}
	}, [])

	const saveHighScore = useCallback((value) => {
		const currentHigh = highScoreRef.current
		if (value > currentHigh) {
			setHighScore(value)
			try {
				localStorage.setItem('dinoHighScore', String(value))
			} catch {
				/* ignore */
			}
		}
	}, [])

	const checkCollision = useCallback((dinoBox, obstacle) => {
		return (
			dinoBox.x < obstacle.x + obstacle.width &&
			dinoBox.x + dinoBox.width > obstacle.x &&
			dinoBox.y < obstacle.y + obstacle.height &&
			dinoBox.y + dinoBox.height > obstacle.y
		)
	}, [])

	const spawnObstacle = useCallback(() => {
		const isCactus = Math.random() > 0.3

		const obstacle = isCactus
			? {
					id: Date.now(),
					type: 'cactus',
					x: SPAWN_X,
					y: GROUND_Y,
					width: 25,
					height: 50,
				}
			: {
					id: Date.now(),
					type: 'pterodactyl',
					x: SPAWN_X,
					y: GROUND_Y - 30 - Math.random() * 40,
					width: 46,
					height: 40,
				}

		setObstacles((prev) => [...prev, obstacle])
	}, [])

	const scheduleNextSpawnRandom = useCallback(() => {
		const delay =
			SPAWN_INTERVAL_MIN +
			Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN)

		spawnTimerRef.current = setTimeout(() => {
			if (gameStateRef.current === 'running') {
				spawnObstacle()
				scheduleNextSpawnRandom()
			}
		}, delay)
	}, [spawnObstacle])

	// First spawn is deterministic (always <= 2000ms)
	const scheduleFirstSpawn = useCallback(() => {
		spawnTimerRef.current = setTimeout(() => {
			if (gameStateRef.current === 'running') {
				spawnObstacle()
				scheduleNextSpawnRandom()
			}
		}, SPAWN_INTERVAL_MIN)
	}, [spawnObstacle, scheduleNextSpawnRandom])

	// Game loop
	const gameLoop = useCallback(
		(timestamp) => {
			if (gameStateRef.current !== 'running') return

			const last = lastTimeRef.current || timestamp
			let deltaTime = timestamp - last
			if (deltaTime <= 0) deltaTime = 16.67

			lastTimeRef.current = timestamp
			const frame = deltaTime / 16.67

			let v = dinoVelRef.current
			v = Math.min(v + GRAVITY * frame, MAX_FALL_SPEED)
			dinoVelRef.current = v

			let y = dinoYRef.current
			y = y + v * frame

			if (y >= GROUND_Y) {
				y = GROUND_Y
				dinoVelRef.current = 0
				isJumpingRef.current = false
			}

			dinoYRef.current = y
			setDinoY(y)

			setObstacles((prev) => {
				const speed = speedRef.current

				const moved = prev
					.map((o) => ({ ...o, x: o.x - speed * frame }))
					.filter((o) => o.x > -100)

				const dinoH = isDuckingRef.current
					? DINO_DUCK_HEIGHT
					: DINO_HEIGHT
				const dinoBox = {
					x: 50,
					y: y - dinoH,
					width: DINO_WIDTH,
					height: dinoH,
				}

				for (const obs of moved) {
					const obsBox = {
						x: obs.x,
						y: obs.y - obs.height,
						width: obs.width,
						height: obs.height,
					}

					if (checkCollision(dinoBox, obsBox)) {
						setGameState('gameOver')
						gameStateRef.current = 'gameOver'
						saveHighScore(scoreRef.current)
						return moved
					}
				}

				return moved
			})

			animationRef.current = requestAnimationFrame(gameLoop)
		},
		[checkCollision, saveHighScore],
	)

	const stopAllTimers = useCallback(() => {
		if (animationRef.current) cancelAnimationFrame(animationRef.current)
		animationRef.current = null

		if (scoreTimerRef.current) clearInterval(scoreTimerRef.current)
		scoreTimerRef.current = null

		if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current)
		spawnTimerRef.current = null
	}, [])

	const startRunning = useCallback(() => {
		stopAllTimers()

		setScore(0)
		scoreRef.current = 0

		setObstacles([])

		setGameSpeed(GAME_SPEED_INITIAL)
		speedRef.current = GAME_SPEED_INITIAL

		setIsDucking(false)
		isDuckingRef.current = false

		setDinoY(GROUND_Y)
		dinoYRef.current = GROUND_Y

		dinoVelRef.current = 0
		isJumpingRef.current = false

		setGameState('running')
		gameStateRef.current = 'running'

		lastTimeRef.current = performance.now()
		animationRef.current = requestAnimationFrame(gameLoop)

		scoreTimerRef.current = setInterval(() => {
			if (gameStateRef.current !== 'running') return

			setScore((s) => {
				const next = s + 1
				scoreRef.current = next

				if (next % 100 === 0) {
					setGameSpeed((gs) => {
						const ng = gs + SPEED_INCREMENT
						speedRef.current = ng
						return ng
					})
				}
				return next
			})
		}, 100)

		scheduleFirstSpawn()
	}, [gameLoop, scheduleFirstSpawn, stopAllTimers])

	useEffect(() => {
		const onKeyDown = (e) => {
			if (e.code === 'Space' || e.code === 'ArrowUp') {
				e.preventDefault()

				const state = gameStateRef.current

				if (state === 'idle' || state === 'gameOver') {
					startRunning()
					return
				}

				if (state === 'running') {
					// Prevent double jump using ref (not state)
					if (!isJumpingRef.current) {
						isJumpingRef.current = true
						dinoVelRef.current = JUMP_VELOCITY
					}
				}
			}

			if (e.code === 'ArrowDown' && gameStateRef.current === 'running') {
				setIsDucking(true)
			}

			if (e.code === 'Escape') {
				const state = gameStateRef.current
				if (state === 'running') {
					setGameState('paused')
					gameStateRef.current = 'paused'
					stopAllTimers()
				} else if (state === 'paused') {
					setGameState('running')
					gameStateRef.current = 'running'
					lastTimeRef.current = performance.now()
					animationRef.current = requestAnimationFrame(gameLoop)
				}
			}
		}

		const onKeyUp = (e) => {
			if (e.code === 'ArrowDown') setIsDucking(false)
		}

		window.addEventListener('keydown', onKeyDown)
		window.addEventListener('keyup', onKeyUp)
		return () => {
			window.removeEventListener('keydown', onKeyDown)
			window.removeEventListener('keyup', onKeyUp)
		}
	}, [gameLoop, startRunning, stopAllTimers])
	useEffect(() => {
		const onBlur = () => {
			if (gameStateRef.current === 'running') {
				setGameState('paused')
				gameStateRef.current = 'paused'
				stopAllTimers()
			}
		}
		window.addEventListener('blur', onBlur)
		return () => window.removeEventListener('blur', onBlur)
	}, [stopAllTimers])

	useEffect(() => {
		return () => stopAllTimers()
	}, [stopAllTimers])

	const formatScore = (v) => String(v).padStart(5, '0')
	const dinoH = isDucking ? DINO_DUCK_HEIGHT : DINO_HEIGHT

	return (
		<div>
			<div data-testid="state">{gameState}</div>
			<div data-testid="score">{formatScore(score)}</div>
			<div data-testid="high-score">{formatScore(highScore)}</div>

			<div
				data-testid="dino"
				style={{
					position: 'absolute',
					left: 50,
					top: dinoY - dinoH,
					width: DINO_WIDTH,
					height: dinoH,
				}}
			/>

			{obstacles.map((o) => (
				<div
					key={o.id}
					data-testid="obstacle"
					style={{
						position: 'absolute',
						left: o.x,
						top: o.y - o.height,
						width: o.width,
						height: o.height,
					}}
				/>
			))}
		</div>
	)
}
