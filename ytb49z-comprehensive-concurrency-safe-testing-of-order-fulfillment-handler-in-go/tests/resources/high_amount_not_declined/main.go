package order

import "time"

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
	for _, item := range order.Items {
		if inventory[item.ProductID] < item.Quantity {
			return nil
		}
	}
	for _, item := range order.Items {
		inventory[item.ProductID] -= item.Quantity
	}
	// High amounts never declined.
	order.Status = "paid"
	order.CreatedAt = time.Now()
	orders[order.ID] = &order
	time.Sleep(100 * time.Millisecond)
	order.Status = "shipped"
	return nil
}
