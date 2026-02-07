package main

import (
	"fmt"
)

const (
	TicksPerSecond = 60
	BufferSeconds  = 60
	BufferSize     = TicksPerSecond * BufferSeconds // 3600 frames
	EntitySize     = 10.0                           // AABB box size
)

type Entity struct {
	ID        int
	X         float64
	Y         float64
	VelocityX float64
	VelocityY float64
	Health    int
}

type GameState struct {
	Frame    int
	Entities []Entity
}

type PlayerInput struct {
	EntityID  int
	VelocityX float64
	VelocityY float64
}

type Simulation struct {
	currentFrame int
	buffer       [BufferSize]GameState
}

func NewSimulation() *Simulation {
	return &Simulation{
		currentFrame: 0,
	}
}

func (s *Simulation) GetCurrentFrame() int {
	return s.currentFrame
}

func (s *Simulation) GetState(frame int) GameState {
	if frame < 0 {
		return GameState{}
	}
	return s.buffer[frame%BufferSize]
}

func (s *Simulation) deepCopy(state GameState) GameState {
	copied := GameState{
		Frame:    state.Frame,
		Entities: make([]Entity, len(state.Entities)),
	}
	copy(copied.Entities, state.Entities)
	return copied
}

func (s *Simulation) saveState(state GameState) {
	s.buffer[state.Frame%BufferSize] = s.deepCopy(state)
}

func (s *Simulation) applyInput(state *GameState, input PlayerInput) {
	for i := range state.Entities {
		if state.Entities[i].ID == input.EntityID {
			state.Entities[i].VelocityX = input.VelocityX
			state.Entities[i].VelocityY = input.VelocityY
			break
		}
	}
}

func (s *Simulation) stepPhysics(state *GameState) {
	// Euler integration
	for i := range state.Entities {
		state.Entities[i].X += state.Entities[i].VelocityX
		state.Entities[i].Y += state.Entities[i].VelocityY
	}

	// AABB collision detection and response
	for i := 0; i < len(state.Entities); i++ {
		for j := i + 1; j < len(state.Entities); j++ {
			if s.checkAABBCollision(state.Entities[i], state.Entities[j]) {
				// Elastic collision - reverse velocities
				state.Entities[i].VelocityX = -state.Entities[i].VelocityX
				state.Entities[i].VelocityY = -state.Entities[i].VelocityY
				state.Entities[j].VelocityX = -state.Entities[j].VelocityX
				state.Entities[j].VelocityY = -state.Entities[j].VelocityY
			}
		}
	}
}

func (s *Simulation) checkAABBCollision(e1, e2 Entity) bool {
	return e1.X < e2.X+EntitySize &&
		e1.X+EntitySize > e2.X &&
		e1.Y < e2.Y+EntitySize &&
		e1.Y+EntitySize > e2.Y
}

func (s *Simulation) Tick(input *PlayerInput) {
	var state GameState
	if s.currentFrame == 0 {
		// Copy existing entities from buffer[0] if any were added via AddEntity
		state = s.deepCopy(s.buffer[0])
		state.Frame = 0
	} else {
		state = s.deepCopy(s.buffer[(s.currentFrame-1)%BufferSize])
		state.Frame = s.currentFrame
	}

	if input != nil {
		s.applyInput(&state, *input)
	}

	s.stepPhysics(&state)
	s.saveState(state)
	s.currentFrame++
}

func (s *Simulation) ProcessInput(frame int, input PlayerInput) {
	if frame >= s.currentFrame {
		// Future or current frame - just apply normally
		for frame >= s.currentFrame {
			if frame == s.currentFrame {
				s.Tick(&input)
			} else {
				s.Tick(nil)
			}
		}
		return
	}

	// Rollback scenario: frame < currentFrame
	// Restore state from frame-1, apply input, then re-simulate up to currentFrame
	targetFrame := s.currentFrame

	if frame == 0 {
		// Special case: input at frame 0 modifies initial state
		restoredState := s.deepCopy(s.buffer[0])
		s.applyInput(&restoredState, input)
		s.stepPhysics(&restoredState)
		s.saveState(restoredState)

		// Re-simulate from frame 1 onward
		for f := 1; f < targetFrame; f++ {
			prevState := s.deepCopy(s.buffer[(f-1)%BufferSize])
			prevState.Frame = f
			s.stepPhysics(&prevState)
			s.saveState(prevState)
		}
	} else {
		// Load frame-1 state, apply input (set velocity), save back to frame-1 slot
		restoredState := s.deepCopy(s.buffer[(frame-1)%BufferSize])
		s.applyInput(&restoredState, input)
		s.saveState(restoredState)

		// Re-simulate from frame to targetFrame with physics
		for f := frame; f < targetFrame; f++ {
			prevState := s.deepCopy(s.buffer[(f-1)%BufferSize])
			prevState.Frame = f
			s.stepPhysics(&prevState)
			s.saveState(prevState)
		}
	}
}

func (s *Simulation) AddEntity(e Entity) {
	if s.currentFrame == 0 {
		s.buffer[0].Entities = append(s.buffer[0].Entities, e)
	} else {
		idx := (s.currentFrame - 1) % BufferSize
		s.buffer[idx].Entities = append(s.buffer[idx].Entities, e)
	}
}

func main() {
	sim := NewSimulation()

	// Example usage
	sim.AddEntity(Entity{ID: 1, X: 0, Y: 0, VelocityX: 1, VelocityY: 0, Health: 100})
	sim.AddEntity(Entity{ID: 2, X: 50, Y: 0, VelocityX: -1, VelocityY: 0, Health: 100})

	for i := 0; i < 20; i++ {
		sim.Tick(nil)
	}

	fmt.Printf("Simulation completed %d frames\n", sim.GetCurrentFrame())
}
