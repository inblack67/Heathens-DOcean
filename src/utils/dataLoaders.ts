import DataLoader from 'dataloader';
import { ChannelEntity } from '../entities/Channel';
import { MessageEntity } from '../entities/Message';
import { UserEntity } from '../entities/User';
import { decryptMe } from './encryption';
import { customSort } from './utilities';

export const channelLoader = () => new DataLoader<number, ChannelEntity>(async (ids) => {
    const channels = await ChannelEntity.findByIds(ids as number[]);
    const channelsWithIds: Record<number, ChannelEntity> = {};
    channels.forEach(channel => channelsWithIds[ channel.id ] = channel);
    return ids.map(id => channelsWithIds[ id ]);
});


export const messagesLoader = () => new DataLoader<number, MessageEntity>(async (ids) => {
    const messages = await MessageEntity.findByIds(ids as number[]);
    const sortedMessages = customSort<MessageEntity[]>(messages, 'asc') as MessageEntity[];

    sortedMessages.forEach(mess => {
        mess.content = decryptMe(mess.content, mess.ivString);
    });

    const messagesWithIds: Record<number, MessageEntity> = {};
    sortedMessages.forEach(message => messagesWithIds[ message.id ] = message);
    return ids.map(id => messagesWithIds[ id ]);
});

export const usersLoader = () => new DataLoader<number, UserEntity>(async (ids) => {
    const users = await UserEntity.findByIds(ids as number[]);
    const usersWithIds: Record<number, UserEntity> = {};
    users.forEach(user => usersWithIds[ user.id ] = user);
    return ids.map(id => usersWithIds[ id ]);
});
