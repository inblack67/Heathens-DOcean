import { Redis } from "ioredis";
import { ChannelEntity } from "../entities/Channel";
import { stringify } from 'flatted';

export const populateChannels = async (redis: Redis) => {
    const channels = await ChannelEntity.find();
    channels.forEach(async channel => {
        await redis.lpush('channels', stringify(channel));
    });
};

export const populateRedis = async (redis: Redis) => {
    await populateChannels(redis);
};
