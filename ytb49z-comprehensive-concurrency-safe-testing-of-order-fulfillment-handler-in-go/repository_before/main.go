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
var inventory = make(map[string]int) // productID -> available stock

func ProcessOrder(order Order) error {
	if _, exists := orders[order.ID]; exists {
		return errors.New("order already exists")
	}

	for _, item := range order.Items {
		stock, ok := inventory[item.ProductID]
		if !ok || stock < item.Quantity {
			return errors.New("insufficient stock")
		}
	}

	// Reserve stock
	for _, item := range order.Items {
		inventory[item.ProductID] -= item.Quantity
	}

	// Simulate payment (in real code this would call payment gateway)
	if order.Total > 10000 {
		return errors.New("payment declined - amount too high")
	}

	order.Status = "paid"
	order.CreatedAt = time.Now()
	orders[order.ID] = &order

	// Ship (simulate)
	time.Sleep(100 * time.Millisecond)
	order.Status = "shipped"

	return nil
}