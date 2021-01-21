import { MessageEntity } from "../entities/Message";
import { Arg, Ctx, Field, FieldResolver, Mutation, ObjectType, PubSub, PubSubEngine, Query, Resolver, Root, UseMiddleware } from "type-graphql";
import { isAuthenticated } from "../middlewares/protect";
import { ErrorResponse } from "../utils/ErrorResponse";
import { MyContext } from "../utils/types";
import { ChannelEntity } from "../entities/Channel";
import { UserEntity } from "../entities/User";
import { getConnection } from "typeorm";
import { NEW_MESSAGE, REMOVED_MESSAGE } from "../utils/topics";
import { decryptMe, encryptMe } from "../utils/encryption";
import crypto from 'crypto';


@ObjectType()
export class PaginatedMessages {
    @Field(() => [ MessageEntity ])
    messages: MessageEntity[];
    @Field()
    hasMore: boolean;
}

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
        { session }: MyContext,
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
    @Query(() => PaginatedMessages, {})
    async getChannelMessages (
        @Arg('channelId')
        channelId: number,
        @Arg('limit')
        limit: number,
        @Ctx()
        { session }: MyContext,
        @Arg('cursor', { nullable: true })
        cursor?: string,
    ): Promise<PaginatedMessages> {

        const channel = await ChannelEntity.findOne(channelId);

        if (!channel) {
            throw new ErrorResponse('Channel does not exists', 401);
        }

        const userId = session.user!.id;
        if (!channel.userIds.includes(userId)) {
            throw new ErrorResponse('You have to join the channel first', 401);
        }

        // at max 10 messages
        const realLimit = Math.min(10, limit);

        // for hasMore
        const reaLimitPlusOne = realLimit + 1;

        const replacements: any[] = [ reaLimitPlusOne ];

        if (cursor) {
            replacements.push(new Date(parseInt(cursor)));
        }

        const messages: MessageEntity[] = await getConnection().query(
            `
                SELECT * FROM message_entity 
                WHERE "channelId" = ${ channelId } 
                ${ cursor ? `AND "createdAt" < $2` : `` }
                ORDER BY "createdAt" DESC
                LIMIT $1;
            `,
            replacements
        );

        messages.forEach(mess => {
            mess.content = decryptMe(mess.content, mess.ivString);
        });

        return {
            messages: messages.slice(0, realLimit),
            hasMore: messages.length === reaLimitPlusOne // even the extra one came along => hasMore => true
        };
    }

    @UseMiddleware(isAuthenticated)
    @Mutation(() => Boolean, {})
    async deleteMessage (
        @Arg('id')
        id: number,
        @Ctx()
        { session }: MyContext,
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

        const channel = await ChannelEntity.findOne(message.channelId);

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
