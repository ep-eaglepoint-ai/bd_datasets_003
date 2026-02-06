// tests/resources/dino/broken_no_delta.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react'

/**
 * BROKEN:
 * - Does NOT use delta time for physics or obstacle movement.
 * - Gravity and movement are applied as fixed per-frame steps.
 */

const GRAVITY = 0.8 // ❌ applied per frame (wrong)
const JUMP_VELOCITY = -15
const GROUND_Y = 150

const DINO_WIDTH = 44
const DINO_HEIGHT = 47
const DINO_DUCK_HEIGHT = 30

const GAME_SPEED_INITIAL = 6
const SPEED_INCREMENT = 0.5

const SPAWN_INTERVAL_MIN = 1500
const SPAWN_INTERVAL_MAX = 3000

export default function DinoGame() {
	const [gameState, setGameState] = useState('idle')

	const [score, setScore] = useState(0)
	const [highScore, setHighScore] = useState(0)

	const [dinoY, setDinoY] = useState(GROUND_Y)
	const [dinoVelocity, setDinoVelocity] = useState(0)
	const [isJumping, setIsJumping] = useState(false)
	const [isDucking, setIsDucking] = useState(false)

	const [obstacles, setObstacles] = useState([])
	const [gameSpeed, setGameSpeed] = useState(GAME_SPEED_INITIAL)

	const rafRef = useRef(null)
	const spawnTimerRef = useRef(null)
	const scoreTimerRef = useRef(null)

	useEffect(() => {
		try {
			const saved = localStorage.getItem('dinoHighScore')
			if (saved) {
				const v = parseInt(saved, 10)
				if (!Number.isNaN(v)) setHighScore(v)
			}
		} catch {
			// ignore
		}
	}, [])

	const saveHighScore = useCallback(
		(v) => {
			if (v > highScore) {
				setHighScore(v)
				try {
					localStorage.setItem('dinoHighScore', String(v))
				} catch {
					// ignore
				}
			}
		},
		[highScore],
	)

	const overlaps = (a, b) =>
		a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y

	const spawnObstacle = useCallback(() => {
		const isCactus = Math.random() > 0.3
		const obs = isCactus
			? {
					id: Date.now(),
					type: 'cactus',
					x: 800,
					y: GROUND_Y,
					width: 25,
					height: 50,
				}
			: {
					id: Date.now(),
					type: 'pterodactyl',
					x: 800,
					y: GROUND_Y - 30 - Math.random() * 40,
					width: 46,
					height: 40,
				}
		setObstacles((prev) => [...prev, obs])
	}, [])

	const gameLoop = useCallback(() => {
		if (gameState !== 'running') return

		// ❌ BROKEN: no delta-time. Fixed-per-frame physics.
		setDinoVelocity((v) => Math.min(v + GRAVITY, 20))
		setDinoY((y) => {
			const next = y + dinoVelocity
			if (next >= GROUND_Y) {
				setIsJumping(false)
				setDinoVelocity(0)
				return GROUND_Y
			}
			return next
		})

		// ❌ BROKEN: fixed-per-frame obstacle movement
		setObstacles((prev) => {
			const moved = prev
				.map((o) => ({ ...o, x: o.x - gameSpeed }))
				.filter((o) => o.x > -50)

			const dinoH = isDucking ? DINO_DUCK_HEIGHT : DINO_HEIGHT
			const dinoBox = {
				x: 50,
				y: dinoY - dinoH,
				width: DINO_WIDTH,
				height: dinoH,
			}

			for (const o of moved) {
				const obsBox = {
					x: o.x,
					y: o.y - o.height,
					width: o.width,
					height: o.height,
				}
				if (overlaps(dinoBox, obsBox)) {
					setGameState('gameOver')
					saveHighScore(score)
					break
				}
			}

			return moved
		})

		rafRef.current = requestAnimationFrame(gameLoop)
	}, [
		gameState,
		dinoVelocity,
		dinoY,
		gameSpeed,
		isDucking,
		score,
		saveHighScore,
	])

	useEffect(() => {
		if (gameState === 'running') {
			rafRef.current = requestAnimationFrame(gameLoop)

			scoreTimerRef.current = setInterval(() => {
				setScore((s) => {
					const next = s + 1
					if (next % 100 === 0)
						setGameSpeed((gs) => gs + SPEED_INCREMENT)
					return next
				})
			}, 100)

			const schedule = () => {
				const delay =
					SPAWN_INTERVAL_MIN +
					Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN)
				spawnTimerRef.current = setTimeout(() => {
					if (gameState === 'running') {
						spawnObstacle()
						schedule()
					}
				}, delay)
			}
			schedule()
		}

		return () => {
			cancelAnimationFrame(rafRef.current)
			clearInterval(scoreTimerRef.current)
			clearTimeout(spawnTimerRef.current)
		}
	}, [gameState, gameLoop, spawnObstacle])

	useEffect(() => {
		const onKeyDown = (e) => {
			if (e.code === 'Space' || e.code === 'ArrowUp') {
				e.preventDefault()

				if (gameState === 'idle' || gameState === 'gameOver') {
					setScore(0)
					setObstacles([])
					setGameSpeed(GAME_SPEED_INITIAL)
					setIsDucking(false)

					setDinoY(GROUND_Y)
					setDinoVelocity(0)
					setIsJumping(false)

					setGameState('running')
					return
				}

				if (gameState === 'running' && !isJumping) {
					setIsJumping(true)
					setDinoVelocity(JUMP_VELOCITY)
				}
			}

			if (e.code === 'ArrowDown' && gameState === 'running') {
				setIsDucking(true)
			}

			if (e.code === 'Escape') {
				if (gameState === 'running') setGameState('paused')
				else if (gameState === 'paused') setGameState('running')
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
	}, [gameState, isJumping])

	useEffect(() => {
		const onBlur = () => {
			if (gameState === 'running') setGameState('paused')
		}
		window.addEventListener('blur', onBlur)
		return () => window.removeEventListener('blur', onBlur)
	}, [gameState])

	const fmt = (v) => String(v).padStart(5, '0')
	const dinoH = isDucking ? DINO_DUCK_HEIGHT : DINO_HEIGHT

	return (
		<div>
			<div data-testid="high-score">{fmt(highScore)}</div>
			<div data-testid="score">{fmt(score)}</div>

			<div
				data-testid="dino"
				style={{
					position: 'absolute',
					left: 50,
					top: `${dinoY - dinoH}px`,
					width: `${DINO_WIDTH}px`,
					height: `${dinoH}px`,
				}}
			/>

			{obstacles.map((o) => (
				<div
					key={o.id}
					data-testid="obstacle"
					style={{
						position: 'absolute',
						left: `${o.x}px`,
						top: `${o.y - o.height}px`,
						width: `${o.width}px`,
						height: `${o.height}px`,
					}}
				/>
			))}

			<div data-testid="state">{gameState}</div>
		</div>
	)
}
