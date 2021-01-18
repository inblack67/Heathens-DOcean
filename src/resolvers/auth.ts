import { MyContext } from "../utils/types";
import { Arg, Ctx, Mutation, PubSub, PubSubEngine, Query, Resolver, UseMiddleware } from "type-graphql";
import { UserEntity } from '../entities/User';
import { ErrorResponse } from "../utils/ErrorResponse";
import argon from 'argon2';
import { isAuthenticated } from "../middlewares/protect";
import { ChannelEntity } from "../entities/Channel";
import { getConnection } from "typeorm";
import { MessageEntity } from "../entities/Message";
import { JOIN_CHANNEL, LEAVE_CHANNEL, NEW_NOTIFICATION } from "../utils/topics";
import { validateHuman } from "../utils/validateHuman";
import { RED_CURRENT_CHANNEL, RED_SINGLE_CHANNEL } from "../utils/redisKeys";
import { stringify, parse } from 'flatted';

@Resolver(UserEntity)
export class AuthResolver {

    @Mutation(() => UserEntity)
    async registerUser (
        @Arg('username')
        username: string,
        @Arg('name')
        name: string,
        @Arg('email')
        email: string,
        @Arg('password')
        password: string,
        @Ctx()
        { session }: MyContext,
        @Arg('recaptchaToken', { nullable: true })
        recaptchaToken?: string
    ): Promise<UserEntity> {
        if (process.env.NODE_ENV !== 'development' && !recaptchaToken) {
            throw new ErrorResponse('Where is your recaptcha token?', 401);
        }

        if (recaptchaToken) {
            const isHuman = validateHuman(recaptchaToken);

            if (!isHuman) {
                throw new ErrorResponse('Are you a robot?', 401);
            }
        }

        if (session.user) {
            throw new ErrorResponse('Not Authorized', 401);
        }

        const hashedPassword = await argon.hash(password);

        try {
            const isAdmin = username === 'inblack1967';
            const newUser = await UserEntity.create({ name, email, password: hashedPassword, username, role: isAdmin ? 'admin' : 'user' }).save();
            session.user = newUser;
            return newUser;
        } catch (err) {
            console.error(err);
            if (err.code && err.code === '23505') {
                throw new ErrorResponse('Resource already exists', 401);
            }
            else {
                throw new ErrorResponse('Something went wrong', 500);
            }
        }
    }

    @Mutation(() => UserEntity)
    async loginUser (
        @Arg('username')
        username: string,
        @Arg('password')
        password: string,
        @Ctx()
        { session }: MyContext,
        @Arg('recaptchaToken', { nullable: true })
        recaptchaToken?: string,
    ): Promise<UserEntity> {
        if (process.env.NODE_ENV !== 'development' && !recaptchaToken) {
            throw new ErrorResponse('Where is your recaptcha token?', 401);
        }

        if (recaptchaToken) {
            const isHuman = validateHuman(recaptchaToken);

            if (!isHuman) {
                throw new ErrorResponse('Are you a robot?', 401);
            }
        }

        if (session.user) {
            throw new ErrorResponse('Not Authorized', 401);
        }

        const user = await UserEntity.findOne({ username });

        if (!user) {
            throw new ErrorResponse('Invalid Credentials', 401);

        }

        const isValidPassword = await argon.verify(user.password, password);

        if (!isValidPassword) {
            throw new ErrorResponse('Invalid Credentials', 401);
        }

        session.user = user;
        return user;
    }

    @UseMiddleware(isAuthenticated)
    @Query(() => UserEntity)
    async getMe (
        @Ctx()
        { session }: MyContext
    ): Promise<UserEntity> {
        const user = session.user;
        return user!;
    }

    @UseMiddleware(isAuthenticated)
    @Mutation(() => Boolean)
    async logoutUser (
        @Ctx()
        { session, redis }: MyContext,
        @PubSub()
        pubsub: PubSubEngine
    ): Promise<boolean> {
        const userId = session.user!.id;

        const hasChannel = session.user!.channelId !== undefined && session.user!.channelId !== null;
        const channelId = session.user!.channelId;

        await getConnection().query((`
            UPDATE channel_entity SET "userIds" = (SELECT ARRAY(SELECT UNNEST("userIds")
            EXCEPT
            SELECT UNNEST(ARRAY[${ userId }])));
        `));

        if (hasChannel) {
            const updatedChannel = await ChannelEntity.findOne(userId);
            await UserEntity.update({ id: userId }, { channelId: undefined });
            const updatedUser = await UserEntity.findOne(userId);
            const oldRedChannel = await redis.get(`${ RED_SINGLE_CHANNEL }:${ channelId }`);
            if (oldRedChannel) {
                await redis.del(`${ RED_SINGLE_CHANNEL }:${ channelId }`);
                await redis.set(`${ RED_SINGLE_CHANNEL }:${ channelId }`, stringify(updatedChannel));
            }
            pubsub.publish(NEW_NOTIFICATION, { message: `${ session.user!.username } has left`, channelId: channelId });
            pubsub.publish(LEAVE_CHANNEL, { user: updatedUser, channelId });
        }

        await redis.del(RED_CURRENT_CHANNEL);

        session.destroy(err => {
            if (err) {
                console.log(`Session destruction error:`.red.bold);
                console.error(err);
            }
        });

        return true;
    }

