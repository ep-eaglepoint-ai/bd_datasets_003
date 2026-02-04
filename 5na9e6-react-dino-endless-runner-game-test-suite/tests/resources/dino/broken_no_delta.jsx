import React, { useState, useEffect, useRef, useCallback } from 'react'

/*
  BROKEN IMPLEMENTATION:
  - Physics does NOT use deltaTime
  - Movement depends on frame rate
*/

const GRAVITY = 0.8 
const JUMP_VELOCITY = -15
const GROUND_Y = 150
const GAME_SPEED = 6

export default function DinoGame() {
	const [gameState, setGameState] = useState('idle')
	const [dinoY, setDinoY] = useState(GROUND_Y)
	const [dinoVelocity, setDinoVelocity] = useState(0)
	const [obstacles, setObstacles] = useState([])

	const animationRef = useRef(null)

	const spawnObstacle = () => {
		setObstacles([
			{
				id: 1,
				x: 200,
				y: GROUND_Y,
				width: 25,
				height: 50,
			},
		])
	}

	const gameLoop = useCallback(() => {
		if (gameState !== 'running') return

		setDinoVelocity((v) => v + GRAVITY)
		setDinoY((y) => {
			const next = y + dinoVelocity
			if (next >= GROUND_Y) {
				setDinoVelocity(0)
				return GROUND_Y
			}
			return next
		})

		setObstacles((prev) => prev.map((o) => ({ ...o, x: o.x - GAME_SPEED })))

		animationRef.current = requestAnimationFrame(gameLoop)
	}, [gameState, dinoVelocity])

	useEffect(() => {
		if (gameState === 'running') {
			spawnObstacle()
			animationRef.current = requestAnimationFrame(gameLoop)
		}
		return () => cancelAnimationFrame(animationRef.current)
	}, [gameState, gameLoop])

	useEffect(() => {
		const onKeyDown = (e) => {
			if (e.code === 'Space') {
				if (gameState === 'idle') {
					setGameState('running')
				} else if (gameState === 'running') {
					setDinoVelocity(JUMP_VELOCITY)
				}
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [gameState])

	return (
		<div>
			<div data-testid="state">{gameState}</div>

			<div
				data-testid="dino"
				style={{
					position: 'absolute',
					left: 50,
					top: dinoY - 47,
					width: 44,
					height: 47,
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
