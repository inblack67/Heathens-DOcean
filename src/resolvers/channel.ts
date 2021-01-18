import { ErrorResponse } from "../utils/ErrorResponse";
import { Arg, Ctx, FieldResolver, Mutation, Query, Resolver, Root, UseMiddleware, Subscription } from "type-graphql";
import { ChannelEntity } from '../entities/Channel';
import { isAdmin, isAuthenticated } from "../middlewares/protect";
import { MyContext } from "../utils/types";
import { UserEntity } from "../entities/User";
import { MessageEntity } from "../entities/Message";
import { getConnection } from "typeorm";
import { JOIN_CHANNEL, LEAVE_CHANNEL, NEW_MESSAGE, NEW_NOTIFICATION, REMOVED_MESSAGE } from "../utils/topics";
import { customSort } from "../utils/utilities";
import { RED_CHANNELS, RED_SINGLE_CHANNEL } from "../utils/redisKeys";
import { parse, stringify } from "flatted";

@Resolver(ChannelEntity)
export class ChannelResolver {

    @FieldResolver(() => [ UserEntity ], { nullable: true, })
    users (
        @Root()
        channel: ChannelEntity,
        @Ctx()
        { usersLoader }: MyContext,
    ): Promise<(UserEntity | Error)[]> | [] {
        if (!channel.userIds) {
            return [];
        }
        return usersLoader.loadMany(channel.userIds);
    }

    @FieldResolver(() => [ MessageEntity ], { nullable: true, })
    messages (
        @Root()
        channel: ChannelEntity,
        @Ctx()
        { messagesLoader }: MyContext,
    ): Promise<(MessageEntity | Error)[]> | [] {
        if (!channel.messageIds) {
            return [];
        }
        return messagesLoader.loadMany(channel.messageIds);
    }

    @UseMiddleware(isAuthenticated)
    @Query(() => [ ChannelEntity ], {})
    async getChannels (
        @Ctx()
        { redis }: MyContext
    ): Promise<ChannelEntity[]> {
        console.time('getChannels');
        const redChannels = await redis.lrange(RED_CHANNELS, 0, -1);
        const channels = redChannels.map(channel => parse(channel));
        const sortedChannels = customSort<ChannelEntity[]>(channels) as ChannelEntity[];
        console.timeEnd('getChannels');
        return sortedChannels;
    }

    @UseMiddleware(isAuthenticated)
    @Query(() => ChannelEntity, { nullable: true, })
    async getSingleChannel (
        @Arg('id')
        id: number,
        @Ctx()
        { redis }: MyContext
    ): Promise<ChannelEntity | undefined> {
        console.time('getSingleChannel');
        const redChannel = await redis.get(`${ RED_SINGLE_CHANNEL }:${ id }`);

        const channel = redChannel ? parse(redChannel) : await ChannelEntity.findOne(id);

        if (!channel) {
            throw new ErrorResponse('Resource does not exits', 404);
        }

        if (!redChannel) {
            await redis.set(`${ RED_SINGLE_CHANNEL }:${ id }`, stringify(channel));
        }

        console.timeEnd('getSingleChannel');

        return channel;
    }

    @UseMiddleware(isAuthenticated)
    @Query(() => [ UserEntity ], { nullable: true, })
    async getChannelUsers (
        @Arg('channelId')
        channelId: number,
        @Ctx()
        { usersLoader, redis, session }: MyContext
    ): Promise<(UserEntity | Error)[]> {
        console.time('getChannelUsers');
        const redChannel = await redis.get(`${ RED_SINGLE_CHANNEL }:${ channelId }`);

        const channel = redChannel ? parse(redChannel) : await ChannelEntity.findOne(channelId);

        if (!channel.userIds.includes(session.user!.id)) {
            throw new ErrorResponse('You have to join the channel first', 401);
        }

        if (!channel) {
            throw new ErrorResponse('Resource does not exits', 404);
        }

        if (!redChannel) {
            await redis.set(`${ RED_SINGLE_CHANNEL }:${ channelId }`, stringify(channel));
        }

        console.timeEnd('getChannelUsers');

        return usersLoader.loadMany(channel.userIds);
    }

    @Subscription(
        () => MessageEntity,
        {
            topics: NEW_MESSAGE,
            filter: ({ payload, args }) => args.channelId === payload.channelId,

        },
    )
    newMessage (
        @Root()
        payload: MessageEntity,
        @Arg('channelId')
        _: number
    ): MessageEntity {

        return payload;
    }

    @Subscription(
        () => MessageEntity,
        {
            topics: REMOVED_MESSAGE,
            filter: ({ payload, args }) => args.channelId === payload.channelId,

        },
    )
    removedMessage (
        @Root()
        payload: MessageEntity,
        @Arg('channelId')
        _: number
    ): MessageEntity {

        return payload;
    }

    @Subscription(
        () => String,
        {

            topics: NEW_NOTIFICATION,
            filter: ({ payload, args }) => args.channelId === payload.channelId,

        }
    )
    newNotification (
        @Root()
        payload: any,
        @Arg('channelId')
        _: number,
    ): MessageEntity {
        return payload.message;
    }

    @Subscription(
        () => UserEntity,
        {
            topics: JOIN_CHANNEL,
            filter: ({ payload, args }) => args.channelId === payload.channelId,

        }
    )
    joinedChannel (
        @Root()
        payload: any,
        @Arg('channelId')
        _: number
    ): UserEntity {
        return payload.user;
    }

    @Subscription(
        () => UserEntity,
        {
            topics: LEAVE_CHANNEL,
            filter: ({ payload, args }) => args.channelId === payload.channelId,

        }
    )
    leftChannel (
        @Root()
        payload: any,
        @Arg('channelId')
        _: number
    ): UserEntity {
        return payload.user;
    }

    @UseMiddleware(isAuthenticated, isAdmin)
    @Mutation(() => ChannelEntity, {})
    async addChannel (
        @Arg('name')
        name: string,
        @Arg('desc')
        desc: string,
    ): Promise<ChannelEntity> {
        const newChannel = await ChannelEntity.create({ name, desc }).save();
        return newChannel;
    }

    @UseMiddleware(isAuthenticated, isAdmin)
    @Mutation(() => Boolean, {})
    async deleteChannel (
        @Arg('id')
        id: number,
        @Ctx()
        { redis }: MyContext
    ): Promise<boolean> {
        const redChannel = await redis.get(`${ RED_SINGLE_CHANNEL }:${ id }`);

        const channel = redChannel ? parse(redChannel) : await ChannelEntity.findOne(id);

        if (!channel) {
            throw new ErrorResponse('Resource does not exits', 404);
        }

        if (redChannel) {
            await redis.del(`${ RED_SINGLE_CHANNEL }:${ id }`);
        }

        getConnection().transaction(async tn => {
            await tn.query(`
                DELETE FROM message_entity 
                WHERE "channelId" = ${ channel.id }
            ` );

            await tn.query(`
                DELETE FROM channel_entity
                WHERE id = ${ channel.id }
            `);
        });

        return true;
    }
}
