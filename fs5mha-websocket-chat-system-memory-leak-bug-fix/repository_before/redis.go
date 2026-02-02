package main

import (
	"context"
	"encoding/json"
	"log"

	"github.com/redis/go-redis/v9"
)

var redisClient *redis.Client
var ctx = context.Background()

func init() {
	redisClient = redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})
}

func publishToRedis(msg *Message) {
	data, _ := json.Marshal(msg)
	redisClient.Publish(ctx, "chat:"+msg.Room, data)
}

func subscribeToRoom(hub *Hub, room string) {
	pubsub := redisClient.Subscribe(ctx, "chat:"+room)

	go func() {
		ch := pubsub.Channel()
		for msg := range ch {
			var message Message
			json.Unmarshal([]byte(msg.Payload), &message)
			hub.broadcast <- &message
		}
	}()
}

func subscribeClient(client *Client) {
	pubsub := redisClient.Subscribe(ctx, "chat:"+client.room)

	go func() {
		for {
			msg, err := pubsub.ReceiveMessage(ctx)
			if err != nil {
				log.Println("redis receive error:", err)
				return
			}
			var message Message
			json.Unmarshal([]byte(msg.Payload), &message)
			client.send <- &message
		}
	}()
}
