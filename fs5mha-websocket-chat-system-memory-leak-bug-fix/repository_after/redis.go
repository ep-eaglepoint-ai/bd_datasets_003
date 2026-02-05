package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

var redisClient *redis.Client
var ctx = context.Background()

func init() {
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}

	// Tune the Redis client for high concurrency and to avoid exhausting the pool
	// under peak load. These defaults are conservative and can be overridden
	// via environment if needed.
	redisClient = redis.NewClient(&redis.Options{
		Addr:         addr,
		PoolSize:     100, // reasonable default for many cores
		MinIdleConns: 10,  // keep a few connections warm
		ReadTimeout:  500 * time.Millisecond,
		WriteTimeout: 500 * time.Millisecond,
		DialTimeout:  500 * time.Millisecond,
	})
}

func publishToRedis(msg *Message) error {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Println("Redis message marshal error:", err)
		return err
	}
	if err := redisClient.Publish(ctx, "chat:"+msg.Room, data).Err(); err != nil {
		log.Println("Redis publish error:", err)
		return err
	}
	return nil
}

func subscribeToRoom(hub *Hub, room string, stop chan struct{}) {
	pubsub := redisClient.Subscribe(ctx, "chat:"+room)
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var message Message
			if err := json.Unmarshal([]byte(msg.Payload), &message); err != nil {
				log.Println("Redis message unmarshal error:", err)
				continue
			}

			// Pass message to hub for broadcasting to local clients without
			// blocking this subscription goroutine indefinitely.
			select {
			case hub.broadcast <- &message:
			default:
				log.Println("Hub broadcast channel full, dropping Redis message for room:", room)
			}

		case <-stop:
			// Cleanup based on room lifecycle
			return
		}
	}
}