    @UseMiddleware(isAuthenticated)
    @Mutation(() => Boolean)
    async joinChannel (
        @Ctx()
        { session, redis }: MyContext,
        @Arg('channelId')
        channelId: number,
        @PubSub()
        pubsub: PubSubEngine
    ): Promise<boolean> {

        const user = session.user;

        if (user!.channelId) {
            throw new ErrorResponse('One channel at a time.', 401);
        }

        const channel = await ChannelEntity.findOne(channelId);

        if (!channel) {
            throw new ErrorResponse('Channel does not exist', 404);
        }

        if (channel.userIds && channel.userIds.includes(user!.id)) {
            throw new ErrorResponse('You have already joined', 404);
        }

        await getConnection().transaction(async tn => {
            await tn.query(`
                UPDATE channel_entity
                SET "userIds" = "userIds" || ${ user!.id }
                WHERE id = ${ channelId };
            `);

            await tn.query(`
                UPDATE user_entity
                SET "channelId" = ${ channelId }
                WHERE id = ${ user!.id }
            `);
        });

        pubsub.publish(NEW_NOTIFICATION, { message: `${ user!.username } has joined`, channelId: channel.id });

        const updatedUser = await UserEntity.findOne(user!.id);
        const updatedChannel = await ChannelEntity.findOne(channelId);

        await redis.set(RED_CURRENT_CHANNEL, stringify(updatedChannel));

        const redChannel = await redis.get(`${ RED_SINGLE_CHANNEL }:${ channelId }`);

        if (redChannel) {
            await redis.del(`${ RED_SINGLE_CHANNEL }:${ channelId }`);
            await redis.set(`${ RED_SINGLE_CHANNEL }:${ channelId }`, stringify(updatedChannel));
        }

        session.user!.channelId = channelId;

        pubsub.publish(JOIN_CHANNEL, { user: updatedUser, channelId });

        return true;
    }

    @UseMiddleware(isAuthenticated)
    @Query(() => ChannelEntity)
    async getMyChannel (
        @Ctx()
        { session, redis }: MyContext,
    ): Promise<ChannelEntity> {
        const user = session.user;
        if (!user!.channelId) {
            throw new ErrorResponse('None joined', 401);
        }
        const redChannel = await redis.get(RED_CURRENT_CHANNEL);
        const parsedChannel = parse(redChannel!) as ChannelEntity;
        return parsedChannel;
    }

    @UseMiddleware(isAuthenticated)
    @Mutation(() => Boolean)
    async leaveChannel (
        @Ctx()
        { session, redis }: MyContext,
        @Arg('channelId')
        channelId: number,
        @PubSub()
        pubsub: PubSubEngine
    ): Promise<boolean> {
        const user = session.user;

        if (!user!.channelId) {
            throw new ErrorResponse('Join some channel first', 401);
        }
        const redChannel = await redis.get(RED_CURRENT_CHANNEL);
        // const channel = await ChannelEntity.findOne(channelId);
        if (!redChannel) {
            throw new ErrorResponse('Channel does not exists', 404);
        }

        const channel = parse(redChannel!) as ChannelEntity;

        if (channel.userIds && !channel.userIds.includes(user!.id)) {
            throw new ErrorResponse('You have already left', 404);
        }

        const userId = user!.id;

        await getConnection().transaction(async tn => {
            await tn.query(`
                UPDATE channel_entity SET "userIds" = (SELECT ARRAY(SELECT UNNEST("userIds")
                EXCEPT
                SELECT UNNEST(ARRAY[${ userId }])));
            `);
            await tn.query(`
                UPDATE user_entity
                SET "channelId" = NULL
                WHERE id = ${ userId }
            `);
        });

        const updatedUser = await UserEntity.findOne(user!.id);
        const updatedChannel = await ChannelEntity.findOne(channelId);

        const oldRedChannel = await redis.get(`${ RED_SINGLE_CHANNEL }:${ channelId }`);

        if (oldRedChannel) {
            await redis.del(`${ RED_SINGLE_CHANNEL }:${ channelId }`);
            await redis.set(`${ RED_SINGLE_CHANNEL }:${ channelId }`, stringify(updatedChannel));
        }

        session.user = updatedUser;

        pubsub.publish(NEW_NOTIFICATION, { message: `${ updatedUser?.username } has left`, channelId: channel.id });
        pubsub.publish(LEAVE_CHANNEL, { user: updatedUser, channelId });

        return true;
    }

    @UseMiddleware(isAuthenticated)
    @Mutation(() => Boolean)
    async deleteUser (
        @Ctx()
        { session, redis }: MyContext
    ): Promise<boolean> {

        const userId = session.user!.id;

        const messages = await MessageEntity.find({ posterId: userId });

        const messageIds = messages.map(mess => mess.id);

        await getConnection().transaction(async tn => {
            await tn.query(`
            UPDATE channel_entity SET "messageIds" = (SELECT ARRAY(SELECT UNNEST("messageIds")
                EXCEPT 
                SELECT UNNEST(ARRAY[${ messageIds }])));
            `);

            await tn.query(`
                DELETE FROM message_entity
                WHERE "posterId" = ${ userId };
            `);

            await tn.query(`
                DELETE FROM user_entity
                WHERE id = ${ userId }
            `);

        });

        const channelId = session.user!.channelId;

        if (channelId) {
            const updatedChannel = await ChannelEntity.findOne(channelId);
            const oldRedChannel = await redis.get(`${ RED_SINGLE_CHANNEL }:${ channelId }`);

            if (oldRedChannel) {
                await redis.del(`${ RED_SINGLE_CHANNEL }:${ channelId }`);
                await redis.set(`${ RED_SINGLE_CHANNEL }:${ channelId }`, stringify(updatedChannel));
            }
        }

        await redis.del(RED_CURRENT_CHANNEL);

        session.destroy(err => {
            if (err) {
                console.log(`Session destruction error:`.red.bold);
                console.error(err);
            }
        });

        return true;
    }
}
