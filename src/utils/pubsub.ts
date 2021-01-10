import { RedisPubSub } from 'graphql-redis-subscriptions';

export const createPubSub = () => new RedisPubSub( {
    connection: {
        host: process.env.REDIS_HOST,
        port: 6379
    }
} );