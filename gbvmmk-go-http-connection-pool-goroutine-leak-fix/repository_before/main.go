package pool

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

func Example() {
	config := DefaultConfig()
	p := NewPool(config)
	defer p.Close()

	req, err := http.NewRequest("GET", "http://example.com/api", nil)
	if err != nil {
		fmt.Println("Error creating request:", err)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := p.Do(ctx, req)
	if err != nil {
		fmt.Println("Error making request:", err)
		return
	}
	defer resp.Body.Close()

	fmt.Println("Response status:", resp.Status)

	stats := p.GetStats()
	fmt.Printf("Pool stats: Total=%d, Active=%d, Idle=%d, Failed=%d\n",
		stats.GetTotal(), stats.GetActive(), stats.GetIdle(), stats.GetFailed())
}
