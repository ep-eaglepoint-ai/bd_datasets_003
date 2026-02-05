import React, { useState, useEffect, useRef, useCallback } from 'react'

/*
  BROKEN IMPLEMENTATION:
  - Allows jumping even when already airborne
  - Missing `isJumping` guard
*/

const GRAVITY = 0.8
const JUMP_VELOCITY = -15
const GROUND_Y = 150

export default function DinoGame() {
	const [gameState, setGameState] = useState('idle')
	const [dinoY, setDinoY] = useState(GROUND_Y)
	const [dinoVelocity, setDinoVelocity] = useState(0)

	const animationRef = useRef(null)
	const lastTimeRef = useRef(0)

	const gameLoop = useCallback(
		(timestamp) => {
			if (gameState !== 'running') return

			const delta = timestamp - lastTimeRef.current
			lastTimeRef.current = timestamp
			const frame = delta / 16.67

			setDinoVelocity((v) => v + GRAVITY * frame)
			setDinoY((y) => {
				const next = y + dinoVelocity * frame
				if (next >= GROUND_Y) {
					setDinoVelocity(0)
					return GROUND_Y
				}
				return next
			})

			animationRef.current = requestAnimationFrame(gameLoop)
		},
		[gameState, dinoVelocity],
	)

	useEffect(() => {
		if (gameState === 'running') {
			lastTimeRef.current = performance.now()
			animationRef.current = requestAnimationFrame(gameLoop)
		}
		return () => cancelAnimationFrame(animationRef.current)
	}, [gameState, gameLoop])

	useEffect(() => {
		const onKeyDown = (e) => {
			if (e.code === 'Space' || e.code === 'ArrowUp') {
				if (gameState === 'idle') {
					setGameState('running')
				}
				// ❌ BROKEN: no isJumping check
				if (gameState === 'running') {
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
					top: dinoY - 47,
					left: 50,
					width: 44,
					height: 47,
				}}
			/>
		</div>
	)
}
