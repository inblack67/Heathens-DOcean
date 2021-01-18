import { MessageEntity } from "../entities/Message";
import { Arg, Ctx, FieldResolver, Mutation, PubSub, PubSubEngine, Query, Resolver, Root, UseMiddleware } from "type-graphql";
import { isAuthenticated } from "../middlewares/protect";
import { ErrorResponse } from "../utils/ErrorResponse";
import { MyContext } from "../utils/types";
import { ChannelEntity } from "../entities/Channel";
import { UserEntity } from "../entities/User";
import { getConnection } from "typeorm";
import { NEW_MESSAGE, REMOVED_MESSAGE } from "../utils/topics";
import { decryptMe, encryptMe } from "../utils/encryption";
import crypto from 'crypto';
import { customSort } from "../utils/utilities";
import { RED_CHANNEL_MESSAGES, RED_SINGLE_CHANNEL } from "../utils/redisKeys";
import { parse, stringify } from "flatted";

@Resolver(MessageEntity)
export class MessageResolver {
    @FieldResolver(() => ChannelEntity, {})
    channel (
        @Root()
        message: MessageEntity,
        @Ctx()
        { channelLoader }: MyContext,
    ): Promise<ChannelEntity> {
        return channelLoader.load(message.channelId);
    }

    @FieldResolver(() => UserEntity, {})
    poster (
        @Root()
        message: MessageEntity,
        @Ctx()
        { usersLoader }: MyContext,
    ): Promise<UserEntity> {
        return usersLoader.load(message.posterId);
    }


    @UseMiddleware(isAuthenticated)
    @Mutation(() => MessageEntity, {})
    async postMessage (
        @Arg('content')
        content: string,
        @Arg('channelId')
        channelId: number,
        @Ctx()
        { session, }: MyContext,
        @PubSub()
        pubsub: PubSubEngine
    ): Promise<MessageEntity> {
        const channel = await ChannelEntity.findOne(channelId);
        if (!channel) {
            throw new ErrorResponse('Resource does not exits', 404);
        }

        const userId = session.user!.id;

        if (!channel.userIds || !channel.userIds.includes(userId)) {
            throw new ErrorResponse('You must join the channel first', 404);
        }

        const iv = crypto.randomBytes(16);
        var ivString = iv.toString('hex').slice(0, 16);
        const encryptedMessage = encryptMe(content, ivString);
        const newMessage = await MessageEntity.create({ content: encryptedMessage, posterId: userId, channelId, ivString }).save();
        await getConnection().query((`
                UPDATE channel_entity
                SET "messageIds" = "messageIds" || ${ newMessage.id }
                WHERE id = ${ channelId }
            `));

        await pubsub.publish(NEW_MESSAGE, newMessage);

        return newMessage;
    }

    @UseMiddleware(isAuthenticated)
    @Query(() => [ MessageEntity ], {})
    async getChannelMessages (
        @Arg('channelId')
        channelId: number,
        @Ctx()
        { session, redis }: MyContext
    ): Promise<MessageEntity[]> {
        console.time('getChannelMessages');
        const redChannel = await redis.get(`${ RED_SINGLE_CHANNEL }:${ channelId }`);

        const channel = redChannel ? parse(redChannel) : await ChannelEntity.findOne(channelId);

        if (!channel) {
            throw new ErrorResponse('Channel does not exists', 401);
        }

        if (!redChannel) {
            await redis.set(`${ RED_SINGLE_CHANNEL }:${ channel }`, stringify(channel));
        }

        const userId = session.user!.id;
        if (!channel.userIds.includes(userId)) {
            throw new ErrorResponse('You have to join the channel first', 401);
        }

        const redChannelMessages = await redis.lrange(`${ RED_CHANNEL_MESSAGES }:${ channelId }`, 0, -1);

        const parsedRedChannelMessages = redChannelMessages.map(mess => parse(mess));

        const messages = redChannelMessages.length > 0 ? parsedRedChannelMessages : await MessageEntity.find({ channelId });

        if (redChannelMessages.length < 0) {
            const stringifiedMessages = messages.map(mess => stringify(mess));
            await redis.lpush(`${ RED_CHANNEL_MESSAGES }:${ channelId }`, ...stringifiedMessages);
        }

        const sortedMessages = customSort<MessageEntity[]>(messages as MessageEntity[]) as MessageEntity[];

        sortedMessages.forEach(mess => {
            mess.content = decryptMe(mess.content, mess.ivString);
        });

        console.timeEnd('getChannelMessages');

        return sortedMessages;
    }

    @UseMiddleware(isAuthenticated)
    @Mutation(() => Boolean, {})
    async deleteMessage (
        @Arg('id')
        id: number,
        @Ctx()
        { session, redis }: MyContext,
        @PubSub()
        pubsub: PubSubEngine
    ): Promise<boolean> {
        const message = await MessageEntity.findOne(id);

        if (!message) {
            throw new ErrorResponse('Resource does not exits', 404);
        }

        const userId = session.user!.id;

        if (message.posterId !== userId) {
            throw new ErrorResponse('Not Authorized', 400);
        }

        const redChannel = await redis.get(`${ RED_SINGLE_CHANNEL }:${ message.channelId }`);

        const channel = redChannel ? parse(redChannel) : await ChannelEntity.findOne(message.channelId);

        if (!redChannel) {
            await redis.set(`${ RED_SINGLE_CHANNEL }:${ message.channelId }`, stringify(channel));
        }


        if (!channel!.userIds.includes(message.posterId)) {
            throw new ErrorResponse('You must join the channel first', 404);
        }

        await getConnection().transaction(async tn => {
            await tn.query((`
                UPDATE channel_entity SET "messageIds" = (SELECT ARRAY(SELECT UNNEST("messageIds")
                EXCEPT
                SELECT UNNEST(ARRAY[${ message.id }])))
                WHERE id = ${ message.channelId };
            `));

            await tn.query(`
                DELETE FROM message_entity
                WHERE id = ${ message.id };
            `);

        });
        await pubsub.publish(REMOVED_MESSAGE, message);

        return true;
    }
}
