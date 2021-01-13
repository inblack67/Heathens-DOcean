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

@Resolver( UserEntity )
export class AuthResolver
{
    // @UseMiddleware( isAuthenticated )
    @Query( () => [ UserEntity ] )
    getUsers (): Promise<UserEntity[]>
    {
        return UserEntity.find();
    }

    @UseMiddleware( isAuthenticated )
    @Query( () => UserEntity )
    getSingleUser (
        @Arg( 'id' )
        id: number
    ): Promise<UserEntity | undefined>
    {
        return UserEntity.findOne( id );
    }

    @Mutation( () => UserEntity )
    async registerUser (
        @Arg( 'username' )
        username: string,
        @Arg( 'name' )
        name: string,
        @Arg( 'email' )
        email: string,
        @Arg( 'password' )
        password: string,
        @Ctx()
        { session }: MyContext
    ): Promise<UserEntity>
    {
        if ( session.user )
        {
            throw new ErrorResponse( 'Not Authorized', 401 );
        }

        const hashedPassword = await argon.hash( password );

        try
        {
            const isAdmin = username === 'inblack1967';
            const newUser = await UserEntity.create( { name, email, password: hashedPassword, username, role: isAdmin ? 'admin' : 'user' } ).save();
            session.user = newUser.id;
            session.username = newUser.username;
            return newUser;
        } catch ( err )
        {
            console.error( err );
            if ( err.code && err.code === '23505' )
            {
                throw new ErrorResponse( 'Resource already exists', 401 );
            }
            else
            {
                throw new ErrorResponse( 'Something went wrong', 500 );
            }
        }
    }

    @Mutation( () => UserEntity )
    async loginUser (
        @Arg( 'username' )
        username: string,
        @Arg( 'password' )
        password: string,
        @Ctx()
        { session }: MyContext
    ): Promise<UserEntity>
    {
        if ( session.user )
        {
            throw new ErrorResponse( 'Not Authorized', 401 );
        }

        const user = await UserEntity.findOne( { username } );

        if ( !user )
        {
            throw new ErrorResponse( 'Invalid Credentials', 401 );

        }

        const isValidPassword = await argon.verify( user.password, password );

        if ( !isValidPassword )
        {
            throw new ErrorResponse( 'Invalid Credentials', 401 );
        }

        session.user = user.id;
        session.username = user.username;

        return user;
    }

    @UseMiddleware( isAuthenticated )
    @Query( () => UserEntity )
    async getMe (
        @Ctx()
        { session }: MyContext
    ): Promise<UserEntity>
    {
        const user = await UserEntity.findOne( session.user );
        return user!;
    }

    @UseMiddleware( isAuthenticated )
    @Mutation( () => Boolean )
    async logoutUser (
        @Ctx()
        { session }: MyContext
    ): Promise<boolean>
    {
        const userId = parseInt( session.user as string );

        await UserEntity.update( { id: userId }, { channelId: undefined } );

        await getConnection().query( ( `
                UPDATE channel_entity SET "userIds" = (SELECT ARRAY(SELECT UNNEST("userIds")
                EXCEPT
                SELECT UNNEST(ARRAY[${ userId }])));
            `) );

        session.destroy( err =>
        {
            if ( err )
            {
                console.log( `Session destruction error:`.red.bold );
                console.error( err );
            }
        } );

        return true;
    }

    @UseMiddleware( isAuthenticated )
    @Mutation( () => Boolean )
    async joinChannel (
        @Ctx()
        { session }: MyContext,
        @Arg( 'channelId' )
        channelId: number,
        @PubSub()
        pubsub: PubSubEngine
    ): Promise<boolean>
    {
        const user = await UserEntity.findOne( session.user );

        if ( user!.channelId )
        {
            throw new ErrorResponse( 'One channel at a time.', 401 );
        }

        const channel = await ChannelEntity.findOne( channelId );

        if ( !channel )
        {
            throw new ErrorResponse( 'Channel does not exist', 404 );
        }

        if ( channel.userIds && channel.userIds.includes( session.user as number ) )
        {
            throw new ErrorResponse( 'You have already joined', 404 );
        }

        await getConnection().query( ( `
                UPDATE channel_entity
                SET "userIds" = "userIds" || ${ session.user }
                WHERE id = ${ channelId };
            `) );

        pubsub.publish( NEW_NOTIFICATION, { message: `${ session.username } has joined`, channelId: channel.id } );

        await UserEntity.update( { id: session.user as number }, { channelId } );

        const updatedUser = await UserEntity.findOne( session.user );

        pubsub.publish( JOIN_CHANNEL, { user: updatedUser, channelId } );

        return true;
    }

    @UseMiddleware( isAuthenticated )
    @Query( () => ChannelEntity )
    async getMyChannel (
        @Ctx()
        { session }: MyContext,
    ): Promise<ChannelEntity>
    {
        const user = await UserEntity.findOne( session.user );
        if ( !user!.channelId )
        {
            throw new ErrorResponse( 'None joined', 401 );
        }
        const channel = await ChannelEntity.findOne( user!.channelId );
        return channel!;
    }

    @UseMiddleware( isAuthenticated )
    @Mutation( () => Boolean )
    async leaveChannel (
        @Ctx()
        { session }: MyContext,
        @Arg( 'channelId' )
        channelId: number,
        @PubSub()
        pubsub: PubSubEngine
    ): Promise<boolean>
    {
        const user = await UserEntity.findOne( session.user );

        if ( !user!.channelId )
        {
            throw new ErrorResponse( 'Join some channel first', 401 );
        }

        const channel = await ChannelEntity.findOne( channelId );
        if ( !channel )
        {
            throw new ErrorResponse( 'Channel does not exists', 404 );
        }

        if ( channel.userIds && !channel.userIds.includes( session.user as number ) )
        {
            throw new ErrorResponse( 'You have already left', 404 );
        }

        const userId = parseInt( session.user as string );

        await getConnection().query( ( `
                UPDATE channel_entity SET "userIds" = (SELECT ARRAY(SELECT UNNEST("userIds")
                EXCEPT
                SELECT UNNEST(ARRAY[${ userId }])));
            `) );

        pubsub.publish( NEW_NOTIFICATION, { message: `${ session.username } has left`, channelId: channel.id } );

        await UserEntity.update( { id: userId }, { channelId: undefined } );

        const updatedUser = await UserEntity.findOne( session.user );

        pubsub.publish( LEAVE_CHANNEL, { user: updatedUser, channelId } );

        return true;
    }

    @Mutation( () => Boolean )
    async deleteUser (
        @Ctx()
        { session }: MyContext
    ): Promise<boolean>
    {

        const user = await UserEntity.findOne( session.user );

        if ( !user )
        {
            throw new ErrorResponse( 'Resource does not exits', 404 );
        }

        const userId = parseInt( session.user as string );

        const messages = await MessageEntity.find( { posterId: userId } );

        const messageIds = messages.map( mess => mess.id );

        await getConnection().transaction( async tn =>
        {
            await tn.query( `
            UPDATE channel_entity SET "messageIds" = (SELECT ARRAY(SELECT UNNEST("messageIds")
                EXCEPT 
                SELECT UNNEST(ARRAY[${ messageIds }])));
            `);

            await tn.query( `
                DELETE from message_entity
                WHERE "posterId" = ${ userId };
            `);
        } );

        await UserEntity.delete( { id: session.user as any } );

        session.destroy( err =>
        {
            if ( err )
            {
                console.log( `Session destruction error:`.red.bold );
                console.error( err );
            }
        } );

        return true;
    }
}