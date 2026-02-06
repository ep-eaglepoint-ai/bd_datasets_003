// tests/resources/dino/broken_spawn_unbounded.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react'

/**
 * BROKEN:
 * - Obstacles are spawned repeatedly
 * - Obstacles are NEVER removed when off-screen
 * - Causes unbounded memory growth
 */

const GRAVITY = 0.8
const JUMP_VELOCITY = -15
const GROUND_Y = 150

const DINO_WIDTH = 44
const DINO_HEIGHT = 47
const DINO_DUCK_HEIGHT = 30

const GAME_SPEED = 6

export default function DinoGame() {
	const [gameState, setGameState] = useState('idle')

	const [dinoY, setDinoY] = useState(GROUND_Y)
	const [dinoVelocity, setDinoVelocity] = useState(0)
	const [isJumping, setIsJumping] = useState(false)
	const [isDucking, setIsDucking] = useState(false)

	const [obstacles, setObstacles] = useState([])

	const rafRef = useRef(null)
	const lastTimeRef = useRef(0)
	const spawnIntervalRef = useRef(null)

	const spawnObstacle = useCallback(() => {
		setObstacles((prev) => [
			...prev,
			{
				id: Date.now() + Math.random(),
				type: 'cactus',
				x: 800,
				y: GROUND_Y,
				width: 25,
				height: 50,
			},
		])
	}, [])

	const gameLoop = useCallback(
		(timestamp) => {
			if (gameState !== 'running') return

			const last = lastTimeRef.current || timestamp
			let dt = timestamp - last
			if (dt <= 0) dt = 16.67
			lastTimeRef.current = timestamp
			const frame = dt / 16.67

			setDinoVelocity((v) => Math.min(v + GRAVITY * frame, 20))
			setDinoY((y) => {
				const next = y + dinoVelocity * frame
				if (next >= GROUND_Y) {
					setIsJumping(false)
					setDinoVelocity(0)
					return GROUND_Y
				}
				return next
			})

			// ❌ BROKEN: move obstacles but NEVER filter/remove off-screen
			setObstacles((prev) =>
				prev.map((o) => ({ ...o, x: o.x - GAME_SPEED * frame })),
			)

			rafRef.current = requestAnimationFrame(gameLoop)
		},
		[gameState, dinoVelocity],
	)

	useEffect(() => {
		if (gameState === 'running') {
			lastTimeRef.current = performance.now()
			rafRef.current = requestAnimationFrame(gameLoop)

			// ❌ BROKEN: constant rapid spawning → array grows
			spawnIntervalRef.current = setInterval(spawnObstacle, 200)
		}

		return () => {
			cancelAnimationFrame(rafRef.current)
			clearInterval(spawnIntervalRef.current)
		}
	}, [gameState, gameLoop, spawnObstacle])

	useEffect(() => {
		const onKeyDown = (e) => {
			if (e.code === 'Space' || e.code === 'ArrowUp') {
				e.preventDefault()

				if (gameState === 'idle') {
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

	const dinoH = isDucking ? DINO_DUCK_HEIGHT : DINO_HEIGHT

	return (
		<div>
			<div data-testid="state">{gameState}</div>

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
		</div>
	)
}
