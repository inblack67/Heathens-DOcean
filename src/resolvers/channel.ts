import { ErrorResponse } from "../utils/ErrorResponse";
import { Arg, Ctx, FieldResolver, Mutation, Query, Resolver, Root, UseMiddleware, Subscription } from "type-graphql";
import { ChannelEntity } from '../entities/Channel';
import { isAdmin, isAuthenticated } from "../middlewares/protect";
import { MyContext } from "../utils/types";
import { UserEntity } from "../entities/User";
import { MessageEntity } from "../entities/Message";
import { getConnection } from "typeorm";
import { JOIN_CHANNEL, LEAVE_CHANNEL, NEW_MESSAGE, NEW_NOTIFICATION, REMOVED_MESSAGE } from "../utils/topics";

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
    async getChannels (): Promise<ChannelEntity[]> {
        const channels = await ChannelEntity.find();
        return channels;
    }

    @UseMiddleware(isAuthenticated)
    @Query(() => ChannelEntity, { nullable: true, })
    async getSingleChannel (
        @Arg('id')
        id: number
    ): Promise<ChannelEntity | undefined> {
        const channel = await ChannelEntity.findOne(id);

        if (!channel) {
            throw new ErrorResponse('Resource does not exits', 404);
        }

        return channel;
    }

    @UseMiddleware(isAuthenticated)
    @Query(() => [ UserEntity ], { nullable: true, })
    async getChannelUsers (
        @Arg('channelId')
        channelId: number,
        @Ctx()
        { usersLoader }: MyContext
    ): Promise<(UserEntity | Error)[]> {
        const channel = await ChannelEntity.findOne(channelId);

        if (!channel) {
            throw new ErrorResponse('Resource does not exits', 404);
        }
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
        id: number
    ): Promise<boolean> {
        const channel = await ChannelEntity.findOne(id);

        if (!channel) {
            throw new ErrorResponse('Resource does not exits', 404);
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
