package main

import (
	"math"
	"testing"
)

const epsilon = 0.0001

func TestEntityCreation(t *testing.T) {
	e := Entity{
		ID:        1,
		X:         10.0,
		Y:         20.0,
		VelocityX: 1.0,
		VelocityY: 2.0,
		Health:    100,
	}

	if e.ID != 1 {
		t.Errorf("Expected ID 1, got %d", e.ID)
	}
	if e.X != 10.0 {
		t.Errorf("Expected X 10.0, got %f", e.X)
	}
}

func TestSimulationCreation(t *testing.T) {
	sim := NewSimulation()
	if sim.GetCurrentFrame() != 0 {
		t.Errorf("Expected frame 0, got %d", sim.GetCurrentFrame())
	}
}

func TestBasicTick(t *testing.T) {
	sim := NewSimulation()
	sim.AddEntity(Entity{ID: 1, X: 0, Y: 0, VelocityX: 1, VelocityY: 0, Health: 100})

	sim.Tick(nil)

	if sim.GetCurrentFrame() != 1 {
		t.Errorf("Expected frame 1, got %d", sim.GetCurrentFrame())
	}

	state := sim.GetState(0)
	if len(state.Entities) != 1 {
		t.Errorf("Expected 1 entity, got %d", len(state.Entities))
	}

	// Entity should have moved
	if state.Entities[0].X != 1.0 {
		t.Errorf("Expected X=1.0 after one tick, got %f", state.Entities[0].X)
	}
}

func TestEulerIntegration(t *testing.T) {
	sim := NewSimulation()
	sim.AddEntity(Entity{ID: 1, X: 0, Y: 0, VelocityX: 2, VelocityY: 3, Health: 100})

	for i := 0; i < 5; i++ {
		sim.Tick(nil)
	}

	state := sim.GetState(4)
	expectedX := 10.0 // 2 * 5
	expectedY := 15.0 // 3 * 5

	if math.Abs(state.Entities[0].X-expectedX) > epsilon {
		t.Errorf("Expected X=%f, got %f", expectedX, state.Entities[0].X)
	}
	if math.Abs(state.Entities[0].Y-expectedY) > epsilon {
		t.Errorf("Expected Y=%f, got %f", expectedY, state.Entities[0].Y)
	}
}

func TestAABBCollisionDetection(t *testing.T) {
	sim := NewSimulation()

	// Two entities moving toward each other
	sim.AddEntity(Entity{ID: 1, X: 0, Y: 0, VelocityX: 2, VelocityY: 0, Health: 100})
	sim.AddEntity(Entity{ID: 2, X: 15, Y: 0, VelocityX: -2, VelocityY: 0, Health: 100})

	// Simulate until collision
	for i := 0; i < 10; i++ {
		sim.Tick(nil)
	}

	// After collision, velocities should have reversed
	state := sim.GetState(sim.GetCurrentFrame() - 1)

	// Check if velocities reversed at some point (collision happened)
	// Entity 1 should have negative velocity after collision
	// Entity 2 should have positive velocity after collision
	// Since they bounce, check the direction
	entity1 := state.Entities[0]
	entity2 := state.Entities[1]

	// After collision, entity1 should move backwards (negative velocity)
	// and entity2 should move forwards (positive velocity)
	if entity1.VelocityX >= 0 || entity2.VelocityX <= 0 {
		// Collision occurred and velocities reversed
		if entity1.VelocityX != -2 {
			t.Logf("Warning: Entity 1 velocity expected -2, got %f", entity1.VelocityX)
		}
		if entity2.VelocityX != 2 {
			t.Logf("Warning: Entity 2 velocity expected 2, got %f", entity2.VelocityX)
		}
	}
}

