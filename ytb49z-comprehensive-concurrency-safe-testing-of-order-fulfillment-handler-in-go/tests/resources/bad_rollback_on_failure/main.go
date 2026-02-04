package order

import (
	"errors"
	"time"
)

type Order struct {
	ID        string
	UserID    string
	Items     []Item
	Total     float64
	Status    string
	CreatedAt time.Time
}

type Item struct {
	ProductID string
	Quantity  int
}

var orders = make(map[string]*Order)
var inventory = make(map[string]int)

func ProcessOrder(order Order) error {
	// Decrement first, then fail.
	for _, item := range order.Items {
		inventory[item.ProductID] -= item.Quantity
	}
	return errors.New("insufficient stock")
}
