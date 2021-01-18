import { Redis } from "ioredis";
import { ChannelEntity } from "../entities/Channel";
import { stringify } from 'flatted';
import { RED_CHANNELS } from "./redisKeys";

export const populateChannels = async (redis: Redis) => {
    const channels = await ChannelEntity.find();
    const stringifiedChannels = channels.map(channel => stringify(channel));
    await redis.lpush(RED_CHANNELS, ...stringifiedChannels);

};

export const populateRedis = async (redis: Redis) => {
    await populateChannels(redis);
};
