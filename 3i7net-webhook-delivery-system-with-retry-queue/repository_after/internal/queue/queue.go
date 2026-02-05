package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"webhook-delivery-system/internal/models"

	"github.com/redis/go-redis/v9"
)

const (
	deliveryQueueKey = "webhook:delivery:queue"
	processingSetKey = "webhook:delivery:processing"
)

type RedisQueue struct {
	client *redis.Client
}

func NewRedisQueue(redisURL string) (*RedisQueue, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redis URL: %w", err)
	}

	client := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to ping redis: %w", err)
	}

	return &RedisQueue{client: client}, nil
}

func (q *RedisQueue) Close() error {
	return q.client.Close()
}

func (q *RedisQueue) Enqueue(ctx context.Context, item models.QueueItem) error {
	data, err := json.Marshal(item)
	if err != nil {
		return fmt.Errorf("failed to marshal queue item: %w", err)
	}

	score := item.Score
	if score == 0 {
		score = float64(time.Now().UnixNano())
	}

	return q.client.ZAdd(ctx, deliveryQueueKey, redis.Z{
		Score:  score,
		Member: string(data),
	}).Err()
}

func (q *RedisQueue) EnqueueWithDelay(ctx context.Context, item models.QueueItem, delay time.Duration) error {
	item.Score = float64(time.Now().Add(delay).UnixNano())
	return q.Enqueue(ctx, item)
}

func (q *RedisQueue) Dequeue(ctx context.Context) (*models.QueueItem, error) {
	now := float64(time.Now().UnixNano())

	results, err := q.client.ZRangeByScoreWithScores(ctx, deliveryQueueKey, &redis.ZRangeBy{
		Min:    "-inf",
		Max:    fmt.Sprintf("%f", now),
		Offset: 0,
		Count:  1,
	}).Result()

	if err != nil {
		return nil, fmt.Errorf("failed to get items from queue: %w", err)
	}

	if len(results) == 0 {
		return nil, nil
	}

	member := results[0].Member

	removed, err := q.client.ZRem(ctx, deliveryQueueKey, member).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to remove item from queue: %w", err)
	}

	if removed == 0 {
		return nil, nil
	}

	var item models.QueueItem
	if err := json.Unmarshal([]byte(member), &item); err != nil {
		return nil, fmt.Errorf("failed to unmarshal queue item: %w", err)
	}

	if err := q.client.SAdd(ctx, processingSetKey, item.DeliveryID).Err(); err != nil {
		return nil, fmt.Errorf("failed to add to processing set: %w", err)
	}

	return &item, nil
}

func (q *RedisQueue) Complete(ctx context.Context, deliveryID string) error {
	return q.client.SRem(ctx, processingSetKey, deliveryID).Err()
}

func (q *RedisQueue) Size(ctx context.Context) (int64, error) {
	return q.client.ZCard(ctx, deliveryQueueKey).Result()
}

func (q *RedisQueue) ProcessingCount(ctx context.Context) (int64, error) {
	return q.client.SCard(ctx, processingSetKey).Result()
}

func (q *RedisQueue) GetPendingItems(ctx context.Context) ([]models.QueueItem, error) {
	results, err := q.client.ZRangeWithScores(ctx, deliveryQueueKey, 0, -1).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get pending items: %w", err)
	}

	var items []models.QueueItem
	for _, result := range results {
		var item models.QueueItem
		if err := json.Unmarshal([]byte(result.Member), &item); err != nil {
			continue
		}
		item.Score = result.Score
		items = append(items, item)
	}

	return items, nil
}

func (q *RedisQueue) RemoveFromProcessing(ctx context.Context, deliveryID string) error {
	return q.client.SRem(ctx, processingSetKey, deliveryID).Err()
}

func (q *RedisQueue) IsProcessing(ctx context.Context, deliveryID string) (bool, error) {
	return q.client.SIsMember(ctx, processingSetKey, deliveryID).Result()
}

func (q *RedisQueue) ClearProcessing(ctx context.Context) error {
	return q.client.Del(ctx, processingSetKey).Err()
}

func (q *RedisQueue) Reschedule(ctx context.Context, item models.QueueItem, delay time.Duration) error {
	if err := q.Complete(ctx, item.DeliveryID); err != nil {
		return err
	}
	return q.EnqueueWithDelay(ctx, item, delay)
}

func (q *RedisQueue) Remove(ctx context.Context, deliveryID string) error {
	items, err := q.client.ZRange(ctx, deliveryQueueKey, 0, -1).Result()
	if err != nil {
		return err
	}

	for _, item := range items {
		var queueItem models.QueueItem
		if err := json.Unmarshal([]byte(item), &queueItem); err != nil {
			continue
		}
		if queueItem.DeliveryID == deliveryID {
			return q.client.ZRem(ctx, deliveryQueueKey, item).Err()
		}
	}
	return nil
}
