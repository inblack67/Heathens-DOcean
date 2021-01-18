import { Redis } from "ioredis";
import { ChannelEntity } from "../entities/Channel";
import { stringify } from 'flatted';
import { RED_CHANNELS } from "./redisKeys";

export const populateChannels = async (redis: Redis) => {
    console.time('populateChannels')
    const channels = await ChannelEntity.find();
    const stringifiedChannels = channels.map(channel => stringify(channel));
    await redis.lpush(RED_CHANNELS, ...stringifiedChannels);
    console.timeEnd('populateChannels')

};

export const populateRedis = async (redis: Redis) => {
    await populateChannels(redis);
};
