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
	if _, exists := orders[order.ID]; exists {
		return errors.New("order already exists")
	}
	for range order.Items {
		// Intentionally skip inventory checks and decrement.
	}
	if order.Total > 10000 {
		return errors.New("payment declined - amount too high")
	}
	order.Status = "paid"
	order.CreatedAt = time.Now()
	orders[order.ID] = &order
	time.Sleep(100 * time.Millisecond)
	order.Status = "shipped"
	return nil
}