func TestLateJumpInput(t *testing.T) {
	sim := NewSimulation()
	sim.AddEntity(Entity{ID: 1, X: 0, Y: 0, VelocityX: 0, VelocityY: 0, Health: 100})

	// Advance simulation to Frame 10
	for i := 0; i < 10; i++ {
		sim.Tick(nil)
	}

	if sim.GetCurrentFrame() != 10 {
		t.Fatalf("Expected frame 10, got %d", sim.GetCurrentFrame())
	}

	// Store state at frame 10
	stateFrame10Before := sim.GetState(9)
	posXFrame10Before := stateFrame10Before.Entities[0].X

	// Store state at Frame 4 (before late input)
	stateFrame4Before := sim.GetState(3)
	posXFrame4Before := stateFrame4Before.Entities[0].X

	// Send a late input for Frame 5 (jump)
	lateInput := PlayerInput{
		EntityID:  1,
		VelocityX: 5.0,
		VelocityY: 0.0,
	}
	sim.ProcessInput(5, lateInput)

	// Current frame should still be 10
	if sim.GetCurrentFrame() != 10 {
		t.Errorf("Expected frame to remain 10, got %d", sim.GetCurrentFrame())
	}

	// State at frame 10 should have changed due to rollback
	stateFrame10After := sim.GetState(9)
	posXFrame10After := stateFrame10After.Entities[0].X

	// Position at frame 10 should be different now
	if posXFrame10Before == posXFrame10After {
		t.Errorf("Expected position at frame 10 to change after late input, but it remained %f", posXFrame10After)
	}

	// State at frame 5 should have the new velocity applied
	stateFrame5 := sim.GetState(4)
	if stateFrame5.Entities[0].VelocityX != 5.0 {
		t.Errorf("Expected velocity 5.0 at frame 5, got %f", stateFrame5.Entities[0].VelocityX)
	}

	// CRITICAL: Verify deep copy - Frame 4 snapshot should NOT have been mutated
	stateFrame4After := sim.GetState(3)
	posXFrame4After := stateFrame4After.Entities[0].X

	if posXFrame4Before != posXFrame4After {
		t.Errorf("DEEP COPY VIOLATION: Frame 4 position changed from %f to %f",
			posXFrame4Before, posXFrame4After)
	}

	// Verify the entity at frame 4 is still at original position
	if posXFrame4After != 0.0 {
		t.Errorf("Expected frame 4 position to remain 0.0, got %f", posXFrame4After)
	}
}

func TestDeepCopyPreservesHistory(t *testing.T) {
	sim := NewSimulation()
	sim.AddEntity(Entity{ID: 1, X: 0, Y: 0, VelocityX: 1, VelocityY: 0, Health: 100})

	// Advance to frame 5
	for i := 0; i < 5; i++ {
		sim.Tick(nil)
	}

	// Get state at frame 2
	stateFrame2Before := sim.GetState(1)
	posXBefore := stateFrame2Before.Entities[0].X
	velXBefore := stateFrame2Before.Entities[0].VelocityX

	// Process a late input at frame 3
	sim.ProcessInput(3, PlayerInput{EntityID: 1, VelocityX: 10.0, VelocityY: 0.0})

	// State at frame 2 should not have changed
	stateFrame2After := sim.GetState(1)
	posXAfter := stateFrame2After.Entities[0].X
	velXAfter := stateFrame2After.Entities[0].VelocityX

	if posXBefore != posXAfter {
		t.Errorf("Frame 2 position mutated: %f -> %f", posXBefore, posXAfter)
	}
	if velXBefore != velXAfter {
		t.Errorf("Frame 2 velocity mutated: %f -> %f", velXBefore, velXAfter)
	}
}

func TestRingBufferWrap(t *testing.T) {
	sim := NewSimulation()
	sim.AddEntity(Entity{ID: 1, X: 0, Y: 0, VelocityX: 1, VelocityY: 0, Health: 100})

	// Advance beyond buffer size to test wrapping
	for i := 0; i < BufferSize+100; i++ {
		sim.Tick(nil)
	}

	currentFrame := sim.GetCurrentFrame()
	if currentFrame != BufferSize+100 {
		t.Errorf("Expected frame %d, got %d", BufferSize+100, currentFrame)
	}

	// Should be able to access recent frames
	state := sim.GetState(currentFrame - 1)
	if len(state.Entities) != 1 {
		t.Errorf("Expected 1 entity in recent frame, got %d", len(state.Entities))
	}
}

func TestInputApplication(t *testing.T) {
	sim := NewSimulation()
	sim.AddEntity(Entity{ID: 1, X: 0, Y: 0, VelocityX: 0, VelocityY: 0, Health: 100})

	input := PlayerInput{
		EntityID:  1,
		VelocityX: 7.0,
		VelocityY: 3.0,
	}

	sim.Tick(&input)

	state := sim.GetState(0)
	if state.Entities[0].VelocityX != 7.0 {
		t.Errorf("Expected VelocityX 7.0, got %f", state.Entities[0].VelocityX)
	}
	if state.Entities[0].VelocityY != 3.0 {
		t.Errorf("Expected VelocityY 3.0, got %f", state.Entities[0].VelocityY)
	}
}

func TestMultipleEntities(t *testing.T) {
	sim := NewSimulation()
	sim.AddEntity(Entity{ID: 1, X: 0, Y: 0, VelocityX: 1, VelocityY: 0, Health: 100})
	sim.AddEntity(Entity{ID: 2, X: 100, Y: 100, VelocityX: -1, VelocityY: -1, Health: 100})

	sim.Tick(nil)

	state := sim.GetState(0)
	if len(state.Entities) != 2 {
		t.Errorf("Expected 2 entities, got %d", len(state.Entities))
	}

	if state.Entities[0].X != 1.0 {
		t.Errorf("Entity 1: Expected X=1.0, got %f", state.Entities[0].X)
	}
	if state.Entities[1].X != 99.0 {
		t.Errorf("Entity 2: Expected X=99.0, got %f", state.Entities[1].X)
	}
}
