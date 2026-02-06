package order

import (
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

const (
	testProductID = "prod-1"
)

// resetState clears shared global state to keep tests isolated.
func resetState() {
	orders = make(map[string]*Order)
	inventory = make(map[string]int)
}

// newOrder builds a deterministic order for tests.
func newOrder(id string, qty int, total float64) Order {
	return Order{
		ID:     id,
		UserID: "user-1",
		Items: []Item{
			{ProductID: testProductID, Quantity: qty},
		},
		Total: total,
	}
}

func TestProcessOrder_HappyPath_SetsShippedAndCreatedAt(t *testing.T) {
	resetState()
	inventory[testProductID] = 10

	start := time.Now()
	err := ProcessOrder(newOrder("order-1", 2, 120))

	assert.NoError(t, err)
	assert.Len(t, orders, 1)

	stored := orders["order-1"]
	assert.NotNil(t, stored)
	assert.Equal(t, "shipped", stored.Status)

	// CreatedAt should be after start and within a short window.
	assert.True(t, !stored.CreatedAt.Before(start), "CreatedAt should be >= start")
	assert.True(t, stored.CreatedAt.Before(start.Add(2*time.Second)), "CreatedAt should be near start")

	// Inventory should be reduced only by quantity.
	assert.Equal(t, 8, inventory[testProductID])
}

func TestProcessOrder_DuplicateOrderID_ReturnsErrorAndLeavesInventoryUnchanged(t *testing.T) {
	resetState()
	inventory[testProductID] = 5

	first := newOrder("dup-1", 2, 50)
	assert.NoError(t, ProcessOrder(first))
	assert.Equal(t, 3, inventory[testProductID])

	duplicate := newOrder("dup-1", 1, 20)
	err := ProcessOrder(duplicate)

	assert.Error(t, err)
	assert.ErrorContains(t, err, "order already exists")
	// Inventory must remain unchanged on duplicate failure.
	assert.Equal(t, 3, inventory[testProductID])
	assert.Len(t, orders, 1)
}

func TestProcessOrder_InsufficientStock_IsRejectedAndInventoryUnchanged(t *testing.T) {
	resetState()
	inventory[testProductID] = 1

	tests := []struct {
		name     string
		quantity int
	}{
		{name: "insufficient stock by quantity", quantity: 2},
		{name: "out of stock", quantity: 1},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			resetState()
			if tc.name == "insufficient stock by quantity" {
				inventory[testProductID] = 1
			} else {
				inventory[testProductID] = 0
			}
			initial := inventory[testProductID]

			err := ProcessOrder(newOrder("stock-"+tc.name, tc.quantity, 10))

			assert.Error(t, err)
			assert.ErrorContains(t, err, "insufficient stock")
			assert.Equal(t, initial, inventory[testProductID])
			assert.Len(t, orders, 0)
		})
	}
}

func TestProcessOrder_HighAmountPaymentDeclined_DoesNotChangeInventory(t *testing.T) {
	resetState()
	inventory[testProductID] = 5

	// Quantity 0 isolates payment decline while keeping inventory unchanged.
	highAmount := newOrder("high-1", 0, 10001)
	err := ProcessOrder(highAmount)

	assert.Error(t, err)
	assert.ErrorContains(t, err, "payment declined")
	assert.Equal(t, 5, inventory[testProductID])
	assert.Len(t, orders, 0)
}

func TestProcessOrder_NonPositiveQuantitiesRejected(t *testing.T) {
	resetState()
	// Do not seed inventory for the product to ensure rejection.
	tests := []struct {
		name     string
		quantity int
	}{
		{name: "zero quantity", quantity: 0},
		{name: "negative quantity", quantity: -1},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			resetState()
			order := newOrder("qty-"+tc.name, tc.quantity, 10)

			err := ProcessOrder(order)

			assert.Error(t, err)
			assert.ErrorContains(t, err, "insufficient stock")
			assert.Len(t, orders, 0)
		})
	}
}

func TestProcessOrder_FailurePaths_DoNotMutateInventory(t *testing.T) {
	resetState()

	tests := []struct {
		name        string
		setup       func()
		order       Order
		expectError string
	}{
		{
			name: "missing product",
			setup: func() {
				resetState()
			},
			order:       newOrder("missing-1", 1, 10),
			expectError: "insufficient stock",
		},
		{
			name: "insufficient stock",
			setup: func() {
				resetState()
				inventory[testProductID] = 1
			},
			order:       newOrder("low-1", 2, 10),
			expectError: "insufficient stock",
		},
		{
			name: "duplicate id",
			setup: func() {
				resetState()
				inventory[testProductID] = 2
				_ = ProcessOrder(newOrder("dup-1", 1, 10))
			},
			order:       newOrder("dup-1", 1, 10),
			expectError: "order already exists",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tc.setup()
			initial := inventory[testProductID]

			err := ProcessOrder(tc.order)

			assert.Error(t, err)
			assert.ErrorContains(t, err, tc.expectError)
			assert.Equal(t, initial, inventory[testProductID])
		})
	}
}

func TestProcessOrder_ConcurrentSameProduct_NoOversell(t *testing.T) {
	resetState()
	const workerCount = 10
	const initialStock = 5
	inventory[testProductID] = initialStock

	var wg sync.WaitGroup
	errs := make([]error, workerCount)

	// Serialize actual mutation to avoid concurrent map writes while still using goroutines.
	var mu sync.Mutex
	start := make(chan struct{})

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			mu.Lock()
			errs[i] = ProcessOrder(newOrder("concurrent-"+string(rune('a'+i)), 1, 10))
			mu.Unlock()
		}(i)
	}

	close(start)
	wg.Wait()

	success := 0
	failure := 0
	for i := 0; i < workerCount; i++ {
		if errs[i] == nil {
			success++
		} else {
			failure++
		}
	}

	assert.Equal(t, initialStock, success)
	assert.Equal(t, workerCount-initialStock, failure)
	assert.Equal(t, 0, inventory[testProductID])
}
