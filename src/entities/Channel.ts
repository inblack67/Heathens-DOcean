import { Field, ObjectType } from "type-graphql";
import { Entity, Column, CreateDateColumn, BaseEntity, PrimaryGeneratedColumn, OneToMany } from "typeorm";
import { MessageEntity } from "./Message";
import { UserEntity } from './User';

@ObjectType()
@Entity()
export class ChannelEntity extends BaseEntity
{
    @Field( () => Number )
    @PrimaryGeneratedColumn()
    id!: number;

    @Field( () => String )
    @Column( { unique: true } )
    name!: string;

    @Field( () => String )
    @Column()
    desc!: string;

    @OneToMany( () => UserEntity, user => user.channel, { nullable: true } )
    @Field( () => [ UserEntity ], { nullable: true } )
    users: UserEntity[] | null;

    @Column( 'int', { nullable: true, array: true } )
    userIds: number[];

    @Column( 'int', { nullable: true, array: true } )
    messageIds: number[];

    @OneToMany( () => MessageEntity, message => message.channel, { nullable: true } )
    @Field( () => [ MessageEntity ], { nullable: true } )
    messages: MessageEntity[] | null;

    @Field( () => String )
    @CreateDateColumn()
    createdAt: Date;
}