import React, { useState, useEffect, useRef, useCallback } from 'react'

/*
  BROKEN IMPLEMENTATION:
  - High score is NOT loaded from localStorage
  - High score is NOT saved to localStorage
*/

const GRAVITY = 0.8
const JUMP_VELOCITY = -15
const GROUND_Y = 150
const GAME_SPEED = 6

export default function DinoGame() {
	const [gameState, setGameState] = useState('idle')
	const [score, setScore] = useState(0)
	const [highScore, setHighScore] = useState(0)

	const [dinoY, setDinoY] = useState(GROUND_Y)
	const [dinoVelocity, setDinoVelocity] = useState(0)
	const [obstacles, setObstacles] = useState([])

	const animationRef = useRef(null)
	const lastTimeRef = useRef(0)

	const saveHighScore = (value) => {
		if (value > highScore) {
			setHighScore(value)
		}
	}

	const spawnObstacle = () => {
		setObstacles([
			{
				id: Date.now(),
				x: 60,
				y: GROUND_Y,
				width: 25,
				height: 50,
			},
		])
	}

	const gameLoop = useCallback(
		(timestamp) => {
			if (gameState !== 'running') return

			const delta = timestamp - lastTimeRef.current
			lastTimeRef.current = timestamp
			const frame = delta / 16.67

			setDinoVelocity((v) => v + GRAVITY * frame)
			setDinoY((y) => Math.min(y + dinoVelocity * frame, GROUND_Y))

			setObstacles((prev) =>
				prev.map((o) => ({ ...o, x: o.x - GAME_SPEED * frame })),
			)

			if (obstacles.length > 0) {
				setGameState('gameOver')
				saveHighScore(score)
			}

			animationRef.current = requestAnimationFrame(gameLoop)
		},
		[gameState, dinoVelocity, obstacles, score],
	)

	useEffect(() => {
		if (gameState === 'running') {
			lastTimeRef.current = performance.now()
			spawnObstacle()
			animationRef.current = requestAnimationFrame(gameLoop)

			const scoreTimer = setInterval(() => {
				setScore((s) => s + 1)
			}, 100)

			return () => clearInterval(scoreTimer)
		}
	}, [gameState, gameLoop])

	useEffect(() => {
		const onKeyDown = (e) => {
			if (e.code === 'Space') {
				if (gameState === 'idle' || gameState === 'gameOver') {
					setGameState('running')
					setScore(0)
					setDinoY(GROUND_Y)
					setDinoVelocity(0)
					setObstacles([])
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
			<div data-testid="score">{score}</div>
			<div data-testid="high-score">{highScore}</div>

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
