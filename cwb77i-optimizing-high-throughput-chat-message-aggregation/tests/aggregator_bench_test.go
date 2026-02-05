package aggregator

import (
	"fmt"
	"testing"
	"time"
)

func BenchmarkAggregator_AddMessage(b *testing.B) {
	agg := NewAggregator()
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		i := 0
		for pb.Next() {
			// Use many unique rooms to simulate high shard utilization
			roomID := fmt.Sprintf("room-%d", i%10000)
			agg.AddMessage(&Message{
				RoomID:    roomID,
				UserID:    "user",
				Content:   "test",
				Timestamp: time.Now(),
			})
			i++
		}
	})
}
