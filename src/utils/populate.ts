import { Redis } from "ioredis";
import { ChannelEntity } from "../entities/Channel";
import { stringify } from 'flatted';
import { RED_CHANNELS } from "./redisKeys";
import { getConnection } from "typeorm";

export const populateChannels = async (redis: Redis) => {

    const channels: ChannelEntity[] = await getConnection().query(`
        SELECT * from channel_entity
        ORDER BY "createdAt" DESC
    `);

    if (channels.length > 0) {
        const stringifiedChannels = channels.map(channel => stringify(channel));
        await redis.lpush(RED_CHANNELS, ...stringifiedChannels);
    }

};

export const populateRedis = async (redis: Redis) => {
    await populateChannels(redis);
};
