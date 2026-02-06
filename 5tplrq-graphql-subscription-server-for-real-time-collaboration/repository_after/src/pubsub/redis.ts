import { Redis } from 'ioredis';
import { RedisPubSub } from 'graphql-redis-subscriptions';

const REDIS_OPTIONS = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
};

export const pubsub = new RedisPubSub({
    publisher: new Redis(REDIS_OPTIONS),
    subscriber: new Redis(REDIS_OPTIONS),
});

export const redis = new Redis(REDIS_OPTIONS);
